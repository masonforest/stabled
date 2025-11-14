mod address;
pub mod constants;
use alloy::providers::ProviderBuilder;
pub mod core;
use crate::constants::{CHECKBOOK_ADDRESS, WSS_URL};
use alloy::{
    providers::WsConnect,
    sol,
    sol_types::{SolEvent, SolInterface},
};
use axum::extract::State;
use core::{Transaction, TransactionLogDataStream};
use serde_json::{Value, json};
use tokio::sync::{broadcast, broadcast::Sender};
pub mod db;
use alloy::{
    contract::{ContractInstance, Interface},
    dyn_abi::DynSolValue,
    primitives::{Address, U256},
    providers::Provider,
    rpc::types::{Filter, Log},
};
use tokio::time::Duration;
mod error;
pub mod exchange_rates;
pub mod transaction;

use crate::error::Error;
use askama::Template;
use axum::{
    Router,
    extract::Query,
    http::{HeaderMap, StatusCode, header, method::Method},
    response::{Html, IntoResponse, Response, Sse, sse::Event},
    routing::get,
};
use borsh::{BorshDeserialize, BorshSerialize};
use rust_decimal::Decimal;
use serde::Deserialize;
use std::{path::Path, process::Command};
use tokio::sync::mpsc;
use tokio_stream::{StreamExt, wrappers::UnboundedReceiverStream};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::ServeDir,
};
sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    FixedPriceEthExchange,
    "src/frontend/abi/contracts/FixedPriceEthExchange.sol/FixedPriceEthExchange.json"
);

sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    CheckBook,
    "src/frontend/abi/contracts/CheckBook.sol/CheckBook.json"
);
sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    HDWalletMessenger,
    "src/frontend/abi/contracts/HDWalletMessenger.sol/HDWalletMessenger.json"
);

#[derive(Default, Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    title: String,
    description: Option<String>,
    image: Option<String>,
}

pub async fn app() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list([
            "http://192.168.0.11:5173".parse().unwrap(),
            "http://192.168.0.11:5174".parse().unwrap(),
            "https://f6901ddf7e80.ngrok-free.app".parse().unwrap(),
        ]))
        .allow_headers(vec![header::CONTENT_TYPE])
        .allow_methods(vec![Method::POST, Method::GET])
        .allow_credentials(true);

    let (sender, _) = broadcast::channel(u16::MAX as usize);
    let sender2 = sender.clone();
    tokio::spawn(async move {
        // let sender = sender.clone();
        let ws = WsConnect::new(WSS_URL.clone());
        let provider = ProviderBuilder::new().connect_ws(ws).await.unwrap();
        let filter = Filter::new().address(*CHECKBOOK_ADDRESS);
        let sub = provider.subscribe_logs(&filter).await.unwrap();
        let mut stream = sub.into_stream();

        while let Some(log) = stream.next().await {
            sender2.send(log).unwrap();
        }
    });
    Router::new()
        .route("/sse", get(get_sse))
        // .route("/transactions", get(transactions))
        .route("/{check_id}", get(get_magic))
        .route("/images/{amount}", get(get_magic_image))
        .route("/", get(get_index))
        .nest_service("/assets", ServeDir::new("templates/assets"))
        .with_state(sender)
        .layer(cors)
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
        title: "Stable Network Wallet".to_string(),
        ..Default::default()
    };
    Ok(HtmlTemplate(template))
}

async fn get_magic(
    axum::extract::Path(check_address): axum::extract::Path<String>,
) -> axum::response::Result<impl IntoResponse> {
    let rpc_url = "https://0.48.club/".parse().unwrap();
    let provider = ProviderBuilder::new().connect_http(rpc_url);

    let path = std::env::current_dir()
        .unwrap()
        .join("src/frontend/abi/contracts/CheckBook.sol/CheckBook.json");

    let artifact = std::fs::read(path).expect("Failed to read artifact");
    let json: serde_json::Value = serde_json::from_slice(&artifact).unwrap();

    let abi = serde_json::from_str(&json.to_string()).unwrap();

    let contract = ContractInstance::new(
        CHECKBOOK_ADDRESS.clone(),
        provider.clone(),
        Interface::new(abi),
    );
    let amount_value = contract
        .function(
            "checks",
            &[
                DynSolValue::from(Address::parse_checksummed(&check_address, None).unwrap()), // address_value.first().unwrap().clone()
            ],
        )
        .unwrap()
        .call()
        .await
        .unwrap();
    let amount = amount_value.first().unwrap().as_uint().unwrap().0;
    let template = IndexTemplate {
        title: "Stable Network Wallet".to_string(),

        description: Some(format!(
            "Accept ${} on the Stable Network",
            Decimal::new(amount.to::<i64>(), 2)
        )),
        image: Some(format!("/images/{}", amount.to::<i64>())),
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
    sse_params: Query<SseParams>,
    State(sender): State<Sender<Log>>,
) -> axum::response::Result<impl IntoResponse> {
    let address = Address::parse_checksummed(&sse_params.address, None).unwrap();
    let mut stream = TransactionLogDataStream::new(address, sender.subscribe())
        .await
        .unwrap();
    let (tx, rx) = mpsc::unbounded_channel::<Event>();

    tokio::spawn(async move {
        while let Some(transaction) = stream.next().await {
            if tx
                .send(
                    Event::default()
                        .json_data(json!(transaction_to_json(transaction)))
                        .unwrap(),
                )
                .is_err()
            {
                break;
            };
        }
    });

    Ok(
        Sse::new(UnboundedReceiverStream::new(rx).map(Ok::<Event, Error>)).keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(1))
                .text("keep alive text"),
        ),
    )
}
// const FIXED_PRICE_ETH_EXCHANGE_ADDRESS: [u8; 20] = hex!("0x070d6b90Fe97a3023b287F1F060AdB72eCee38Ed");

fn transaction_to_json(transaction: Transaction) -> Value {
    if transaction
        .logs
        .iter()
        .any(|log| log.topics()[0] == CheckBook::CheckFunded::SIGNATURE_HASH)
    {
        if let Ok(FixedPriceEthExchange::FixedPriceEthExchangeCalls::buyEthAndCall(
            FixedPriceEthExchange::buyEthAndCallCall { encryptedMemo, .. },
        )) = FixedPriceEthExchange::FixedPriceEthExchangeCalls::abi_decode(&transaction.input)
        {
            let log = HDWalletMessenger::Message::decode_log(&alloy::primitives::Log {
                data: transaction.logs[5].clone(),
                ..Default::default()
            })
            .unwrap();
            return json!({
                "transactionHash": transaction.hash,
                "action": "CheckFunded",
                "amount": u64::try_from(U256::from_be_bytes::<32>(transaction.logs[1].data.0[..].try_into().unwrap())).unwrap(),
                "messageIndex": log.data.messageIndex.to::<u64>(),
                "checkAddress": Address::from_slice(&transaction.logs[4].topics()[1][12..]),
                "toPublicKey": log.data.toPublicKey,
                "encryptedMemo": encryptedMemo
            });
        };
        json!("invalid transaction")
    } else if let Ok(CheckBook::CheckBookCalls::redeemCheck(CheckBook::redeemCheckCall {
        encryptedMemo,
        ..
    })) = CheckBook::CheckBookCalls::abi_decode(&transaction.input)
    {
        json!({
            "transactionHash": transaction.hash,
            "action": "CheckRedeemed",
            "amount": u64::try_from(U256::from_be_bytes::<32>(transaction.logs[0].data.0[..].try_into().unwrap())).unwrap(),
            "checkAddress": Address::from_slice(&transaction.logs[4].topics()[1][12..]),
            "encryptedMemo": encryptedMemo,
            "from": Address::from_slice(&transaction.logs[1].data.0[12..32]),
            "to": Address::from_slice(&transaction.logs[1].data.0[44..64])
        })
    } else {
        panic!("unknown transaction type")
    }
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

#[cfg(test)]
mod tests {

    #[test]
    fn test_transaction_to_json() {
        // let transaction = Transaction {
        //     address: hex!("070d6b90Fe97a3023b287F1F060AdB72eCee38Ed"),
        //     input: hex!("2705f299000000000000000000000000a84c5626954d01e0200050a800e9cdc3a00de7ff000000000000000000000000000000000000000000000000002aa1efb94e0000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000003c00000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000260000000000000000000000000a84c5626954d01e0200050a800e9cdc3a00de7ff00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006423b872dd0000000000000000000000007589c562c9d8c16212aca7d98fd0ef3eb84c5af1000000000000000000000000070d6b90fe97a3023b287f1f060adb72ecee38ed000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000a84c5626954d01e0200050a800e9cdc3a00de7ff00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006423b872dd000000000000000000000000070d6b90fe97a3023b287f1f060adb72ecee38ed000000000000000000000000bd679ef6c40874517f17b4dfc1a15fbec62cecc9000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000ae82ed89ec5cd3336935f0552874f0ca224bb6460000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000243e58c58c000000000000000000000000bd679ef6c40874517f17b4dfc1a15fbec62cecc9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000035023be084a6028d8dc3e975a1f80415319d45617173fd761f9309322918b08d1b68ca137d591121b6107a65fdfce16c9dec79f7b2a10000000000000000000000").to_vec(),
        //     logs: vec![
        //     LogData::new_unchecked(
        //         vec![
        //             hex!("ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef").into(),
        //             hex!("0000000000000000000000005c30163146992fcca045948eb58695edce191510").into(),
        //             hex!("000000000000000000000000070d6b90fe97a3023b287f1f060adb72ecee38ed").into(),
        //         ],
        //         hex!("0000000000000000000000000000000000000000000000000000000000000000").into(),
        //     ),
        //     LogData::new_unchecked(
        //         vec![
        //             hex!("ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef").into(),
        //             hex!("000000000000000000000000070d6b90fe97a3023b287f1f060adb72ecee38ed").into(),
        //             hex!("00000000000000000000000026decc57a8d17c8a67aa8087bdb6b66837290cf7").into(),
        //         ],
        //         hex!("0000000000000000000000000000000000000000000000000000000000000001").into(),
        //     ), // Replace with actual contract address
        //     LogData::new_unchecked(
        //         vec![
        //             hex!("7062b028a775ab22e686c9036d2f88f07a2b09c330dcfaca37fe2427e7dd40e0").into(),
        //             hex!("000000000000000000000000070d6b90fe97a3023b287f1f060adb72ecee38ed").into(),
        //             hex!("000000000000000000000000f3a12baa70b4a9cc8df7a550ac3d00f0fe6c1621").into(),
        //         ],
        //         hex!("000000000000000000000000a84c5626954d01e0200050a800e9cdc3a00de7ff000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000001").into(),
        //     ), // Replace with actual contract address
        //     LogData::new_unchecked(
        //         vec![
        //             hex!("c5b98f4ed8cd598950469d4f93fa31bcb46c1eaa6a47e8fe86b0cc84f074c3ad").into(),
        //             hex!("0000000000000000000000005c30163146992fcca045948eb58695edce191510").into(),
        //             hex!("000000000000000000000000bd679ef6c40874517f17b4dfc1a15fbec62cecc9").into(),
        //         ],
        //         hex!("000000000000000000000000000000000000000000000000000000000000002b").into(),
        //     ), // Replace with actual contract address
        // ],
        //     ..Default::default()

        // };

        // assert_eq!(
        //     transaction_to_json(transaction),
        //     json!({
        //         "transactionHash": ([0u8; 32]),
        //         "action": "CheckFunded",
        //         "amount": 1,
        //     })
        // )
    }
}
