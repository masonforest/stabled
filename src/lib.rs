mod address;
pub mod bitcoin;
pub mod constants;
pub mod db;
mod error;
pub mod exchange_rates;
pub mod transaction;

use crate::{
    address::Address,
    error::Error,
    transaction::{ClaimUtxo, Currency, Transfer},
};

use crate::transaction::{CashCheck, CreateCheck};
use askama::Template;
use axum::{
    body::Bytes,
    extract::State,
    http::{header, method::Method, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(test)]
use k256::ecdsa::SigningKey;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::{path::Path, process::Command, str::FromStr};
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
};

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    title: String,
    amount: Option<i64>,
}

pub async fn app(pool: PgPool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST]);

    Router::new()
        .route("/transactions", post(insert_transaction))
        .route("/balances/{currency}/{address}", get(get_balance))
        .route("/utxos/{address}", get(get_utxos))
        .route("/{transaction_id}", get(get_magic))
        .route("/images/{amount}", get(get_magic_image))
        .route("/", get(get_index))
        .nest_service("/assets", ServeDir::new("templates/assets"))
        .layer(cors)
        .with_state(pool)
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
pub struct Account {
    nonce: i64,
    balances: Vec<(Currency, i64)>,
}

#[derive(sqlx::FromRow, sqlx::Type, BorshSerialize)]
pub struct Utxo {
    transaction_id: [u8; 32],
    vout: i32,
    value: i64,
}

impl From<db::Utxo> for Utxo {
    fn from(utxo: db::Utxo) -> Self {
        Self {
            transaction_id: utxo.transaction_id.try_into().unwrap(),
            vout: utxo.vout,
            value: utxo.value,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
enum Transaction {
    ClaimUtxo(ClaimUtxo),
    CreateCheck(CreateCheck),
    CashCheck(CashCheck),
    Transfer(Transfer),
}
impl Transaction {
    #[cfg(test)]
    fn sign(&self, nonce: i64, signing_key: &SigningKey) -> SignedTransaction {
        let (signature, recovery_id) = signing_key
            .sign_recoverable(&borsh::to_vec(&(nonce, &self)).unwrap())
            .unwrap();
        let signature_bytes: [u8; 65] = [signature.to_bytes().as_slice(), &[recovery_id.to_byte()]]
            .concat()
            .try_into()
            .unwrap();
        SignedTransaction {
            transaction: self.clone(),
            nonce: nonce,
            signature: signature_bytes,
        }
    }
}
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct SignedTransaction {
    transaction: Transaction,
    nonce: i64,
    pub signature: [u8; 65],
}

impl SignedTransaction {
    pub fn from_address(&self) -> Address {
        let s: [u8; 64] = self.signature[0..64].try_into().unwrap();
        let signature = Signature::from_bytes(&s.into()).unwrap();
        let recovery_id = RecoveryId::from_byte(self.signature[64]).unwrap();
        VerifyingKey::recover_from_msg(
            &borsh::to_vec(&(self.nonce, &self.transaction)).unwrap(),
            &signature,
            recovery_id,
        )
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
    let transaction_id = db::run_transaction(pool.clone(), transaction.clone())
        .await
        .map_err(Error::from)?;
    Ok(borsh::to_vec(&transaction_id).map_err(Error::from)?)
}

async fn get_balance(
    State(pool): State<PgPool>,
    axum::extract::Path((currency, address)): axum::extract::Path<(String, String)>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(borsh::to_vec(
        &db::get_balance(
            &pool,
            Address(hex::decode(&address).map_err(Error::from)?.try_into()?),
            Currency::from_str(&currency)?,
        )
        .await?,
    )
    .map_err(Error::from)
    .into_response())
}
struct HtmlTemplate<T>(T);

impl<T> IntoResponse for HtmlTemplate<T>
where
    T: Template,
{
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to render template. Error: {err}"),
            )
                .into_response(),
        }
    }
}

async fn get_index() -> axum::response::Result<impl IntoResponse> {
    let template = IndexTemplate {
        title: "Create Wallet".to_string(),
        amount: None,
    };
    Ok(HtmlTemplate(template))
}

async fn get_magic_image(
    axum::extract::Path(file_name): axum::extract::Path<String>,
) -> axum::response::Result<impl IntoResponse> {
    let amount: i64 = Path::new(&file_name)
        .file_stem()
        .unwrap()
        .to_str()
        .unwrap()
        .parse()
        .unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "image/png;".parse().unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        format!("attachment; filename={}", file_name)
            .parse()
            .unwrap(),
    );

    let mut input = Command::new("magick");
    input.arg("-gravity");
    input.arg("center");
    input.arg("-background");
    input.arg("green");
    input.arg("-fill");
    input.arg("white");
    input.arg("-font");
    input.arg("src/fonts/Roboto-Bold.ttf");
    input.arg("-pointsize");
    input.arg("180");
    input.arg("-size");
    input.arg("900x556");

    input.arg(format!("label:${}", Decimal::new(amount, 2)));
    input.arg("PNG:-");
    Ok((headers, input.output().unwrap().stdout))
}

async fn get_magic(
    State(pool): State<PgPool>,
    axum::extract::Path(transaction_id): axum::extract::Path<i64>,
) -> axum::response::Result<impl IntoResponse> {
    let ledger_entry = db::get_ledger_entry(&pool, transaction_id).await?;
    let template = IndexTemplate {
        title: format!(
            "${} on the Stable Network",
            Decimal::new(ledger_entry.value, 2)
        ),
        amount: Some(ledger_entry.value),
    };
    Ok(HtmlTemplate(template))
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
            ),
        )
        .await?
        .into_iter()
        .map(Utxo::from)
        .collect::<Vec<_>>(),
    )
    .map_err(Error::from)
    .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        address::Address,
        transaction::{CashCheck, CreateCheck, Currency, Transfer},
    };
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
    use std::{collections::HashMap, env, fs::File, io::Read};
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
        pub static ref CHECK_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
        pub static ref CHECK_ADDRESS: Address = VerifyingKey::from(CHECK_SECRET_KEY.clone())
            .try_into()
            .unwrap();
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
    async fn test_transfer(pool: PgPool) {
        db::credit(&pool, *ALICE, Currency::Usd, 10000)
            .await
            .unwrap();
        let transaction = Transaction::Transfer(Transfer {
            currency: Currency::Usd,
            to: crate::transaction::Address::Stable(*BOB),
            value: 10000,
        });
        let _transaction2 = Transaction::Transfer(Transfer {
            currency: Currency::Usd,
            to: transaction::Address::Bitcoin("36sTjLr6VTRfF5MQGTH3BVVeDH17aEwQQW".to_string()),
            value: 4,
        });
        // println!("{}", hex::encode(borsh::to_vec(&(2i64, transaction2)).unwrap()));

        let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
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
    async fn test_check(pool: PgPool) {
        db::credit(&pool, *ALICE, Currency::Usd, 10000)
            .await
            .unwrap();
        let transaction = Transaction::CreateCheck(CreateCheck {
            currency: Currency::Usd,
            value: 10000,
            signer: *CHECK_ADDRESS,
        });

        let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();

        // let response = app(pool.clone()).await.oneshot(request).await.unwrap();
        // let body = response.into_body().collect().await.unwrap().to_bytes();
        // println!("{:?}", body);

        // assert_eq!(response.status(), StatusCode::OK);

        // // let request = Request::builder()
        // //     .method("GET")
        // //     .uri(format!("/checks/{}", hex::encode((*ALICE).0)))
        // //     .body(Body::empty())
        // //     .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();

        let transaction_id = from_slice::<i64>(&body).unwrap();

        // assert_eq!(response.status(), StatusCode::OK);

        // let body = response.into_body().collect().await.unwrap().to_bytes();
        // println!("{:?}", body);

        // let signature = CashCheck::sign(check_id, *BOB, &CHECK_SECRET_KEY);
        let transaction =
            Transaction::CashCheck(CashCheck::sign(transaction_id, *BOB, &CHECK_SECRET_KEY));

        let signed_transaction = transaction.sign(0, &BOBS_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();
        let response = app(pool.clone()).await.oneshot(request).await.unwrap();
        // let body = response.into_body().collect().await.unwrap().to_bytes();

        assert_eq!(response.status(), StatusCode::OK);

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
                                Decimal::new(99995, 8)
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
        db::credit(&pool, *ALICE, Currency::Usd, 10000)
            .await
            .unwrap();
        db::insert_bitcoin_block(
            &pool,
            bitcoin_block!("deposit-block-877380.block"),
            HashMap::from([(Currency::Usd, 100000f64)]),
        )
        .await
        .unwrap();
        let transaction = Transaction::Transfer(Transfer {
            to: transaction::Address::Bitcoin((*ALICES_BITCOIN_ADDRESS).to_string()),
            currency: Currency::Usd,
            value: 10000,
        });
        let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        // let body = response.into_body().collect().await.unwrap().to_bytes();
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
    // #[sqlx::test]
    // async fn claim_utxo2(pool: PgPool) {
    //     let transaction = Transaction::ClaimUtxo(transaction::ClaimUtxo {
    //         transaction_id: [0; 32],
    //         vout: 0,
    //         Currency::Usd,
    //     });
    //     let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
    //     let request = Request::builder()
    //         .method("POST")
    //         .header("content-type", "application/octet-stream")
    //         .uri("/transactions")
    //         .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
    //         .unwrap();
    // }
}
// #[cfg(test)]
// macro_rules! bitcoin_block {
//     ($file_name:expr) => {{
//         let mut file = File::open(concat!(
//             env!("CARGO_MANIFEST_DIR"),
//             "/src/test_data/",
//             $file_name
//         ))
//         .unwrap();
//         let mut data = Vec::new();
//         file.read_to_end(&mut data).unwrap();

//         ::bitcoin::Block::consensus_decode(&mut &data[..]).unwrap()
//     }};
// }

// #[sqlx::test]
// async fn test_claim_utxo(pool: PgPool) {
//     db::credit(&pool, *NODE_ADDRESS, Currency::Usd, i32::MAX as i64)
//         .await
//         .unwrap();
//     let block = bitcoin_block!("deposit-block-877380.block");
//     insert_bitcoin_block(&pool, block, HashMap::from([(Currency::Usd, 100000f64)]))
//         .await
//         .unwrap();
//     claim_utxo(&pool, 0, *BURNS, TEST_UTXO.0, TEST_UTXO.1, &Currency::Usd)
//         .await
//         .unwrap();
//     assert_eq!(get_balance(&pool, *BURNS, Currency::Usd).await.unwrap(), 100)
// }
