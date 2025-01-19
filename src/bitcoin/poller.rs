use self::super::rpc;
use crate::{db, exchange_rates, Currency};
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

    if current_best_block_hash != Some(new_best_block_hash) {
        println!(
            "Inserting Bitcoin Block {}",
            hex::encode(new_best_block_hash)
        );
        use std::time::{SystemTime, UNIX_EPOCH};

        let start = SystemTime::now();
        let since_the_epoch = start
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");
        println!("{:?}", since_the_epoch);
        db::insert_bitcoin_block(
            &pool,
            rpc::get_block(new_best_block_hash).await,
            HashMap::from([(Currency::Usd, exchange_rates::bitcoin().await.unwrap())]),
        )
        .await
        .unwrap();
    }
}
