mod db;
mod error;
mod transaction;
mod address;

use crate::error::Error;
use crate::transaction::Transaction;
use crate::transaction::Signed;
use crate::transaction::Signable;
use axum::body::Bytes;
use crate::transaction::TokenType;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{
    http::{header, method::Method},
    routing::post,
    Router,
};
use borsh::{BorshDeserialize, BorshSerialize};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};

pub async fn app(pool: PgPool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST]);

    Router::new()
        .route("/transactions", post(insert_transaction))
        .route("/accounts/:address", get(get_account))
        .layer(cors)
        .with_state(pool)
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
struct Account {
    nonce: i64,
    balances: Vec<(TokenType, i64)>
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Borrow {
    pub nonce: i64,
    pub value: i64,
}
impl Signable for Borrow {}


#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
enum Action{
    Transact(Signed<Transaction>),
    Borrow(Signed<Borrow>)
}

pub async fn insert_transaction(
    State(pool): State<PgPool>,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    let action = borsh::from_slice(&body.to_vec()).map_err(Error::from)?; 

    match action {
        Action::Transact(transaction) => 
        db::insert_transaction(
        &pool,
        transaction,
    ).await?,
        Action::Borrow(borrow) => db::borrow(
        &pool,
        borrow,
    ).await?
    
    }
    Ok(vec![])
}


impl IntoResponse for Account {
    fn into_response(self) -> axum::response::Response {
        borsh::to_vec(&self).map_err(Error::from).into_response()
    }
}

async fn get_account(
    State(pool): State<PgPool>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(db::get_account(&pool, address::from_str(&address)?).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transaction::TokenType;
    use crate::transaction::Transaction;
    use axum::{
        body::Body,
        http::Request,
        http::StatusCode
    };
    use borsh::from_slice;
    use http_body_util::BodyExt;
    use k256::ecdsa::SigningKey;
    use k256::ecdsa::VerifyingKey;
    use crate::transaction::Signable;
    use lazy_static::lazy_static;
    use secp256k1::rand::rngs::OsRng;
    use sqlx::PgPool;
    use tower::ServiceExt;

    lazy_static! {
        static ref ALICES_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
        static ref ALICE: [u8; 33] = VerifyingKey::from(ALICES_SECRET_KEY.clone())
            .to_sec1_bytes()
            .to_vec()
            .try_into()
            .unwrap();
        static ref BOBS_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
        static ref BOB: [u8; 33] = VerifyingKey::from(BOBS_SECRET_KEY.clone())
            .to_sec1_bytes()
            .to_vec()
            .try_into()
            .unwrap();
    }

    #[sqlx::test]
    async fn transfer(pool: PgPool) {
        db::deposit(&pool, *ALICE, TokenType::Usd, 10000).await.unwrap();
        let transaction = Transaction {
            nonce: 0,
            token_type: TokenType::Usd,
            to: *BOB,
            value: 10000,
        };
        let signed_transaction = transaction.sign(&ALICES_SECRET_KEY.clone());

        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&Action::Transact(signed_transaction)).unwrap()))
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let request = Request::builder()
            .method("GET")
            .uri(format!("/accounts/{}", address::to_str(*ALICE)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let account = from_slice::<Account>(&body).unwrap();

        assert_eq!(account.balances[0].1, 0);
        
        let request = Request::builder()
            .method("GET")
            .uri(format!("/accounts/{}", address::to_str(*BOB)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let account = from_slice::<Account>(&body).unwrap();

        assert_eq!(account.balances[0].1, 10000);
    }

    #[sqlx::test]
    async fn borrow(pool: PgPool) {
        let borrow = Borrow {
            nonce: 0,
            value: 10000,
        };
        let signed_borrow = borrow.sign(&ALICES_SECRET_KEY.clone());

        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&Action::Borrow(signed_borrow)).unwrap()))
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        let body = response.into_body().collect().await.unwrap().to_bytes();
        println!("{}", std::str::from_utf8(&body).unwrap());


        // assert_eq!(response.status(), StatusCode::OK);

        let request = Request::builder()
            .method("GET")
            .uri(format!("/accounts/{}", address::to_str(*ALICE)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let account = from_slice::<Account>(&body).unwrap();

        assert_eq!(account.balances[0].1, 10000);
    }
}

