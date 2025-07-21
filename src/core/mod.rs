use alloy::{
    primitives::{Address, B256, Bytes, FixedBytes, LogData, address, U64},
    providers::{Provider, ProviderBuilder, WsConnect},
    rpc::types::{Filter, Log},
    sol,
    sol_types::SolEvent,
};
use tokio::time::Duration;
use tokio::time::sleep;
use futures::Stream;
use futures_util::stream::StreamExt;
use itertools::Itertools;
use reqwest::Client;
use serde_json::{Value, json};
use sqlx::types::JsonValue;
use std::{
    error::Error,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::sync::{mpsc, mpsc::UnboundedReceiver};
sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    CheckBook,
    "src/frontend/abi/contracts/CheckBook.sol/CheckBook.json"
);

pub async fn get_transactions(
    tx_hashes: Vec<FixedBytes<32>>,
    rpc_url: &str,
) -> Result<Vec<Transaction>, Box<dyn Error>> {
    if tx_hashes.is_empty() {
        return Ok(vec![]);
    }
    let rpc_provider = ProviderBuilder::new().connect_http(rpc_url.parse()?);
    wait_for_block(tx_hashes[0], &rpc_provider).await;
    let client = Client::new();
    let requests: Vec<Value> = tx_hashes
        .iter()
        .flat_map(|tx_hash| {
            [
                json!({
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionByHash",
                    "params": [tx_hash],
                }),
                json!({
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionReceipt",
                    "params": [tx_hash],
                }),
            ]
        })
        .enumerate()
        .map(|(index, mut request)| {
            request["id"] = json!(index);
            request
        })
        .collect();
    let response = client
        .post(rpc_url)
        .json(&requests)
        .send()
        .await?
        .json::<Vec<Value>>()
        .await?;
    Ok(response
        .chunks(2)
        .filter_map(|resp| {
            Some(Transaction {
                address: resp[0].get("result").expect("Failed to get result")
                    .get("to")
                    .expect("Failed to get to")
                    .as_str()
                    .expect("Failed to get input as string")
                    .parse::<Bytes>()
                    .ok()
                    .map(|bytes| bytes.to_vec().try_into().expect("Failed to get address"))
                    .expect("Failed to get address"),
                input: resp[0].get("result").expect("Failed to get result")
                    .get("input")
                    .expect("Failed to get input")
                    .as_str()
                    .expect("Failed to get input as string")
                    .parse::<Bytes>()
                    .ok()
                    .map(|bytes| bytes.to_vec())
                    .expect("Failed to get input"),
                hash: resp[0]
                    .get("result")?
                    .get("hash")?
                    .as_str()?
                    .parse::<FixedBytes<32>>()
                    .ok()?
                    ,
                block_number: u64::from_be_bytes(resp[1]
                    .get("result")?
                    .get("blockNumber")
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .parse::<U64>().unwrap().to_be_bytes_vec().try_into().unwrap())
                ,
                logs: resp[1]
                    .get("result")?
                    .get("logs")?
                    .as_array()?
                    .into_iter()
                    .map(|log| serde_json::from_value(log.clone()).unwrap())
                    .collect(),
            })
        })
        .collect())
}

pub async fn get_transactions2(
    tx_hashes: Vec<FixedBytes<32>>,
    rpc_url: String,
) -> Result<Vec<Transaction>, Box<dyn Error>> {
    if tx_hashes.is_empty() {
        return Ok(vec![]);
    }
    println!("tx_hashes: {:?}", tx_hashes);
    let requests = tx_hashes
        .iter()
        .flat_map(|tx_hash| {
            [
                json!({
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionByHash",
                    "params": [tx_hash],
                }),
                json!({
                    "jsonrpc": "2.0",
                    "method": "eth_getTransactionReceipt",
                    "params": [tx_hash],
                }),
            ]
        })
        .enumerate()
        .map(|(index, mut request)| {
            request["id"] = json!(index);
            request
        })
        .collect::<JsonValue>();
    let client = Client::new();
    // println!("req: {:?}", requests.to_string());
    let response = client
        .post(rpc_url)
        .json(&requests)
        .send()
        .await.expect("Failed to get transaction")
        .json::<Vec<Value>>()
        .await?;

    // println!(

    //     "{:?}", response
    // );
    // panic!("");
    // println!("res: {:?}", response);
    // panic!("done");
    Ok(response
        .chunks(2)
        .filter_map(|resp| {
            Some(Transaction {
                address: resp[0].get("result").expect("Failed to get result")
                    .get("to")
                    .expect("Failed to get to")
                    .as_str()
                    .expect("Failed to get input as string")
                    .parse::<Bytes>()
                    .ok()
                    .map(|bytes| bytes.to_vec().try_into().expect("Failed to get address"))
                    .expect("Failed to get address"),
                input: resp[0].get("result").expect("Failed to get result")
                    .get("input")
                    .expect("Failed to get input")
                    .as_str()
                    .expect("Failed to get input as string")
                    .parse::<Bytes>()
                    .ok()
                    .map(|bytes| bytes.to_vec())
                    .expect("Failed to get input"),
                hash: resp[0]
                    .get("result")?
                    .get("hash")?
                    .as_str()?
                    .parse::<FixedBytes<32>>()
                    .ok()?
                    ,
                    block_number: u64::from_be_bytes(resp[1]
                        .get("result")?
                        .get("blockNumber")
                        .unwrap()
                        .as_str()
                        .unwrap()
                        .parse::<U64>().unwrap().to_be_bytes_vec().try_into().unwrap())
                    ,
                logs: resp[1]
                    .get("result")?
                    .get("logs")?
                    .as_array()?
                    .into_iter()
                    .map(|log| serde_json::from_value(log.clone()).unwrap())
                    .collect(),
            })

        })
        .collect())
}

pub struct TransactionLogDataStream {
    initial_transactions: Vec<Transaction>,
    receiver: UnboundedReceiver<Transaction>,
}

#[derive(Default, Debug)]
pub struct Transaction {
    pub address: [u8; 20],
    pub hash: FixedBytes<32>,
    pub input: Vec<u8>,
    pub block_number: u64,
    pub logs: Vec<LogData>,
}
impl Stream for TransactionLogDataStream {
    type Item = Transaction;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if !self.initial_transactions.is_empty() {
            return Poll::Ready(Some(self.initial_transactions.remove(0)));
        }

        loop {
            return match self.receiver.poll_recv(cx) {
                Poll::Ready(Some(item)) => return Poll::Ready(Some(item)),
                Poll::Ready(None) => std::task::Poll::Pending,
                Poll::Pending => return Poll::Pending,
            };
        }
    }
}
impl TransactionLogDataStream {
    pub async fn new(address: Address) -> Result<Self, Box<dyn std::error::Error>> {
        let checkbook_address = address!("0x168b0e3a5aD6343Ea1BAc552F72D8C7a88Cf65D6");
        let rpc_url = std::env::var("CORE_RPC_URL").expect("CORE_RPC_URL environment variable not set");
        let wss_url = "wss://ws.coredao.org";
        let filter = Filter {
            topics: [
                vec![CheckBook::CheckFunded::SIGNATURE_HASH, CheckBook::CheckRedeemed::SIGNATURE_HASH].into(),
                address.into(),
                Default::default(),
                Default::default(),
            ],
            address: checkbook_address.into(),
            ..Default::default()
        }
        // .event_signature(CheckBook::CheckFunded::SIGNATURE_HASH)
        .from_block(0);
        println!("{}", checkbook_address);
        let rpc_provider = ProviderBuilder::new().connect_http(rpc_url.parse()?);
        let sub = rpc_provider.get_logs(&filter).await?;

        let initial_hashes = sub
            .iter()
            .filter_map(|log| log.transaction_hash)
            .collect::<Vec<B256>>();

        // println!("{:?}", initial_hashes);
        let initial_transactions = get_transactions(initial_hashes, &rpc_url).await?;
        println!("{}", initial_transactions.len());

        let ws = WsConnect::new(wss_url);
        let wss_provider = ProviderBuilder::new().connect_ws(ws).await?;
        let (sender, receiver) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            let mut stream = wss_provider.subscribe_blocks().await.unwrap().into_stream();
            'outer: while let Some(block) = stream.next().await {
                let f = filter.clone().at_block_hash(block.hash);
                let logs: Vec<Log> = get_logs(f, &rpc_provider).await;

                // Collect all unique transaction_hashes from logs
                let transaction_hashes: Vec<FixedBytes<32>> = logs
                    .iter()
                    .filter_map(|log| log.transaction_hash)
                    .unique()
                    .collect();
                let transactions = get_transactions(transaction_hashes.clone(), &rpc_url).await.unwrap()
                .into_iter();
                // .for_each(|transaction| sender.send(transaction).unwrap())

                // ;
                for transaction in transactions {
                    if sender.send(transaction).is_err(){
                        break 'outer
                }
                }
            }
        });

        // println!("{:?}", initial_transactions);
        Ok(Self {
            initial_transactions,
            receiver,
        })
    }
}
pub async fn wait_for_block(transaction_hash: FixedBytes<32>, rpc_provider: impl Provider) {
    loop {
        if let Ok(_) = rpc_provider.get_transaction_by_hash(transaction_hash).await {
            return ()
        }
        sleep(Duration::from_secs(1)).await;
        println!("Block not ready trying again");
    }
}

pub async fn get_logs(filter: Filter, rpc_provider: impl Provider) -> Vec<Log> {
    loop {
        if let Ok(logs) = rpc_provider.get_logs(&filter).await {
            return logs
        }
        sleep(Duration::from_secs(1)).await;
        println!("Block not ready trying again");
    }
}