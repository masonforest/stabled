use crate::{
    address::Address,
    bitcoin::{multi_sig, Block, Deposit},
    constants::{NODE_ADDRESS, PUBLIC_IP, PUBLIC_KEY, SYSTEM_ADDRESS},
    error::Result,
    transaction::TokenType,
    Account, SignedTransaction, Transaction,
};
use bitcoin::Network;
use log::info;
use sqlx::{query, Executor, Postgres, Row};
use std::{net::IpAddr, str::FromStr};

#[cfg(test)]
pub async fn credit<E>(
    pool: E,
    address: Address,
    token_type: TokenType,
    starting_balance: i64,
) -> Result<()>
where
    E: Executor<'static, Database = Postgres>,
{
    query("INSERT into balances (account_id, token_type, value) VALUES (account_id($1), $2, $3)")
        .bind(address)
        .bind(token_type)
        .bind(starting_balance)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_transaction<'a, E>(pool: E, transaction: SignedTransaction) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let (to, nonce, transaction_id) = match transaction.0 {
        Transaction::Transfer(ref transfer) => (
            transfer.to,
            transfer.nonce,
            insert_transfer(
                pool.clone(),
                &transfer.token_type,
                transaction.from_address(),
                transfer.to,
                transfer.value,
            )
            .await?,
        ),
    };
    insert_signature(pool, transaction_id, to, nonce, transaction.1).await?;

    Ok(())
}
pub async fn insert_transfer<'a, E>(
    pool: E,
    token_type: &TokenType,
    payor: [u8; 33],
    recipient: [u8; 33],
    value: i64,
) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    // println!("{}", hex::encode(&payor));
    // println!("{}", hex::encode(&recipient));
    // println!("{}", value);

    query(
        "INSERT into ledger (token_type, payor_id, recipient_id, value)
        VALUES ($1, account_id($2), account_id($3), $4)
        RETURNING id",
    )
    .bind(&token_type)
    .bind(payor)
    .bind(recipient)
    .bind(value)
    .fetch_one(pool)
    .await
    .map(|row| row.get("id"))
}

pub async fn insert_signature<'a, E>(
    pool: E,
    transaction_id: i64,
    account: Address,
    nonce: i64,
    signature: [u8; 65],
) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    query(
        "INSERT into signatures (transaction_id, account_id, nonce, signature)
        VALUES ($1, account_id($2), $3, $4)",
    )
    .bind(transaction_id)
    .bind(account)
    .bind(nonce)
    .bind(signature)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn insert_bitcoin_block<'a, E>(pool: E, bitcoin_block: Block, bitcoin_exchange_rate: i64) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let bitcoin_block_id: i32 =
        query("INSERT into bitcoin_blocks (hash, height) VALUES ($1, $2) RETURNING id")
            .bind(bitcoin_block.hash)
            .bind(bitcoin_block.height)
            .fetch_one(pool.clone())
            .await
            .unwrap()
            .get("id");
    query("INSERT into blocks (bitcoin_block_id, bitcoin_exchange_rate) VALUES ($1, $2)")
            .bind(bitcoin_block_id)
            .bind(bitcoin_exchange_rate)
            .execute(pool.clone())
            .await
            .unwrap();
    for deposit in bitcoin_block.deposits {
        insert_deposit(
            pool.clone(),
            bitcoin_block_id,
            bitcoin_exchange_rate,
            &deposit,
        )
        .await?;
    }
    Ok(())
}

pub async fn insert_deposit<'a, E>(
    pool: E,
    bitcoin_block_id: i32,
    bitcoin_exchange_rate: i64,
    deposit: &Deposit,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    insert_transfer(
        pool.clone(),
        &TokenType::Usd,
        SYSTEM_ADDRESS,
        *NODE_ADDRESS,
        satoshis_to_cents(deposit.value, bitcoin_exchange_rate),
    )
    .await?;
    insert_transfer(
        pool.clone(),
        &TokenType::Usd,
        *NODE_ADDRESS,
        deposit.depositor,
        satoshis_to_cents(deposit.value, bitcoin_exchange_rate),
    )
    .await?;
    query("INSERT into deposits (bitcoin_block_id, bitcoin_transaction_hash) VALUES ($1, $2)")
        .bind(bitcoin_block_id)
        .bind(deposit.transaction_hash)
        .execute(pool)
        .await?;

    Ok(())
}

pub fn satoshis_to_cents(
    satoshis: i64,
    bitcoin_exchange_rate: i64,
) -> i64 {
    satoshis * bitcoin_exchange_rate / 100000
}

// pub async fn get_account<'a, E>(pool: E, address: Address) -> Result<Account>
// where
//     E: Executor<'a, Database = Postgres> + Clone,
// {
//     let row = query("SELECT id, nonce FROM accounts where address = $1")
//         .bind(address)
//         .fetch_one(pool.clone())
//         .await?;
//     Ok(Account {
//         nonce: row.get::<i64, _>("nonce"),
//         balances: get_balances(pool.clone(), address).await?,
//     })
// }

pub async fn initialize<'a, E>(pool: E) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let peers = get_peers(pool.clone()).await?;

    if peers.len() == 0 {
        info!("Initializing with peers {:?}", *PUBLIC_IP);
        insert_peer(pool.clone(), *PUBLIC_IP, true).await?;
        println!("{:?}", multi_sig::address(1, vec![*PUBLIC_KEY]).await);
        insert_hot_wallet(pool, multi_sig::address(1, vec![*PUBLIC_KEY]).await).await?;
    };
    Ok(())
}

pub async fn insert_hot_wallet<'a, E>(pool: E, address: bitcoin::Address) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    query("INSERT into hot_wallets (address) VALUES ($1)")
        .bind(address.to_string())
        .execute(pool)
        .await
        .unwrap();
    Ok(())
}

pub async fn get_hot_wallets<'a, E>(pool: E) -> Result<Vec<bitcoin::Address>>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    Ok(query("SELECT address FROM hot_wallets")
        .fetch_all(pool.clone())
        .await?
        .into_iter()
        .map(|x| {
            bitcoin::Address::from_str(x.get::<_, &str>("address"))
                .unwrap()
                .require_network(Network::Bitcoin)
                .unwrap()
        })
        .collect())
}

pub async fn insert_peer<'a, E>(pool: E, address: IpAddr, is_self: bool) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    query("INSERT into peers (address, is_self) VALUES ($1, $2)")
        .bind(address)
        .bind(is_self)
        .execute(pool)
        .await
        .unwrap();
    Ok(())
}

pub async fn get_peers<'a, E>(pool: E) -> Result<Vec<IpAddr>>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    Ok(query("SELECT address FROM peers")
        .fetch_all(pool.clone())
        .await?
        .into_iter()
        .map(|x| x.get("address"))
        .collect())
}

pub async fn get_best_block_hash<'a, E>(pool: E) -> Result<Option<[u8; 32]>>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let rows = query(
        "SELECT hash FROM bitcoin_blocks where height = (SELECT MAX(height) FROM bitcoin_blocks)",
    )
    .fetch_all(pool.clone())
    .await?;

    if rows.is_empty() {
        Ok(None)
    } else {
        Ok(rows
            .first()
            .unwrap()
            .get::<Option<Vec<u8>>, &str>("hash")
            .map(|v| v.try_into().unwrap()))
    }
}

pub async fn get_balance<'a, E>(pool: E, address: Address, token_type: TokenType) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(
        query("SELECT COALESCE((SELECT value FROM balances WHERE account_id = account_id($1) and token_type = $2), 0) as value")
            .bind(address)
            .bind(token_type)
            .fetch_one(pool)
            .await?
            .get("value")
            // .into_iter()
            // .map(|row| (TokenType::Usd, row.get::<i64, &str>("value")))
            // .collect(),
    )
}
#[cfg(test)]
pub async fn test_get_balance<'a, E>(pool: E, address: Address, token_type: TokenType) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(
        query("SELECT value FROM balances WHERE account_id = account_id($1) AND token_type = $2 limit 1")
            .bind(address)
            .bind(token_type)
            .fetch_one(pool)
            .await?
            .get("value"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{bitcoin, tests::ALICE};
    use sqlx::PgPool;

    #[sqlx::test]
    async fn test_insert_bitcoin_block(pool: PgPool) {
        insert_bitcoin_block(
            &pool,
            bitcoin::Block {
                deposits: vec![bitcoin::Deposit {
                    depositor: *ALICE,
                    transaction_hash: [0; 32],
                    value: 1000,
                }],
                ..Default::default()
            },
            (70783.11129211668 * 100.0 ) as i64
        )
        .await
        .unwrap();

        assert_eq!(get_balance(&pool, *ALICE, TokenType::Usd).await.unwrap(), 70783)

    }
}
