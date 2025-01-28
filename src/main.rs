use axum::http::uri::Uri;
use axum::response::Redirect;
use axum::routing::get;
use axum::Router;
use bitcoin::{key::Secp256k1, Address, Network, PrivateKey, PublicKey};
use dotenv::dotenv;
use rustls_acme::{caches::DirCache, AcmeConfig};
use sqlx::postgres::PgPoolOptions;
use stable::constants::{Env, ENV, LETS_ENCRYPT_DOMAINS, LETS_ENCRYPT_EMAILS, PORT};
use stable::AppState;
use std::sync::Arc;
use std::{env, net::Ipv6Addr, path::PathBuf};
use tokio::spawn;
use tokio::sync::Mutex;
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
    let app_state = AppState {
        pool: Arc::new(Mutex::new(pool.clone())),
        update_channel: Arc::new(Mutex::new(
            tokio::sync::broadcast::channel::<stable::Address>(1000000),
        )),
    };
    stable::db::initialize(&pool.clone()).await?;
    spawn({
        async move {
            stable::bitcoin::poller::run(app_state.clone()).await;
        }
    });
    println!("PORT: {}", PORT.to_string());
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
        tokio::spawn(async move {
            let http_addr = (Ipv6Addr::UNSPECIFIED, 80);
            let http_app = Router::new().route("/{*any}", get(http_handler));
            axum_server::bind(http_addr.into())
                .serve(http_app.into_make_service())
                .await
                .unwrap();
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

async fn http_handler(uri: Uri) -> Redirect {
    let mut parts = uri.into_parts();
    parts.scheme = Some("https".parse().unwrap());

    Redirect::temporary(&Uri::from_parts(parts).unwrap().to_string())
}
