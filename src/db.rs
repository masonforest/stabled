use crate::error::Result;
use crate::Account;
use crate::Borrow;
use crate::transaction::TokenType;
use crate::address::Address;
use crate::transaction::Signed;
use crate::Transaction;
use sqlx::Row;
use sqlx::{query, Executor, Postgres};

#[cfg(test)]
pub async fn deposit<E>(pool: E, address: Address, token_type: TokenType, starting_balance: i64) -> Result<()>
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

pub async fn insert_transaction<E>(pool: E, transaction: Signed<Transaction>) -> Result<()>
where
    E: Executor<'static, Database = Postgres>,
{
    query("INSERT into transactions (nonce, token_type, debtor_id, creditor_id, value) VALUES ($1, $2, account_id($3), account_id($4), $5)")
        .bind(transaction.0.nonce)
        .bind(&transaction.0.token_type)
        .bind(transaction.0.to)
        .bind(transaction.from_address())
        .bind(transaction.0.value)
        .execute(pool)
        .await.unwrap();
    Ok(())
}

pub async fn borrow<E>(pool: E, borrow: Signed<Borrow>) -> Result<()>
where
    E: Executor<'static, Database = Postgres>,
{
    query("INSERT into transactions (nonce, token_type, debtor_id, creditor_id, value) VALUES ($1, 'usd', usd_liability_account(), account_id($2), $3)")
        .bind(borrow.0.nonce)
        .bind(borrow.from_address())
        .bind(borrow.0.value)
        .execute(pool)
        .await.unwrap();
    Ok(())
}

pub async fn get_account<'a, E>(pool: E, address: Address) -> Result<Account>
where
E: Executor<'a, Database = Postgres> + Clone,
{
    let row = query("SELECT id, nonce FROM accounts where address = $1").bind(address).fetch_one(pool.clone()).await?;
    Ok(
        Account {
            nonce: row.get::<i64, _>("nonce"),
            balances: get_balances(pool.clone(),address).await?,
        }
    )
}

// impl FromRow<'_, PgRow> for (TokenType, i64) {
//     fn from_row(row: &PgRow) -> sqlx::Result<Self> {
//         Ok((
//             row.get("token_type"),
//             row.get("value")
//          ) )
//     }
// }


pub async fn get_balances<'a, E>(pool: E, address: Address) -> Result<Vec<(TokenType, i64)>>
where
E: Executor<'a, Database = Postgres>,
{
    Ok(
        query("SELECT * FROM balances WHERE account_id= account_id($1)")
            .bind(address)
            .fetch_all(pool).await?.into_iter().map(
                |row|
                (
                TokenType::Usd,
                row.get::<i64, &str>("value")
                )).collect()

    )
}