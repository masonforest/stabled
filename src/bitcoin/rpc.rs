use bitcoin::{consensus::Decodable, Network};
use log::info;
use rust_decimal::Decimal;
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
        .json(&json!({
                    "jsonrpc": "1.0",
                    "method": "sendtoaddress",
                    "params": [
                        address.to_string(),
                        Decimal::new(value, 8)
                    ]
        }))
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

pub async fn get_block(block_hash: [u8; 32]) -> bitcoin::Block {
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
                    "params": [hex::encode(block_hash), 0]
        }))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap();

    let mut raw = bitcoin_io::Cursor::new(
        hex::decode(resp.get("result").unwrap().as_str().unwrap()).unwrap(),
    );
    bitcoin::Block::consensus_decode(&mut raw).unwrap()
}

#[cfg(test)]
mod tests {

    // #[tokio::test]
    // async fn test_get_block2() {
    //     dotenv().ok();
    //     println!("{}", hex::encode(get_best_block_hash().await));
    //     let block = get_block(
    //         hex::decode("00000000000000000001330b19514a342ff0cb95b4df6a51f94116067b4cf21f")
    //             .unwrap()
    //             .try_into()
    //             .unwrap(),
    //     )
    //     .await;
    //     println!("{:?}", block);
    // }
}
