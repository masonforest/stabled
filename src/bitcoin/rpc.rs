use self::super::Block;
use crate::bitcoin::Deposit;
use bitcoin::{consensus::Decodable, Network};
use rust_decimal::Decimal;
use log::info;
use serde_json::{json, Value};
use std::env;
use tokio::sync::OnceCell;

static NETWORK: OnceCell<Network> = OnceCell::const_new();

pub async fn get_network() -> &'static Network {
    let client = reqwest::Client::new();
    NETWORK
        .get_or_init(|| async {
            let resp = client
                .post(env::var("BITCOIND_URL").unwrap())
                .header(
                    reqwest::header::CONTENT_TYPE,
                    reqwest::header::HeaderValue::from_static("text/plain"),
                )
                .json(&json!({
                            "jsonrpc": "1.0",
                            "method": "getblockchaininfo",
                            "params": []
                }))
                .send()
                .await
                .unwrap()
                .json::<Value>()
                .await
                .unwrap();

            match resp
                .get("result")
                .unwrap()
                .get("chain")
                .unwrap()
                .as_str()
                .unwrap()
            {
                "main" => Network::Bitcoin,
                "test" => Network::Testnet,
                network => panic!("Unknown network {}", network),
            }
        })
        .await
}

pub async fn send_to_address(address: bitcoin::Address, value: i64) -> [u8; 32] {
    let client = reqwest::Client::new();
    let resp = client
        .post(env::var("BITCOIND_URL").unwrap())
        .header(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("text/plain"),
        )
        .json(&
            json!({
                    "jsonrpc": "1.0",
                    "method": "sendtoaddress",
                    "params": [
                        address.to_string(),
                        Decimal::new(value, 8)
                    ]
        })
    )
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();
    info!("Bitcoin RPC Response {:?}", resp);
    resp.get("result")
        .map(|result| {
            hex::decode(result.as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap()
        })
        .unwrap()
}

pub async fn get_best_block_hash() -> [u8; 32] {
    let client = reqwest::Client::new();
    let resp = client
        .post(env::var("BITCOIND_URL").unwrap())
        .header(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("text/plain"),
        )
        .json(&json!({
                    "jsonrpc": "1.0",
                    "method": "getbestblockhash",
                    "params": []
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();

    resp.get("result")
        .map(|x| {
            hex::decode(x.as_str().unwrap())
                .unwrap()
                .try_into()
                .unwrap()
        })
        .unwrap()
}

pub async fn get_block(block_hash: [u8; 32], hot_wallet_addresses: Vec<bitcoin::Address>) -> Block {
    let client = reqwest::Client::new();
    let resp = client
        .post(env::var("BITCOIND_URL").unwrap())
        .header(
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("text/plain"),
        )
        .json(&json!({
                    "jsonrpc": "1.0",
                    "method": "getblock",
                    "params": [hex::encode(block_hash), 2]
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();

    Block {
        hash: resp
            .get("result")
            .unwrap()
            .get("hash")
            .map(|x| {
                hex::decode(x.as_str().unwrap())
                    .unwrap()
                    .try_into()
                    .unwrap()
            })
            .unwrap(),
        height: resp
            .get("result")
            .unwrap()
            .get("height")
            .map(|x| x.as_i64().unwrap())
            .unwrap(),
        parent_hash: resp
            .get("result")
            .unwrap()
            .get("previousblockhash")
            .map(|x| {
                hex::decode(x.as_str().unwrap())
                    .unwrap()
                    .try_into()
                    .unwrap()
            })
            .unwrap(),
        deposits: decode_deposits(
            resp.get("result")
                .unwrap()
                .get("tx")
                .unwrap()
                .as_array()
                .unwrap()
                .into_iter()
                .collect::<Vec<_>>(),
            &hot_wallet_addresses,
        ),
        withdrawls: vec![],
    }
}

pub fn decode_deposits(
    transaction_values: Vec<&Value>,
    hot_wallet_addresses: &Vec<bitcoin::Address>,
) -> Vec<Deposit> {
    transaction_values
        .into_iter()
        .flat_map(|transaction_value| {
            let transaction = decode_transaction(transaction_value);
            transaction
                .output
                .clone()
                .into_iter()
                .map(|output| {
                    (
                        transaction.compute_txid(),
                        output,
                        transaction.input[0].clone(),
                    )
                })
                .collect::<Vec<_>>()
        })
        .filter_map(
            |(txid, output, input): (bitcoin::Txid, bitcoin::TxOut, bitcoin::TxIn)| {
                if hot_wallet_addresses
                    .into_iter()
                    .map(|address| address.script_pubkey())
                    .collect::<Vec<bitcoin::ScriptBuf>>()
                    .contains(&output.script_pubkey)
                    && input.witness.nth(1).is_some()
                    && input.witness.nth(1).unwrap().len() == 33
                {
                    Some(Deposit {
                        depositor: input.witness.nth(1).unwrap().try_into().unwrap(),
                        transaction_hash: *<bitcoin::Txid as AsRef<[u8; 32]>>::as_ref(&txid),

                        value: output.value.to_sat() as i64,
                    })
                } else {
                    None
                }
            },
        )
        .collect()
}

fn decode_transaction(value: &Value) -> bitcoin::Transaction {
    let mut raw =
        bitcoin_io::Cursor::new(hex::decode(value.get("hex").unwrap().as_str().unwrap()).unwrap());
    bitcoin::Transaction::consensus_decode(&mut raw).unwrap()
}
