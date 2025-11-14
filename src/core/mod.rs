use crate::constants::{CHECKBOOK_ADDRESS, RPC_URL};
use alloy::{
    primitives::{Address, B256, Bytes, FixedBytes, LogData, U64},
    providers::{Provider, ProviderBuilder},
    rpc::types::{Filter, Log},
    sol,
    sol_types::SolEvent,
};
use futures::Stream;
use itertools::Itertools;
use reqwest::Client;
use serde_json::{Value, json};
use std::{
    error::Error,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::{
    sync::{broadcast::Receiver, mpsc, mpsc::UnboundedReceiver},
    time::{Duration, sleep},
};
sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    CheckBook,
    "src/frontend/abi/contracts/CheckBook.sol/CheckBook.json"
);

pub async fn get_transactions(
    tx_hashes: Vec<FixedBytes<32>>,
) -> Result<Vec<Transaction>, Box<dyn Error>> {
    if tx_hashes.is_empty() {
        return Ok(vec![]);
    }
    println!("connecting to RPC");
    let rpc_provider = ProviderBuilder::new().connect_http(RPC_URL.parse()?);
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
        .post(RPC_URL.clone())
        .json(&requests)
        .send()
        .await?
        .json::<Vec<Value>>()
        .await?;
    Ok(response
        .chunks(2)
        .filter_map(|resp| {
            Some(Transaction {
                address: resp[0]
                    .get("result")
                    .expect("Failed to get result")
                    .get("to")
                    .expect("Failed to get to")
                    .as_str()
                    .expect("Failed to get input as string")
                    .parse::<Bytes>()
                    .ok()
                    .map(|bytes| bytes.to_vec().try_into().expect("Failed to get address"))
                    .expect("Failed to get address"),
                input: resp[0]
                    .get("result")
                    .expect("Failed to get result")
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
                    .ok()?,
                block_number: u64::from_be_bytes(
                    resp[1]
                        .get("result")?
                        .get("blockNumber")
                        .unwrap()
                        .as_str()
                        .unwrap()
                        .parse::<U64>()
                        .unwrap()
                        .to_be_bytes_vec()
                        .try_into()
                        .unwrap(),
                ),
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

// static STREAM: OnceCell<SubscriptionStream<Log>> = OnceCell::const_new();

// async fn get_event_stream() -> SubscriptionStream<Log> {
//     STREAM.get_or_init(|| async {
//         let ws = WsConnect::new(WSS_URL.clone());
//         let provider = ProviderBuilder::new().connect_ws(ws).await.unwrap();
//         let filter = Filter::new().address(*CHECKBOOK_ADDRESS);
//         let sub = provider.subscribe_logs(&filter).await.unwrap();
//         sub.into_stream()
//     }).await.clone()

// }

impl TransactionLogDataStream {
    pub async fn new(
        address: Address,
        mut receiver2: Receiver<Log>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let rpc_provider = ProviderBuilder::new().connect_http(RPC_URL.parse()?);
        println!("before logs");
        // let filter = Filter::new()
        //     .address(*CHECKBOOK_ADDRESS)
        //     .event_signature(CheckBook::Feed::SIGNATURE_HASH)
        //     .topic1(address)
        //     .from_block(63795403);
        // let initial_hashes = rpc_provider
        //     .get_logs(&filter)
        //     .await?
        //     .iter()
        //     .filter_map(|log| log.transaction_hash)
        //     .collect::<Vec<B256>>();
        println!("got initial hashes");
        let initial_transactions = vec![];//get_transactions(initial_hashes).await?;

        // let ws = WsConnect::new(WSS_URL.clone());
        // let wss_provider = ProviderBuilder::new().connect_ws(ws).await?;
        let (sender, receiver) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            // let mut stream = get_event_stream().await;
            'outer: while let Ok(log) = receiver2.recv().await {
                // println!("new log {:?}", log);
                let transaction_hashes: Vec<FixedBytes<32>> = vec![log]
                    .iter()
                    .filter(|log| {
                        log.topics()[0] == CheckBook::Feed::SIGNATURE_HASH
                            && Address::from_slice(&log.topics()[1][12..]) == address
                    })
                    .filter_map(|log| log.transaction_hash)
                    .unique()
                    .collect();
                let transactions = get_transactions(transaction_hashes.clone())
                    .await
                    .unwrap()
                    .into_iter();
                for transaction in transactions {
                    if sender.send(transaction).is_err() {
                        break 'outer;
                    }
                }
            }
            // let mut stream = wss_provider.subscribe_blocks().await.unwrap().into_stream();
            // 'outer: while let Some(block) = stream.next().await {
            //     let f = filter.clone().at_block_hash(block.hash);
            //     let logs: Vec<Log> = get_logs(f, &rpc_provider).await;

            //     // Collect all unique transaction_hashes from logs
            //     let transaction_hashes: Vec<FixedBytes<32>> = logs
            //         .iter()
            //         .filter_map(|log| log.transaction_hash)
            //         .unique()
            //         .collect();
            //     let transactions = get_transactions(transaction_hashes.clone()).await.unwrap()
            //     .into_iter();
            //     // .for_each(|transaction| sender.send(transaction).unwrap())

            //     // ;
            //     for transaction in transactions {
            //         if sender.send(transaction).is_err(){
            //             break 'outer
            //     }
            //     }
            // }
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
            return ();
        }
        sleep(Duration::from_secs(1)).await;
        println!("Block not ready trying again");
    }
}

pub async fn get_logs(filter: Filter, rpc_provider: impl Provider) -> Vec<Log> {
    loop {
        if let Ok(logs) = rpc_provider.get_logs(&filter).await {
            return logs;
        }
        sleep(Duration::from_secs(1)).await;
        println!("Block not ready trying again");
    }
}
