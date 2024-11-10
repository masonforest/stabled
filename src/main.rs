use bitcoin::{key::Secp256k1, Address, Network, PrivateKey, PublicKey};
use dotenv::dotenv;
use rust_decimal::Decimal;
use rustls_acme::{caches::DirCache, AcmeConfig};
use serde_json::json;
use tokio::spawn;
use sqlx::postgres::PgPoolOptions;
use stable::{
    bitcoin::rpc,
    constants::{Env, ENV, LETS_ENCRYPT_DOMAINS, LETS_ENCRYPT_EMAILS, PORT},
    db,
};
use std::{env, net::Ipv6Addr, path::PathBuf, str::FromStr};
use tokio_stream::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenv().ok();
    env_logger::init();
    let pub_key = PublicKey::from_private_key(
        &Secp256k1::new(),
        &PrivateKey::from_wif("cShLrjxRPcbAKUhG2tzbjvY8dpgbA24QpyyWfqXcSDtxmKxuX5AY").unwrap(),
    );
    let x = Address::p2wpkh(&(pub_key.try_into().unwrap()), Network::Testnet);
    println!("{}", x.to_string());
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new().connect(&database_url).await?;
    let app = stable::app(pool.clone()).await;
    stable::db::initialize(&pool).await?;
    // let block_hash = hex::decode("00000000000000000000a54a5c49d330ccbd050e511c13d62b26dd52f7881067").unwrap().try_into().unwrap();
    // let block = stable::bitcoin::rpc::get_block(block_hash, db::get_hot_wallets(&pool).await?).await;
    let deposits = rpc::decode_deposits(
        vec![
            &json!({"hex": "0200000000010106e8325fa37c8d81ffadea6aead7447f7585b52cf758393ec09cb95dbeaffa950000000000ffffffff01e803000000000000220020ffad8cbc224eaa82f113328ad817b13a4a85ad958c25dd69c73fd99baa3ec8170247304402203bca7874f2b948a9038d2dabbad467369e0de1244fb9e7e9a426f9313590492c0220030dde6d764b9f9621b002211ef7f86da0331bae580912393dbb60f6e8b2e5c801210251eaa172d52c30f9c389009dd907a13f64057908fe3c4b71106d1e59627c0b3100000000"}),
        ],
        &db::get_hot_wallets(&pool).await?,
    );
    let block = stable::bitcoin::Block {
        deposits,
        ..Default::default()
    };
    // stable::db::insert_bitcoin_block(
    //     &pool,
    //     block,
    //     stable::exchange_rates::bitcoin().await.unwrap(),
    // )
    //     .await
    //     .unwrap();
    spawn({
        let pool = pool.clone();
        async move {
            stable::bitcoin::poller::run(pool).await;
        }
    });
    // println!("{}", Decimal::new(1000, 8));
    // println!(
    //     "{:?}",
    //     stable::bitcoin::rpc::send_to_address(
    //         bitcoin::Address::from_str("36sTjLr6VTRfF5MQGTH3BVVeDH17aEwQQW")
    //             .unwrap()
    //             .require_network(Network::Bitcoin)
    //             .unwrap(),
    //         1000
    //     )
    //     .await
    // );
    let addr = (Ipv6Addr::UNSPECIFIED, *PORT);
    if matches!(*ENV, Env::Production) {
        let mut state = AcmeConfig::new(LETS_ENCRYPT_DOMAINS.clone())
            .contact(LETS_ENCRYPT_EMAILS.iter().map(|e| format!("mailto:{}", e)))
            .cache_option(Some(DirCache::new(PathBuf::from(".ssl"))))
            .directory_lets_encrypt(matches!(*ENV, Env::Production))
            .state();
        let acceptor = state.axum_acceptor(state.default_rustls_config());

        tokio::spawn(async move {
            loop {
                match state.next().await.unwrap() {
                    Ok(ok) => println!("event: {:?}", ok),
                    Err(err) => println!("error: {:?}", err),
                }
            }
        });
        axum_server::bind(addr.into())
            .acceptor(acceptor)
            .serve(app.into_make_service())
            .await
            .unwrap();
    } else {
        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?
    };
    Ok(())
}
