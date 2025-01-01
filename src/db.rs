use crate::address::script_buf_to_address;
use crate::{
    address::Address,
    bitcoin::multi_sig,
    constants::{NODE_ADDRESS, PUBLIC_IP, PUBLIC_KEY, SYSTEM_ADDRESS},
    error::Result,
    transaction::TokenType,
    SignedTransaction, Transaction,
};
use borsh::BorshSerialize;
use bitcoin::BlockHash;
use bitcoin::Network;
use bitcoin::TxOut;
use log::info;
use sqlx::{query, Executor, Postgres, Row};
use std::collections::HashMap;
use sqlx::query_as;
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
    let (account, nonce, transaction_id) = match transaction.0 {
        Transaction::Transfer(ref transfer) => (
            transaction.from_address(),
            transfer.nonce,
            insert_transfer(
                pool.clone(),
                &transfer.token_type,
                transaction.from_address(),
                Address(transfer.to),
                transfer.value,
            )
            .await?,
        ),
        Transaction::Withdraw(ref transfer) => (
            transaction.from_address(),
            transfer.nonce,
            burn(pool.clone(), transaction.from_address(), transfer.value).await?,
        ),
    };
    insert_signature(pool, transaction_id, account, nonce, transaction.1).await?;

    Ok(())
}
pub async fn burn<'a, E>(pool: E, payor: Address, value: i64) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    Ok(insert_transfer(pool.clone(), &TokenType::Usd, payor, SYSTEM_ADDRESS, value).await?)
}
pub async fn insert_transfer<'a, E>(
    pool: E,
    token_type: &TokenType,
    payor: Address,
    recipient: Address,
    value: i64,
) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
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

#[derive(sqlx::FromRow, sqlx::Type, BorshSerialize)]
pub struct Utxo {
    transaction_id: Vec<u8>,
    vout: i32,
    value: i64,
}
pub async fn redeem_utxo<'a, E>(
    pool: E,
    address: Address,
    transaction_id: [u8; 32],
    vout: i32,
    token_type: TokenType,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let maybe_utxo: Option<Utxo> = sqlx::query_as!(
        Utxo,
        "UPDATE utxos SET redeemed = true
        WHERE
        account_id = account_id($1) AND transaction_id = $2 AND vout = $3 AND redeemed = false
        RETURNING transaction_id, vout, value",
        &address.0,
        &transaction_id,
        vout
    )
    .fetch_optional(pool.clone())
    .await?;

    if let Some(utxo) = maybe_utxo {
        query(
            "INSERT into ledger (token_type, payor_id, recipient_id, value)
            VALUES ($1, account_id($2), account_id($3), current_value($1, $4))",
        )
        .bind(&token_type)
        .bind(*NODE_ADDRESS)
        .bind(address)
        .bind(utxo.value)
        .execute(pool)
        .await?;
    } else {
        return Err(crate::Error::Error(
            "Utxo doesn't exisit for this address or has already been redeemed".to_string(),
        ));
    }

    Ok(())
}

pub async fn current_value_in_satoshis<'a, E>(
    pool: E,
    token_type: &TokenType,
    value: i64,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query("SELECT current_value($1, $2) as value")
        .bind(token_type)
        .bind(value)
        .fetch_one(pool)
        .await?
        .get::<i64, _>("value"))
}
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
pub async fn insert_bitcoin_block<'a, E>(
    pool: E,
    block: ::bitcoin::Block,
    exchange_rates: HashMap<TokenType, u64>,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let bitcoin_block_id: i32 =
        query("INSERT into bitcoin_blocks (hash, height) VALUES ($1, $2) RETURNING id")
            .bind::<[u8; 32]>(<BlockHash as AsRef<[u8; 32]>>::as_ref(&block.block_hash())
            .iter()
            .copied()
            .rev()
            .collect::<Vec<_>>().try_into().unwrap())
            .bind(block.bip34_block_height().unwrap() as i64)
            .fetch_one(pool.clone())
            .await
            .unwrap()
            .get("id");
    query("INSERT into blocks (bitcoin_block_id) VALUES ($1)")
        .bind(bitcoin_block_id)
        .execute(pool.clone())
        .await
        .unwrap();
    for (token_type, exchange_rate) in exchange_rates {
        insert_exchange_rate(pool.clone(), token_type, exchange_rate).await?;
    }
    let deposit_utxos: Vec<((bitcoin::Txid, usize), TxOut)> = block
        .txdata
        .into_iter()
        .flat_map(|t| {
            t.output
                .clone()
                .into_iter()
                .enumerate()
                .map(move |(i, o)| ((t.compute_txid(), i), o.clone()))
        })
        .filter(|(_, output)| output.script_pubkey.is_p2wpkh())
        .filter(|(_, output)| crate::bitcoin::is_stable_address(&output.script_pubkey))
        .collect();

    for ((txid, vout), deposit_utxo) in deposit_utxos {
        insert_utxo(
            pool.clone(),
            script_buf_to_address(&deposit_utxo.script_pubkey),
            (*<bitcoin::Txid as AsRef<[u8; 32]>>::as_ref(&txid)
                .iter()
                .copied()
                .rev()
                .collect::<Vec<_>>())
            .try_into()
            .unwrap(),
            vout as i32,
            deposit_utxo.value.to_sat() as i64,
        )
        .await?;
    }

    Ok(())
}
pub async fn insert_exchange_rate<'a, E>(
    pool: E,
    token_type: TokenType,
    exchange_rate: u64,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query(
        "INSERT into exchange_rates (block_height, token_type, value) VALUES (current_block(), $1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(token_type)
    .bind(exchange_rate as i64)
    .execute(pool)
    .await
    .map(|_| ())?)
}
pub async fn insert_utxo<'a, E>(
    pool: E,
    stable_address: Address,
    txid: [u8; 32],
    vout: i32,
    value: i64,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres>,
{
    query(
        "INSERT into utxos (block_height, account_id, transaction_id, vout, value) VALUES (current_block(), account_id($1), $2, $3, $4)",
    )
    .bind(stable_address.0)
    .bind(txid)
    .bind(vout)
    .bind(value)
    .execute(pool)
    .await
    .map(|_| ())?;
    // use std::{thread, time};
    // thread::sleep(time::Duration::from_secs(3000));
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
    )
}
pub async fn get_utxos<'a, E>(pool: E, address: Address) -> Result<Vec<Utxo>>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(
        query_as("SELECT * from utxos WHERE account_id = account_id($1)")
            .bind(address)
            .fetch_all(pool).await?.into_iter().collect()
    )
}
#[cfg(test)]
pub async fn test_get_balance<'a, E>(
    pool: E,
    address: Address,
    token_type: TokenType,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query(
        "SELECT value FROM balances WHERE account_id = account_id($1) AND token_type = $2 limit 1",
    )
    .bind(address)
    .bind(token_type)
    .fetch_one(pool)
    .await?
    .get("value"))
}

#[cfg(test)]
macro_rules! bitcoin_block {
    ($file_name:expr) => {{
        let mut file = File::open(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/test_data/",
            $file_name
        ))
        .unwrap();
        let mut data = Vec::new();
        file.read_to_end(&mut data).unwrap();

        ::bitcoin::Block::consensus_decode(&mut &data[..]).unwrap()
    }};
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::tests::{BURNS, TEST_UTXO};
    use ::bitcoin::consensus::Decodable;
    use sqlx::PgPool;
    use std::fs::File;
    use std::io::Read;

    #[sqlx::test]
    async fn test_redeem_utxo(pool: PgPool) {
        db::credit(&pool, *NODE_ADDRESS, TokenType::Usd, i32::MAX as i64)
            .await
            .unwrap();
        let block = bitcoin_block!("deposit-block-877380.block");
        insert_bitcoin_block(
            &pool,
            block,
            HashMap::from([(TokenType::Usd, (70783.11129211668 * 1000.0) as u64)]),
        )
        .await
        .unwrap();
        redeem_utxo(&pool, *BURNS, TEST_UTXO.0, TEST_UTXO.1, TokenType::Usd)
            .await
            .unwrap();
        assert_eq!(
            get_balance(&pool, *BURNS, TokenType::Usd).await.unwrap(),
            70783
        )
    }
}
