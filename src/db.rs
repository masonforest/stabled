use crate::{
    address::{script_buf_to_address, Address},
    bitcoin::multi_sig,
    constants::{PUBLIC_IP, PUBLIC_KEY, SYSTEM_ADDRESS},
    error::Result,
    transaction::{self, Currency},
    SignedTransaction, Transaction,
};
use bitcoin::{BlockHash, Network, TxOut};
use log::info;
use sqlx::{query, query_as, Executor, Postgres, Row};
use std::{collections::HashMap, net::IpAddr, str::FromStr};

#[cfg(test)]
pub async fn credit<E>(
    pool: E,
    address: Address,
    currency: Currency,
    starting_balance: i64,
) -> Result<()>
where
    E: Executor<'static, Database = Postgres>,
{
    query("INSERT into balances (account_id, currency, value) VALUES (account_id($1), $2, $3)")
        .bind(address)
        .bind(currency)
        .bind(starting_balance)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_transaction<'a, E>(pool: E, transaction: SignedTransaction) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let transaction_id = match transaction.transaction.clone() {
        Transaction::Transfer(transaction::Transfer {
            currency,
            to: transaction::Address::Stable(to),
            value,
        }) => {
            insert_transfer(
                pool.clone(),
                transaction.from_address(),
                to,
                &currency,
                value,
            )
            .await?
        }
        Transaction::Transfer(transaction::Transfer {
            currency,
            to: transaction::Address::Bitcoin(_),
            value,
        }) => burn(pool.clone(), transaction.from_address(), currency, value).await?,
        Transaction::ClaimUtxo(ref claim_utxo_transaction) => {
            claim_utxo(
                pool.clone(),
                transaction.from_address(),
                claim_utxo_transaction.transaction_id,
                claim_utxo_transaction.vout,
                &claim_utxo_transaction.currency,
            )
            .await?
        },
        Transaction::CreateMagicLink(transaction::CreateMagicLink {
            currency,
            value,
            address,
        }) => insert_magic_link(pool.clone(), transaction.from_address(), address, &currency, value).await?,
        Transaction::RedeemMagicLink(transaction::RedeemMagicLink {
            address,
            ..
        }) => redeem_magic_link(
            pool.clone(),
            address,
            transaction.from_address()
        ).await?,
    };
    insert_signature(
        pool,
        transaction_id,
        transaction.from_address(),
        transaction.nonce,
        transaction.signature,
    )
    .await?;

    Ok(())
}
pub async fn burn<'a, E>(pool: E, payor: Address, currency: Currency, value: i64) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    Ok(insert_transfer(pool.clone(), payor, SYSTEM_ADDRESS, &currency, value).await?)
}
pub async fn insert_transfer<'a, E>(
    pool: E,
    payor: Address,
    recipient: Address,
    currency: &Currency,
    value: i64,
) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    query(
        "INSERT into ledger (payor_id, recipient_id, currency, value)
        VALUES (account_id($1), account_id($2), $3, $4)
        RETURNING id",
    )
    .bind(payor)
    .bind(recipient)
    .bind(&currency)
    .bind(value)
    .fetch_one(pool)
    .await
    .map(|row| row.get("id"))
}

pub async fn insert_magic_link<'a, E>(
    pool: E,
    payor: Address,
    address: Address,
    currency: &Currency,
    value: i64,
) -> sqlx::Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    query(
        "INSERT into accounts (is_magic_link, address)
        VALUES (TRUE, $1) RETURNING id",
    )
    .bind(address)
    .execute(pool.clone()).await?;
    insert_transfer(
        pool.clone(),
        payor,
        address,
        &currency,
        value,
    )
    .await
}

pub async fn redeem_magic_link<'a, E>(
    pool: E,
    address: Address,
    recipient: Address,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let is_magic_link: bool = query("SELECT accounts.is_magic_link FROM ledger
        JOIN accounts ON accounts.id = ledger.recipient_id
        WHERE accounts.address = $1")
        .bind(address)
        .fetch_one(pool.clone())
        .await?.get("is_magic_link");

        if !is_magic_link {
        return Err(crate::Error::Error(
            "This account is not a magic link account".to_string(),
        ));
        };
    let row = query("SELECT account_address(recipient_id) AS recipient, ledger.* FROM ledger
        JOIN accounts ON accounts.id = ledger.recipient_id
        WHERE accounts.address = $1")
        .bind(address)
        .fetch_one(pool.clone())
        .await?;
        

    insert_transfer(
        pool.clone(),
        row.get("recipient"),
        recipient,
        &row.get("currency"),
        row.get("value")

    ).await.map_err(crate::Error::from)
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

#[derive(sqlx::FromRow, sqlx::Type)]
pub struct Utxo {
    pub transaction_id: Vec<u8>,
    pub vout: i32,
    pub value: i64,
}
pub async fn claim_utxo<'a, E>(
    pool: E,
    address: Address,
    transaction_id: [u8; 32],
    vout: i32,
    currency: &Currency,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    // println!("{} {} {} {:?}", hex::encode(address.0), hex::encode(transaction_id), vout, currency);
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
        return Ok(query(
            "INSERT into ledger (currency, payor_id, recipient_id, value)
            VALUES ($1, system_address(), account_id($2), satoshis_to_currency($1, $3))
            RETURNING id",
        )
        .bind(&currency)
        // .bind(*NODE_ADDRESS)
        .bind(address)
        .bind(utxo.value)
        .fetch_one(pool)
        .await
        .map(|row| row.get("id"))?);
    } else {
        return Err(crate::Error::Error(
            "Utxo doesn't exisit for this address or has already been redeemed".to_string(),
        ));
    };
}

pub async fn currency_to_satoshis<'a, E>(pool: E, currency: &Currency, value: i64) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query("SELECT currency_to_satoshis($1, $2) as value")
        .bind(currency)
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
    exchange_rates: HashMap<Currency, f64>,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres> + Clone,
{
    let bitcoin_block_id: i32 =
        query("INSERT into bitcoin_blocks (hash, height) VALUES ($1, $2) RETURNING id")
            .bind::<[u8; 32]>(
                <BlockHash as AsRef<[u8; 32]>>::as_ref(&block.block_hash())
                    .iter()
                    .copied()
                    .rev()
                    .collect::<Vec<_>>()
                    .try_into()
                    .unwrap(),
            )
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
    for (currency, exchange_rate) in exchange_rates {
        insert_exchange_rate(pool.clone(), currency, exchange_rate).await?;
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
    currency: Currency,
    exchange_rate: f64,
) -> Result<()>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query(
        "INSERT into exchange_rates (block_height, currency, value) VALUES (current_block(), $1, $2 * currency_decimal_multiplier($1)) ON CONFLICT DO NOTHING",
    )
    .bind(currency)
    .bind(exchange_rate)
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

pub async fn get_currency_decimal_multipler<'a, E>(pool: E, currency: Currency) -> Result<i32>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query("SELECT currency_decimal_multipler($1)")
        .bind(currency)
        .fetch_one(pool)
        .await?
        .get("value"))
}

pub async fn get_balance<'a, E>(pool: E, address: Address, currency: Currency) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(
        query("SELECT COALESCE((SELECT value FROM balances WHERE account_id = account_id($1) and currency = $2), 0) as value")
            .bind(address)
            .bind(currency)
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
        query_as("SELECT * from utxos WHERE account_id = account_id($1) AND redeemed = false")
            .bind(address)
            .fetch_all(pool)
            .await?
            .into_iter()
            .collect(),
    )
}
#[cfg(test)]
pub async fn test_get_balance<'a, E>(pool: E, address: Address, currency: Currency) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(query(
        "SELECT value FROM balances WHERE account_id = account_id($1) AND currency = $2 limit 1",
    )
    .bind(address)
    .bind(currency)
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
    use crate::{
        constants::NODE_ADDRESS,
        db,
        tests::{BURNS, TEST_UTXO},
    };
    use ::bitcoin::consensus::Decodable;
    use sqlx::PgPool;
    use std::{fs::File, io::Read};

    #[sqlx::test]
    async fn test_claim_utxo(pool: PgPool) {
        db::credit(&pool, *NODE_ADDRESS, Currency::Usd, i32::MAX as i64)
            .await
            .unwrap();
        let block = bitcoin_block!("deposit-block-877380.block");
        insert_bitcoin_block(&pool, block, HashMap::from([(Currency::Usd, 100000f64)]))
            .await
            .unwrap();
        claim_utxo(&pool, *BURNS, TEST_UTXO.0, TEST_UTXO.1, &Currency::Usd)
            .await
            .unwrap();
        assert_eq!(get_balance(&pool, *BURNS, Currency::Usd).await.unwrap(), 100)
    }
}
