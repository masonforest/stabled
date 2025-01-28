mod address;
pub mod bitcoin;
pub mod constants;
pub mod db;
mod error;
pub mod exchange_rates;
pub mod transaction;

pub use crate::address::Address;
use crate::transaction::{CashCheck, CreateCheck};
use crate::{
    error::Error,
    transaction::{ClaimUtxo, Currency, Transfer},
};
use askama::Template;
use axum::extract::Query;
use axum::{
    body::Bytes,
    extract::State,
    http::{header, method::Method, HeaderMap, StatusCode},
    response::{sse::Event, Html, IntoResponse, Response, Sse},
    routing::{get, post},
    Router,
};
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(test)]
use k256::ecdsa::SigningKey;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use std::{path::Path, process::Command, str::FromStr};
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::Sender;
use tokio::sync::mpsc;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::Mutex;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::wrappers::UnboundedReceiverStream;
use tokio_stream::StreamExt as _;
use tower_http::cors::AllowOrigin;
use tower_http::{cors::CorsLayer, services::ServeDir};

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    title: String,
    amount: Option<i64>,
}

pub async fn app(pool: PgPool) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact("http://localhost:5173".parse().unwrap()))
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST, Method::GET])
        .allow_credentials(true);

    Router::new()
        .route("/transactions", post(insert_transaction))
        .route("/balances/{currency}/{address}", get(get_balance))
        .route("/utxos/{address}", get(get_utxos))
        .route("/sse", get(get_sse))
        .route("/{transaction_id}", get(get_magic))
        .route("/images/{amount}", get(get_magic_image))
        .route("/", get(get_index))
        .nest_service("/assets", ServeDir::new("templates/assets"))
        .layer(cors)
        .with_state(AppState {
            pool: Arc::new(Mutex::new(pool)),
            update_channel: Arc::new(Mutex::new(tokio::sync::broadcast::channel::<Address>(
                1000000,
            ))),
        })
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

// type AppState = PgPool;
#[derive(Clone)]
pub struct AppState {
    pub pool: Arc<Mutex<PgPool>>,
    pub update_channel: Arc<Mutex<(Sender<Address>, Receiver<Address>)>>,
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
    State(state): State<AppState>,
    body: Bytes,
) -> axum::response::Result<impl IntoResponse> {
    let transaction: SignedTransaction = borsh::from_slice(&body.to_vec()).map_err(Error::from)?;
    let transaction_id = db::run_transaction(state.pool.lock().await.clone(), transaction.clone())
        .await
        .map_err(Error::from)?;
    match transaction.transaction {
        Transaction::Transfer(transaction::Transfer {
            to: transaction::Address::Stable(to),
            ..
        }) => {
            state
                .update_channel
                .lock()
                .await
                .0
                .send(transaction.from_address())
                .unwrap();
            state.update_channel.lock().await.0.send(to).unwrap();
        }
        Transaction::CreateCheck(transaction::CreateCheck { .. }) => {
            state
                .update_channel
                .lock()
                .await
                .0
                .send(transaction.from_address())
                .unwrap();
        }
        Transaction::ClaimUtxo(_) => {
            state
                .update_channel
                .lock()
                .await
                .0
                .send(transaction.from_address())
                .unwrap();
        }
        _ => (),
    }
    Ok(borsh::to_vec(&transaction_id).map_err(Error::from)?)
}

async fn get_balance(
    State(state): State<AppState>,
    axum::extract::Path((currency, address)): axum::extract::Path<(String, String)>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(borsh::to_vec(
        &db::get_balance(
            &state.pool.lock().await.clone(),
            &Address(hex::decode(&address).map_err(Error::from)?.try_into()?),
            &Currency::from_str(&currency)?,
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

#[derive(Deserialize)]
struct SseParams {
    currency: Currency,
    address: String,
}

#[axum::debug_handler]
async fn get_sse(
    State(state): State<AppState>,
    sse_params: Query<SseParams>,
) -> axum::response::Result<impl IntoResponse> {
    let (tx, rx) = mpsc::unbounded_channel::<Event>();
    let address = Address(
        hex::decode(&sse_params.address)
            .map_err(Error::from)
            .unwrap()
            .try_into()
            .unwrap(),
    );
    let currency = sse_params.currency.clone();
    let receiver = state.update_channel.lock().await.0.subscribe();
    let mut event_stream = BroadcastStream::new(receiver);

    tokio::spawn(async move {
        loop {
            if address == event_stream.next().await.unwrap().unwrap() {
                if send_state(&state.pool.lock().await.clone(), &tx, &address, &currency)
                    .await
                    .is_err()
                {
                    break;
                };
            }
        }
    });
    state.update_channel.lock().await.0.send(address).unwrap();

    Ok(
        Sse::new(UnboundedReceiverStream::new(rx).map(Ok::<Event, Error>)).keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(1))
                .text("keep alive text"),
        ),
    )
}
async fn send_state(
    pool: &PgPool,
    tx: &UnboundedSender<Event>,
    address: &Address,
    currency: &Currency,
) -> Result<(), tokio::sync::mpsc::error::SendError<Event>> {
    let utxos = &db::get_utxos(pool, address)
        .await
        .unwrap()
        .into_iter()
        .map(|utxo| {
            json!({
                "transaction_id": hex::encode(utxo.transaction_id),
                "vout": utxo.vout,
                "value": utxo.value.to_string(),
            })
        })
        .collect::<Vec<serde_json::Value>>();
    let balance = db::get_balance(pool, &address, &currency).await.unwrap();
    tx.send(
        Event::default()
            .json_data(json!({
                    "balance": balance.to_string(),
                    "utxos": utxos

            }))
            .unwrap(),
    )
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
    State(state): State<AppState>,
    axum::extract::Path(transaction_id): axum::extract::Path<i64>,
) -> axum::response::Result<impl IntoResponse> {
    let ledger_entry =
        db::get_ledger_entry(&state.pool.lock().await.clone(), transaction_id).await?;
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
    State(state): State<AppState>,
    axum::extract::Path(address): axum::extract::Path<String>,
) -> axum::response::Result<impl IntoResponse> {
    Ok(borsh::to_vec(
        &db::get_utxos(
            &state.pool.lock().await.clone(),
            &Address(
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

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();
        let body = response.into_body().collect().await.unwrap().to_bytes();

        let transaction_id = from_slice::<i64>(&body).unwrap();

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
            vec![(
                db::Utxo {
                    transaction_id: TEST_UTXO.0.to_vec(),
                    vout: TEST_UTXO.1,
                    value: 1,
                },
                *BURNS,
            )],
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
    #[sqlx::test]
    async fn claim_utxo2(pool: PgPool) {
        let block = bitcoin_block!("deposit-block-877380.block");
        db::insert_bitcoin_block(
            &pool,
            block,
            HashMap::from([(Currency::Usd, 100000f64)]),
            vec![(
                db::Utxo {
                    transaction_id: TEST_UTXO.0.to_vec(),
                    vout: TEST_UTXO.1,
                    value: 1000,
                },
                *BURNS,
            )],
        )
        .await
        .unwrap();
        let transaction = Transaction::ClaimUtxo(transaction::ClaimUtxo {
            transaction_id: TEST_UTXO.0,
            vout: TEST_UTXO.1,
            currency: Currency::Usd,
        });
        let signed_transaction = transaction.sign(0, &BURNS_SECRET_KEY.clone());
        let request = Request::builder()
            .method("POST")
            .header("content-type", "application/octet-stream")
            .uri("/transactions")
            .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
            .unwrap();
        app(pool.clone()).await.oneshot(request).await.unwrap();
        let request = Request::builder()
            .method("GET")
            .uri(format!("/balances/usd/{}", hex::encode((*BURNS).0)))
            .body(Body::empty())
            .unwrap();

        let response = app(pool.clone()).await.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();

        assert_eq!(from_slice::<i64>(&body).unwrap(), 100);
    }
}
