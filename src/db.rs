use crate::{
    address::Address,
    bitcoin::multi_sig,
    constants::{PUBLIC_IP, PUBLIC_KEY, SYSTEM_ADDRESS},
    error::{Error, Result},
    transaction::{self, Currency},
    SignedTransaction, Transaction,
};
use bitcoin::{BlockHash, Network};
use log::info;
use sqlx::PgConnection;
use sqlx::{query, query_as, Executor, PgPool, Postgres, Row};
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
pub async fn run_transaction(pool: PgPool, transaction: SignedTransaction) -> Result<i64> {
    let mut tx = pool.clone().begin().await.map_err(Error::from)?;
    let transaction_id = insert_transaction(&mut *tx, &transaction)
        .await
        .map_err(Error::from)?;

    match transaction.transaction.clone() {
        Transaction::Transfer(transaction::Transfer {
            to: transaction::Address::Stable(to),
            currency,
            value,
        }) => {
            insert_transfer(
                &mut *tx,
                transaction_id,
                transaction.from_address(),
                to,
                &currency,
                value,
            )
            .await?
        }
        Transaction::Transfer(transaction::Transfer {
            currency,
            to: transaction::Address::Bitcoin(bitcoin_address),
            value,
        }) => {
            burn(
                &mut *tx,
                transaction_id,
                transaction.from_address(),
                &currency,
                value,
            )
            .await?;
            let _bitcoin_transaction_id = crate::bitcoin::rpc::send_to_address(
                ::bitcoin::Address::from_str(&bitcoin_address)
                    .map_err(Error::from)?
                    .require_network(Network::Bitcoin)
                    .map_err(Error::from)?,
                currency_to_satoshis(&pool, &currency, value).await?,
            )
            .await;
            0
        }
        Transaction::ClaimUtxo(ref claim_utxo_transaction) => {
            claim_utxo(
                &mut *tx,
                transaction_id,
                transaction.from_address(),
                claim_utxo_transaction.transaction_id,
                claim_utxo_transaction.vout,
                &claim_utxo_transaction.currency,
            )
            .await?
        }

        Transaction::CreateCheck(transaction::CreateCheck {
            signer,
            currency,
            value,
        }) => insert_transfer(
            &mut *tx,
            transaction_id,
            transaction.from_address(),
            signer,
            &currency,
            value,
        )
        .await
        .map_err(crate::Error::from)?,
        Transaction::CashCheck(transaction::CashCheck {
            transaction_id: check_transaction_id,
            ..
        }) => {
            cash_check(
                &mut *tx,
                transaction.from_address(),
                transaction_id,
                check_transaction_id,
            )
            .await?
        }
    };
    tx.commit().await.map_err(Error::from)?;

    return Ok(transaction_id);
}
pub async fn burn<'a, E>(
    pool: E,
    transaction_id: i64,
    payor: Address,
    currency: &Currency,
    value: i64,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(insert_transfer(
        pool,
        transaction_id,
        payor,
        SYSTEM_ADDRESS,
        &currency,
        value,
    )
    .await?)
}

pub async fn insert_transaction<'a, E>(pool: E, transaction: &SignedTransaction) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    query(
        "INSERT into transactions (data)
        VALUES ($1)
        RETURNING id",
    )
    .bind(borsh::to_vec(transaction)?)
    .fetch_one(pool)
    .await
    .map(|row| row.get("id"))
    .map_err(crate::Error::from)
}

pub async fn insert_transfer<'a, E>(
    pool: E,
    transaction_id: i64,
    payor: Address,
    recipient: Address,
    currency: &Currency,
    value: i64,
) -> Result<i64>
where
    E: Executor<'a, Database = Postgres>,
{
    query(
        "INSERT into ledger (transaction_id, payor_id, recipient_id, currency, value)
        VALUES ($1, account_id($2), account_id($3), $4, $5)
        RETURNING id",
    )
    .bind(transaction_id)
    .bind(payor)
    .bind(recipient)
    .bind(&currency)
    .bind(value)
    .fetch_one(pool)
    .await
    .map(|row| row.get("id"))
    .map_err(crate::Error::from)
}

#[derive(sqlx::FromRow, sqlx::Type)]
pub struct Utxo {
    pub transaction_id: Vec<u8>,
    pub vout: i32,
    pub value: i64,
}

#[derive(sqlx::FromRow, sqlx::Type)]
pub struct LedgerEntry {
    pub payor: Vec<u8>,
    pub recipient: Vec<u8>,
    pub currency: Currency,
    pub value: i64,
}

pub async fn cash_check(
    conn: &mut PgConnection,
    recipient: Address,
    transaction_id: i64,
    check_transaction_id: i64,
) -> Result<i64> {
    let check = query(
        "SELECT account_address(recipient_id) AS recipient, ledger.* FROM ledger
        JOIN accounts ON accounts.id = ledger.recipient_id
        WHERE ledger.transaction_id = $1",
    )
    .bind(check_transaction_id)
    .fetch_one(&mut *conn)
    .await?;

    insert_transfer(
        &mut *conn,
        transaction_id,
        check.get("recipient"),
        recipient,
        &check.get("currency"),
        check.get("value"),
    )
    .await
    .map_err(crate::Error::from)
}

pub async fn claim_utxo(
    conn: &mut PgConnection,
    transaction_id: i64,
    address: Address,
    bitcoin_transaction_id: [u8; 32],
    vout: i32,
    currency: &Currency,
) -> Result<i64> {
    let maybe_utxo: Option<Utxo> = sqlx::query_as!(
                Utxo,
                "UPDATE utxos SET redeemed = true
                WHERE
                account_id = account_id($1) AND transaction_id = $2 AND vout = $3 AND redeemed = false
                RETURNING transaction_id, vout, value",
                &address.0,
                &bitcoin_transaction_id,
                vout
            )
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(utxo) = maybe_utxo {
        return Ok(query(
                            "INSERT into ledger (transaction_id, payor_id, recipient_id, currency, value)
                            VALUES ($1, system_address(), account_id($2), $3, satoshis_to_currency($3, $4))
                            RETURNING id",
                        )
                        .bind(transaction_id)
                        .bind(address)
                        .bind(&currency)
                        .bind(utxo.value)
                        .fetch_one(&mut *conn)
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
    deposit_utxos: Vec<(Utxo, Address)>,
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

    for (deposit_utxo, address) in deposit_utxos {
        insert_utxo(
            pool.clone(),
            address,
            (deposit_utxo.transaction_id).try_into().unwrap(),
            deposit_utxo.vout as i32,
            deposit_utxo.value,
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

pub async fn get_balance<'a, E>(pool: E, address: &Address, currency: &Currency) -> Result<i64>
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
pub async fn get_utxos<'a, E>(pool: E, address: &Address) -> Result<Vec<Utxo>>
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

pub async fn get_ledger_entry<'a, E>(pool: E, transaction_id: i64) -> Result<LedgerEntry>
where
    E: Executor<'a, Database = Postgres>,
{
    Ok(
        query_as("SELECT account_address(payor_id) as payor, account_address(recipient_id) as recipient, currency, value  from ledger WHERE transaction_id = $1")
            .bind(transaction_id)
            .fetch_one(pool)
            .await?
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
