use axum::{Router, http::uri::Uri, response::Redirect, routing::get};
use axum_extra::extract::Host;
use dotenv::dotenv;
use rustls_acme::{AcmeConfig, caches::DirCache};
use stable::constants::{ENV, Env, LETS_ENCRYPT_DOMAINS, LETS_ENCRYPT_EMAILS, PORT};
use std::{net::Ipv6Addr, path::PathBuf};
use tokio_stream::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("Starting server");
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");
    dotenv().ok();
    env_logger::init();

    let app = stable::app().await;

    println!("Listening on port {}", PORT.to_string());
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
            let http_app = Router::new()
                .route("/", get(http_handler))
                .route("/{*any}", get(http_handler));
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
async fn http_handler(Host(hostname): Host, uri: Uri) -> Redirect {
    let mut parts = uri.into_parts();
    parts.scheme = Some("https".parse().unwrap());
    parts.authority = Some(hostname.parse().unwrap());

    Redirect::permanent(&Uri::from_parts(parts).unwrap().to_string())
}
