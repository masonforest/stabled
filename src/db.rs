use crate::error::Result;
// use bitcoin::{BlockHash, Network};
use sqlx::{Executor, Postgres, query};

pub async fn insert_transaction<'a, E>(
    pool: E,
    block_number: i64,
    transaction_hash: [u8; 32],
    from: [u8; 20],
    to: [u8; 20],
    data: [u8; 32],
) -> Result<()>
where
    E: Executor<'a, Database = Postgres>,
{
    query(
        "INSERT into transfers (block_number, transaction_hash, \"from\", \"to\", data)
        VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(block_number)
    .bind(transaction_hash)
    .bind(from)
    .bind(to)
    .bind(data)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|err| err.into())
}

#[cfg(test)]
mod tests {

    // #[sqlx::test]
    // async fn test_insert_transaction(pool: PgPool) {
    // insert_transaction(&pool, [0; 20], [0; 20], [0; 32])
    //     .await
    //     .unwrap();
    // }
}
