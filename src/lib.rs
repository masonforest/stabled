mod address;
pub mod bitcoin;
pub mod constants;
pub mod db;
mod error;
pub mod exchange_rates;
pub mod transaction;

use crate::address::Address;
use crate::{
    error::Error,
    transaction::{TokenType, Transfer, Withdraw},
};
use ::bitcoin::Network;
use axum::{
    body::Bytes,
    extract::State,
    http::{header, method::Method},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(test)]
use k256::ecdsa::SigningKey;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use sqlx::PgPool;
use std::str::FromStr;
use tower_http::cors::{Any, CorsLayer};

pub async fn app(pool: PgPool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST]);

    Router::new()
        .route("/transactions", post(insert_transaction))
        .route("/balances/:token_type/:address", get(get_balance))
        .route("/utxos/:address", get(get_utxos))
        .layer(cors)
        .with_state(pool)
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct Account {
    nonce: i64,
    balances: Vec<(TokenType, i64)>,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
enum Transaction {
    Transfer(Transfer),
    Withdraw(Withdraw),
}
impl Transaction {
    #[cfg(test)]
    fn sign(&self, signing_key: &SigningKey) -> SignedTransaction {
        let (signature, recovery_id) = signing_key
            .sign_recoverable(&borsh::to_vec(&self).unwrap())
            .unwrap();
        let signature_bytes: [u8; 65] = [signature.to_bytes().as_slice(), &[recovery_id.to_byte()]]
            .concat()
            .try_into()
            .unwrap();
        SignedTransaction(self.clone(), signature_bytes)
    }
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct SignedTransaction(Transaction, pub [u8; 65]);

impl SignedTransaction {
    pub fn from_address(&self) -> Address {
        let s: [u8; 64] = self.1[0..64].try_into().unwrap();
        let signature = Signature::from_bytes(&s.into()).unwrap();
        let recovery_id = RecoveryId::from_byte(self.1[64]).unwrap();
        VerifyingKey::recover_from_msg(&borsh::to_vec(&self.0).unwrap(), &signature, recovery_id)
            .unwrap()
            .try_into()
            .unwrap()
    }
}

pub async fn insert_transaction(
    State(pool): State<PgPool>,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    let transaction: SignedTransaction = borsh::from_slice(&body.to_vec()).map_err(Error::from)?;
    db::insert_transaction(&pool, transaction.clone()).await?;
    match transaction.0 {
        Transaction::Withdraw(ref withdraw) => {
            let transaction_id = bitcoin::rpc::send_to_address(
                ::bitcoin::Address::from_str(&withdraw.to_bitcoin_address)
                    .map_err(Error::from)?
                    .require_network(Network::Bitcoin)
                    .map_err(Error::from)?,
                db::current_value_in_satoshis(&pool, &withdraw.token_type, withdraw.value).await?,
            )
            .await;
            Ok(borsh::to_vec(&transaction_id)
                .map_err(Error::from)
                .into_response())
        }
        _ => Ok(vec![].into_response()),
    }
    // Ok(borsh::to_vec(&[0u8; 32].to_vec()).map_err(Error::from)
    // .into_response())
}

async fn get_balance(
    State(pool): State<PgPool>,
    axum::extract::Path((token_type, address)): axum::extract::Path<(String, String)>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(borsh::to_vec(
        &db::get_balance(
            &pool,
            Address(hex::decode(&address).map_err(Error::from)?.try_into()?),
            TokenType::from_str(&token_type)?,
        )
        .await?,
    )
    .map_err(Error::from)
    .into_response())
}

async fn get_utxos(
    State(pool): State<PgPool>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(borsh::to_vec(
        &db::get_utxos(
            &pool,
            Address(
                hex::decode(&address)
                    .map_err(Error::from)?
                    .try_into()
                    .unwrap(),
            )
        )
        .await?,
    )
    .map_err(Error::from)
    .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::address::Address;
    use crate::transaction::{TokenType, Transfer};
    use ::bitcoin::consensus::Decodable;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use borsh::from_slice;
    use http_body_util::BodyExt;
    use httpmock::MockServer;
    use k256::ecdsa::{SigningKey, VerifyingKey};
    use lazy_static::lazy_static;
    use rust_decimal::Decimal;
    use secp256k1::rand::rngs::OsRng;
    use serde_json::json;
    use sqlx::PgPool;
    use std::collections::HashMap;

    use std::env;
    use std::fs::File;
    use std::io::Read;
    use tower::ServiceExt;

    lazy_static! {
        pub static ref ALICES_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
        pub static ref ALICE: Address = VerifyingKey::from(ALICES_SECRET_KEY.clone())
            .try_into()
            .unwrap();
        pub static ref ALICES_BITCOIN_ADDRESS: String =
            "36sTjLr6VTRfF5MQGTH3BVVeDH17aEwQQW".to_string();
        pub static ref BOBS_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
        pub static ref BOB: Address = VerifyingKey::from(BOBS_SECRET_KEY.clone())
            .try_into()
            .unwrap();
        pub static ref BURNS_SECRET_KEY: SigningKey = SigningKey::from_bytes(
            &<Vec<u8> as TryInto<[u8; 32]>>::try_into(
                hex::decode("7ec7f76e604b31d95acfd2d87dec745913b8eeb56a3d20517bf3456b349b319e")
                    .unwrap()
            )
            .unwrap()
            .into()
        )
        .unwrap();
        pub static ref BURNS: Address = VerifyingKey::from(BURNS_SECRET_KEY.clone())
            .try_into()
            .unwrap();
        pub static ref TEST_UTXO: ([u8; 32], i32) = {
            (
                hex::decode("40efa774a75deb504f1f9f58c4f272d1b185bd274347de2681ff77637af55bec")
                    .unwrap()
                    .try_into()
                    .unwrap(),
                0,
            )
        };
    }
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

    #[sqlx::test]
    async fn transfer(pool: PgPool) {
        db::credit(&pool, *ALICE, TokenType::Usd, 10000)
            .await
            .unwrap();
        let transaction = Transaction::Transfer(Transfer {
            nonce: 0,
            token_type: TokenType::Usd,
            to: (*BOB).0,
            value: 10000,
        });
        let signed_transaction = transaction.sign(&ALICES_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let request = Request::builder()
            .method("GET")
            .uri(format!("/balances/usd/{}", hex::encode((*ALICE).0)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();

        assert_eq!(from_slice::<i64>(&body).unwrap(), 0);

        let request = Request::builder()
            .method("GET")
            .uri(format!("/balances/usd/{}", hex::encode((*BOB).0)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();

        assert_eq!(from_slice::<i64>(&body).unwrap(), 10000);
    }

    #[sqlx::test]
    async fn withdraw(pool: PgPool) {
        let server = MockServer::start();
        let bitcoin_rpc_mock =
            server.mock(|when, then| {
                when.method("POST")
                    .body(
                        json!({
                            "jsonrpc": "1.0",
                            "method": "sendtoaddress",
                            "params": [
                                ALICES_BITCOIN_ADDRESS.to_string(),
                                Decimal::new(7078, 8)
                            ]
                        })
                        .to_string(),
                    )
                    .path("/");
                then.status(200)
                .header("content-type", "text/json; charset=UTF-8")
                .body(json!({
                    "error": null,
                    "result": "0000000000000000000000000000000000000000000000000000000000000000"
                }).to_string());
            });
        env::set_var("BITCOIND_URL", server.url(""));
        db::credit(&pool, *ALICE, TokenType::Usd, 10000)
            .await
            .unwrap();
        db::insert_bitcoin_block(
            &pool,
            bitcoin_block!("deposit-block-877380.block"),
            HashMap::from([(TokenType::Usd, (70783.11129211668 * 1000.0) as u64)]),
        )
        .await
        .unwrap();
        let transaction = Transaction::Withdraw(Withdraw {
            nonce: 0,
            to_bitcoin_address: ALICES_BITCOIN_ADDRESS.clone(),
            token_type: TokenType::Usd,
            value: 10000,
        });
        let signed_transaction = transaction.sign(&ALICES_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        // let body = response.into_body().collect().await.unwrap().to_bytes();
        // println!("{:?}", body);
        assert_eq!(response.status(), StatusCode::OK);
        bitcoin_rpc_mock.assert();

        let request = Request::builder()
            .method("GET")
            .uri(format!("/balances/usd/{}", hex::encode((*ALICE).0)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();

        assert_eq!(from_slice::<i64>(&body).unwrap(), 0);
    }
}
