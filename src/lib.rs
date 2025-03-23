mod address;
// pub mod bitcoin;
pub mod constants;
use alloy::providers::ProviderBuilder;
pub mod core;
use crate::BBUSD::Transfer;
use alloy::sol_types::SolEvent;
use crate::core::BBUSD;
pub mod db;
use alloy::{
    contract::{ContractInstance, Interface},
    dyn_abi::DynSolValue,
    network::TransactionBuilder,
    primitives::{hex, U256, Log, Address, address },
    providers::{Provider},
    rpc::types::TransactionRequest,
};
use tokio::{time, time::Duration};
mod error;
pub mod exchange_rates;
pub mod transaction;

// pub use crate::address::Address;
// use crate::transaction::{CashCheck, CreateCheck};
use crate::{
    error::Error,
    // transaction::{ClaimUtxo, Currency, Transfer},
};
use askama::Template;
use axum::{
    Router,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header, method::Method},
    response::{Html, IntoResponse, Response, Sse, sse::Event},
    routing::{get, post},
};
use borsh::{BorshDeserialize, BorshSerialize};
#[cfg(test)]
use k256::ecdsa::SigningKey;
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;
use std::{path::Path, process::Command, str::FromStr, sync::Arc};
use tokio::sync::{
    Mutex,
    broadcast::{Receiver, Sender},
    mpsc,
    mpsc::UnboundedSender,
};
use tokio_stream::{
    self as stream, StreamExt, StreamExt as _,
    wrappers::{BroadcastStream, UnboundedReceiverStream},
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::ServeDir,
};

#[derive(Default, Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    title: String,
    description: Option<String>,
    image: Option<String>,
}

pub async fn app(app_state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact("http://192.168.0.11:5173".parse().unwrap()))
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST, Method::GET])
        .allow_credentials(true);

    //     spawn({
    //         async move {
    //     let mut interval = time::interval(time::Duration::from_secs(1));
    //     loop {
    //         interval.tick().await;
    //         state.update_channel.lock().await.0.send((Default::default(), Default::default())).unwrap();
    //     };
    // }});
    Router::new()
        // .route("/transactions", post(insert_transaction))
        // .route("/balances/{currency}/{address}", get(get_balance))
        // .route("/utxos/{address}", get(get_utxos))
        .route("/sse", get(get_sse))
        .route("/{check_id}", get(get_magic))
        .route("/images/{amount}", get(get_magic_image))
        .route("/", get(get_index))
        .nest_service("/assets", ServeDir::new("templates/assets"))
        .layer(cors)
        .with_state(
            app_state, //     AppState {
                      //     pool: Arc::new(Mutex::new(pool)),
                      //     update_channel: Arc::new(Mutex::new(tokio::sync::broadcast::channel::<(Address, Log)>(
                      //         1000000,
                      //     ))),
                      // }
        )
}
// #[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug)]
// pub struct Account {
//     nonce: i64,
//     balances: Vec<(Currency, i64)>,
// }

// #[derive(sqlx::FromRow, sqlx::Type, BorshSerialize)]
// pub struct Utxo {
//     transaction_id: [u8; 32],
//     vout: i32,
//     value: i64,
// }

// impl From<db::Utxo> for Utxo {
//     fn from(utxo: db::Utxo) -> Self {
//         Self {
//             transaction_id: utxo.transaction_id.try_into().unwrap(),
//             vout: utxo.vout,
//             value: utxo.value,
//         }
//     }
// }

// #[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
// enum Transaction {
//     ClaimUtxo(ClaimUtxo),
//     CreateCheck(CreateCheck),
//     CashCheck(CashCheck),
//     Transfer(Transfer),
// }
// impl Transaction {
//     #[cfg(test)]
//     fn sign(&self, nonce: i64, signing_key: &SigningKey) -> SignedTransaction {
//         let (signature, recovery_id) = signing_key
//             .sign_recoverable(&borsh::to_vec(&(nonce, &self)).unwrap())
//             .unwrap();
//         let signature_bytes: [u8; 65] = [signature.to_bytes().as_slice(), &[recovery_id.to_byte()]]
//             .concat()
//             .try_into()
//             .unwrap();
//         SignedTransaction {
//             transaction: self.clone(),
//             nonce: nonce,
//             signature: signature_bytes,
//         }
//     }
// }
// #[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
// pub struct SignedTransaction {
//     transaction: Transaction,
//     nonce: i64,
//     pub signature: [u8; 65],
// }

// type AppState = PgPool;
#[derive(Clone)]
pub struct AppState {
    pub pool: Arc<Mutex<PgPool>>,
    pub log_receiver: Arc<Mutex<Receiver<([u8; 32], BBUSD::Transfer)>>>,
}

// impl SignedTransaction {
//     pub fn from_address(&self) -> Address {
//         let s: [u8; 64] = self.signature[0..64].try_into().unwrap();
//         let signature = Signature::from_bytes(&s.into()).unwrap();
//         let recovery_id = RecoveryId::from_byte(self.signature[64]).unwrap();
//         VerifyingKey::recover_from_msg(
//             &borsh::to_vec(&(self.nonce, &self.transaction)).unwrap(),
//             &signature,
//             recovery_id,
//         )
//         .unwrap()
//         .try_into()
//         .unwrap()
//     }
// }

// pub async fn insert_transaction(
//     State(state): State<AppState>,
//     body: Bytes,
// ) -> axum::response::Result<impl IntoResponse> {
//     let transaction: SignedTransaction = borsh::from_slice(&body.to_vec()).map_err(Error::from)?;
//     let transaction_id = db::run_transaction(state.pool.lock().await.clone(), transaction.clone())
//         .await
//         .map_err(Error::from)?;
//     match transaction.transaction {
//         Transaction::Transfer(transaction::Transfer {
//             to: transaction::Address::Stable(to),
//             ..
//         }) => {
//             state
//                 .update_channel
//                 .lock()
//                 .await
//                 .0
//                 .send(transaction.from_address())
//                 .unwrap();
//             state.update_channel.lock().await.0.send(to).unwrap();
//         }
//         Transaction::CreateCheck(transaction::CreateCheck { .. }) => {
//             state
//                 .update_channel
//                 .lock()
//                 .await
//                 .0
//                 .send(transaction.from_address())
//                 .unwrap();
//         }
//         Transaction::ClaimUtxo(_) => {
//             state
//                 .update_channel
//                 .lock()
//                 .await
//                 .0
//                 .send(transaction.from_address())
//                 .unwrap();
//         }
//         _ => (),
//     }
//     Ok(borsh::to_vec(&transaction_id).map_err(Error::from)?)
// }

// async fn get_balance(
//     State(state): State<AppState>,
//     axum::extract::Path((currency, address)): axum::extract::Path<(String, String)>,
// ) -> axum::response::Result<impl IntoResponse> {
//     Ok(borsh::to_vec(
//         &db::get_balance(
//             &state.pool.lock().await.clone(),
//             &Address(hex::decode(&address).map_err(Error::from)?.try_into()?),
//             &Currency::from_str(&currency)?,
//         )
//         .await?,
//     )
//     .map_err(Error::from)
//     .into_response())
// }
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
        title: "Stable Network Wallet".to_string(),
        ..Default::default()
    };
    Ok(HtmlTemplate(template))
}

async fn get_magic(
    State(state): State<AppState>,
    axum::extract::Path(check_id): axum::extract::Path<i64>,
) -> axum::response::Result<impl IntoResponse> {
    let rpc_url = "https://rpc.ankr.com/core".parse().unwrap();
    let provider = ProviderBuilder::new().on_http(rpc_url);

    let path = std::env::current_dir().unwrap().join("src/frontend/abi/contracts/CheckBook.sol/CheckBook.json");

    // Read the artifact which contains `abi`, `bytecode`, `deployedBytecode` and `metadata`.
    let artifact = std::fs::read(path).expect("Failed to read artifact");
    let json: serde_json::Value = serde_json::from_slice(&artifact).unwrap();

    // Get `abi` from the artifact.
    let abi = serde_json::from_str(&json.to_string()).unwrap();

    // Create a new `ContractInstance` of the `Counter` contract from the abi
    let contract = ContractInstance::new(address!("0x92Ec2ac50CFeBea0A4AE6ce5df7DB0cC90FF42a9"), provider.clone(), Interface::new(abi));
    // let address_value = contract.function("checkIds", &[
    //     DynSolValue::from(address!("0xa84c5626954d01e0200050a800e9cdc3a00de7ff")),
    //     DynSolValue::from(U256::from(check_id))

    // ]).unwrap().call().await.unwrap();
    // let address = address_value.first().unwrap().as_address().unwrap().0;
    // println!("check address {:?}", address_value);
    let amount_value = contract.function("getCheckAmount", &[
        DynSolValue::from(address!("0xa84c5626954d01e0200050a800e9cdc3a00de7ff")),
        DynSolValue::from(U256::from(check_id))
        // address_value.first().unwrap().clone()
    ]).unwrap().call().await.unwrap();
    let amount = amount_value.first().unwrap().as_uint().unwrap().0;
    let template = IndexTemplate {
        title: format!(
            "Accept ${} on the Stable Network",
            Decimal::new(amount.to::<i64>(), 2)
        ),
        ..Default::default()
    };
    Ok(HtmlTemplate(template))
}

#[derive(Deserialize)]
struct SseParams {
    address: String,
}

#[axum::debug_handler]
async fn get_sse(
    State(state): State<AppState>,
    sse_params: Query<SseParams>,
) -> axum::response::Result<impl IntoResponse> {
    // println!("get sse");
    let (tx, rx) = mpsc::unbounded_channel::<Event>();
    let address = Address::parse_checksummed(&sse_params.address, None).unwrap();
    // let address = Address(
    //     hex::decode(&sse_params.address)
    //         .map_err(Error::from)
    //         .unwrap()
    //         .try_into()
    //         .unwrap(),
    // );
    // let currency = sse_params.currency.clone();
    let receiver = state.log_receiver.lock().await.resubscribe(); 
    // let receiver = state.log_receiver.lock().await.subscribe();
    let mut event_stream = BroadcastStream::new(receiver).filter(move |maybe_transfer| {
        return true;
        if let Ok((_, transfer)) = maybe_transfer {
            return transfer.to == address || transfer.from == address;
        }
        return false;
    });

    tokio::spawn(async move {
        loop {
            let (transaction_hash, event) = event_stream.next().await.unwrap().unwrap();
            let log: Log<Transfer> = Log::new_from_event_unchecked(Default::default(), event);
            // Transfer::encode_log(&event);
            // println!("{:?}", log);
            if tx
                .send(
                    Event::default()
                        .json_data(json!({
                            "transactionHash": transaction_hash,
                            "log": log.reserialize()
                        }))
                            .unwrap())
                .is_err()
            {
                break;
            };
        }
    });
    // state.update_channel.lock().await.0.send((Default::default(), Default::default())).unwrap();

    Ok(
        Sse::new(UnboundedReceiverStream::new(rx).map(Ok::<Event, Error>)).keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(1))
                .text("keep alive text"),
        ),
    )
}
// async fn send_state(
//     pool: &PgPool,
//     tx: &UnboundedSender<Event>,
//     address: &Address,
//     currency: &Currency,
// ) -> Result<(), tokio::sync::mpsc::error::SendError<Event>> {
//     let utxos = &db::get_utxos(pool, address)
//         .await
//         .unwrap()
//         .into_iter()
//         .map(|utxo| {
//             json!({
//                 "transaction_id": hex::encode(utxo.transaction_id),
//                 "vout": utxo.vout,
//                 "value": utxo.value.to_string(),
//             })
//         })
//         .collect::<Vec<serde_json::Value>>();
//     let balance = db::get_balance(pool, &address, &currency).await.unwrap();
//     tx.send(
//         Event::default()
//             .json_data(json!({
//                     "balance": balance.to_string(),
//                     "utxos": utxos

//             }))
//             .unwrap(),
//     )
// }

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


// #[cfg(test)]
// mod tests {
//     use super::*;
//     use crate::{
//         address::Address,
//         transaction::{CashCheck, CreateCheck, Currency, Transfer},
//     };
//     use ::bitcoin::consensus::Decodable;
//     use axum::{
//         body::Body,
//         http::{Request, StatusCode},
//     };
//     use borsh::from_slice;
//     use http_body_util::BodyExt;
//     use httpmock::MockServer;
//     use k256::ecdsa::{SigningKey, VerifyingKey};
//     use lazy_static::lazy_static;
//     use rust_decimal::Decimal;
//     use secp256k1::rand::rngs::OsRng;
//     use serde_json::json;
//     use sqlx::PgPool;
//     use std::{collections::HashMap, env, fs::File, io::Read};
//     use tower::ServiceExt;

//     lazy_static! {
//         pub static ref ALICES_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
//         pub static ref ALICE: Address = VerifyingKey::from(ALICES_SECRET_KEY.clone())
//             .try_into()
//             .unwrap();
//         pub static ref ALICES_BITCOIN_ADDRESS: String =
//             "36sTjLr6VTRfF5MQGTH3BVVeDH17aEwQQW".to_string();
//         pub static ref BOBS_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
//         pub static ref BOB: Address = VerifyingKey::from(BOBS_SECRET_KEY.clone())
//             .try_into()
//             .unwrap();
//         pub static ref BURNS_SECRET_KEY: SigningKey = SigningKey::from_bytes(
//             &<Vec<u8> as TryInto<[u8; 32]>>::try_into(
//                 hex::decode("7ec7f76e604b31d95acfd2d87dec745913b8eeb56a3d20517bf3456b349b319e")
//                     .unwrap()
//             )
//             .unwrap()
//             .into()
//         )
//         .unwrap();
//         pub static ref BURNS: Address = VerifyingKey::from(BURNS_SECRET_KEY.clone())
//             .try_into()
//             .unwrap();
//         pub static ref TEST_UTXO: ([u8; 32], i32) = {
//             (
//                 hex::decode("40efa774a75deb504f1f9f58c4f272d1b185bd274347de2681ff77637af55bec")
//                     .unwrap()
//                     .try_into()
//                     .unwrap(),
//                 0,
//             )
//         };
//         pub static ref CHECK_SECRET_KEY: SigningKey = SigningKey::random(&mut OsRng);
//         pub static ref CHECK_ADDRESS: Address = VerifyingKey::from(CHECK_SECRET_KEY.clone())
//             .try_into()
//             .unwrap();
//     }
//     macro_rules! bitcoin_block {
//         ($file_name:expr) => {{
//             let mut file = File::open(concat!(
//                 env!("CARGO_MANIFEST_DIR"),
//                 "/src/test_data/",
//                 $file_name
//             ))
//             .unwrap();
//             let mut data = Vec::new();
//             file.read_to_end(&mut data).unwrap();

//             ::bitcoin::Block::consensus_decode(&mut &data[..]).unwrap()
//         }};
//     }

//     #[sqlx::test]
//     async fn test_transfer(pool: PgPool) {
//         db::credit(&pool, *ALICE, Currency::Usd, 10000)
//             .await
//             .unwrap();
//         let transaction = Transaction::Transfer(Transfer {
//             currency: Currency::Usd,
//             to: crate::transaction::Address::Stable(*BOB),
//             value: 10000,
//         });
//         let _transaction2 = Transaction::Transfer(Transfer {
//             currency: Currency::Usd,
//             to: transaction::Address::Bitcoin("36sTjLr6VTRfF5MQGTH3BVVeDH17aEwQQW".to_string()),
//             value: 4,
//         });
//         // println!("{}", hex::encode(borsh::to_vec(&(2i64, transaction2)).unwrap()));

//         let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
//         let request = Request::builder()
//             .method("POST")
//             .header("content-type", "application/octet-stream")
//             .uri("/transactions")
//             .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let request = Request::builder()
//             .method("GET")
//             .uri(format!("/balances/usd/{}", hex::encode((*ALICE).0)))
//             .body(Body::empty())
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         assert_eq!(from_slice::<i64>(&body).unwrap(), 0);

//         let request = Request::builder()
//             .method("GET")
//             .uri(format!("/balances/usd/{}", hex::encode((*BOB).0)))
//             .body(Body::empty())
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         assert_eq!(from_slice::<i64>(&body).unwrap(), 10000);
//     }

//     #[sqlx::test]
//     async fn test_check(pool: PgPool) {
//         db::credit(&pool, *ALICE, Currency::Usd, 10000)
//             .await
//             .unwrap();
//         let transaction = Transaction::CreateCheck(CreateCheck {
//             currency: Currency::Usd,
//             value: 10000,
//             signer: *CHECK_ADDRESS,
//         });

//         let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
//         let request = Request::builder()
//             .method("POST")
//             .header("content-type", "application/octet-stream")
//             .uri("/transactions")
//             .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();
//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         let transaction_id = from_slice::<i64>(&body).unwrap();

//         let transaction =
//             Transaction::CashCheck(CashCheck::sign(transaction_id, *BOB, &CHECK_SECRET_KEY));

//         let signed_transaction = transaction.sign(0, &BOBS_SECRET_KEY.clone());
//         let request = Request::builder()
//             .method("POST")
//             .header("content-type", "application/octet-stream")
//             .uri("/transactions")
//             .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
//             .unwrap();
//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let request = Request::builder()
//             .method("GET")
//             .uri(format!("/balances/usd/{}", hex::encode((*BOB).0)))
//             .body(Body::empty())
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         assert_eq!(from_slice::<i64>(&body).unwrap(), 10000);
//     }

//     #[sqlx::test]
//     async fn withdraw(pool: PgPool) {
//         let server = MockServer::start();
//         let bitcoin_rpc_mock =
//             server.mock(|when, then| {
//                 when.method("POST")
//                     .body(
//                         json!({
//                             "jsonrpc": "1.0",
//                             "method": "sendtoaddress",
//                             "params": [
//                                 ALICES_BITCOIN_ADDRESS.to_string(),
//                                 Decimal::new(99995, 8)
//                             ]
//                         })
//                         .to_string(),
//                     )
//                     .path("/");
//                 then.status(200)
//                 .header("content-type", "text/json; charset=UTF-8")
//                 .body(json!({
//                     "error": null,
//                     "result": "0000000000000000000000000000000000000000000000000000000000000000"
//                 }).to_string());
//             });
//         env::set_var("BITCOIND_URL", server.url(""));
//         db::credit(&pool, *ALICE, Currency::Usd, 10000)
//             .await
//             .unwrap();
//         db::insert_bitcoin_block(
//             &pool,
//             bitcoin_block!("deposit-block-877380.block"),
//             HashMap::from([(Currency::Usd, 100000f64)]),
//             vec![(
//                 db::Utxo {
//                     transaction_id: TEST_UTXO.0.to_vec(),
//                     vout: TEST_UTXO.1,
//                     value: 1,
//                 },
//                 *BURNS,
//             )],
//         )
//         .await
//         .unwrap();
//         let transaction = Transaction::Transfer(Transfer {
//             to: transaction::Address::Bitcoin((*ALICES_BITCOIN_ADDRESS).to_string()),
//             currency: Currency::Usd,
//             value: 10000,
//         });
//         let signed_transaction = transaction.sign(0, &ALICES_SECRET_KEY.clone());
//         let request = Request::builder()
//             .method("POST")
//             .header("content-type", "application/octet-stream")
//             .uri("/transactions")
//             .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);
//         bitcoin_rpc_mock.assert();

//         let request = Request::builder()
//             .method("GET")
//             .uri(format!("/balances/usd/{}", hex::encode((*ALICE).0)))
//             .body(Body::empty())
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         assert_eq!(from_slice::<i64>(&body).unwrap(), 0);
//     }
//     #[sqlx::test]
//     async fn claim_utxo2(pool: PgPool) {
//         let block = bitcoin_block!("deposit-block-877380.block");
//         db::insert_bitcoin_block(
//             &pool,
//             block,
//             HashMap::from([(Currency::Usd, 100000f64)]),
//             vec![(
//                 db::Utxo {
//                     transaction_id: TEST_UTXO.0.to_vec(),
//                     vout: TEST_UTXO.1,
//                     value: 1000,
//                 },
//                 *BURNS,
//             )],
//         )
//         .await
//         .unwrap();
//         let transaction = Transaction::ClaimUtxo(transaction::ClaimUtxo {
//             transaction_id: TEST_UTXO.0,
//             vout: TEST_UTXO.1,
//             currency: Currency::Usd,
//         });
//         let signed_transaction = transaction.sign(0, &BURNS_SECRET_KEY.clone());
//         let request = Request::builder()
//             .method("POST")
//             .header("content-type", "application/octet-stream")
//             .uri("/transactions")
//             .body(Body::from(borsh::to_vec(&signed_transaction).unwrap()))
//             .unwrap();
//         app(pool.clone()).await.oneshot(request).await.unwrap();
//         let request = Request::builder()
//             .method("GET")
//             .uri(format!("/balances/usd/{}", hex::encode((*BURNS).0)))
//             .body(Body::empty())
//             .unwrap();

//         let response = app(pool.clone()).await.oneshot(request).await.unwrap();

//         assert_eq!(response.status(), StatusCode::OK);

//         let body = response.into_body().collect().await.unwrap().to_bytes();

//         assert_eq!(from_slice::<i64>(&body).unwrap(), 100);
//     }
// }
