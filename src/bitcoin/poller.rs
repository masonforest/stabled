use self::super::rpc;
use crate::TokenType;
use crate::{db, exchange_rates};
use sqlx::PgPool;
use std::collections::HashMap;
use tokio::time;

pub async fn run(pool: PgPool) {
    let mut interval = time::interval(time::Duration::from_secs(1));
    loop {
        interval.tick().await;
        poll(pool.clone()).await;
    }
}

// #[memoize(TimeToLive: Duration::from_hours(24))]
// pub async fn poll(pool: PgPool) {
// }

pub async fn poll(pool: PgPool) {
    let current_best_block_hash = db::get_best_block_hash(&pool).await.unwrap();
    let new_best_block_hash = rpc::get_best_block_hash().await;

    if Some(new_best_block_hash) != current_best_block_hash {
        db::insert_bitcoin_block(
            &pool,
            rpc::get_block(new_best_block_hash).await,
            HashMap::from([(TokenType::Usd, exchange_rates::bitcoin().await.unwrap())]),
        )
        .await
        .unwrap();
    }
}
