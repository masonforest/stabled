use futures_util::stream::StreamExt;
// use alloy::providers::WsConnect;
use crate::{AppState, db};
use alloy::{
    primitives::{address, Log},
    providers::{Provider, ProviderBuilder, WsConnect},
    rpc::types::{BlockNumberOrTag, Filter},
    sol,
    sol_types::SolEvent,
};
use crate::BBUSD::Transfer;
use tokio::sync::broadcast::Sender;
use sqlx::PgPool;
use std::{io::Read, time::Duration};
use tokio::time;
sol!(
    #[allow(missing_docs)]
    #[derive(Default, Debug)]
    #[sol(rpc)]
    BBUSD,
    "src/frontend/abi/contracts/BbUSD.sol/BbUSD.json"
);

pub async fn subscribe(pool: &PgPool, log_sender: Sender<([u8; 32], Transfer)>) {
    let mut interval = time::interval(time::Duration::from_secs(1));
    // loop {
    //     interval.tick().await;
    //     log_sender.send(Default::default()).unwrap();
    // }

    // Create the provider.
    let rpc_url = "wss://core.drpc.org";
    let ws = WsConnect::new(rpc_url);
    let provider = ProviderBuilder::new().on_ws(ws).await.unwrap();

    // Create a filter to watch for all bbusd events.
    let bbusd_token_address = address!("0xa84c5626954d01e0200050a800e9cdc3a00de7ff");
    let filter = Filter::new()
        // By NOT specifying an `event` or `event_signature` we listen to ALL events of the
        // contract.
        .address(bbusd_token_address)
        .from_block(BlockNumberOrTag::Latest);

    // Subscribe to logs.
    let sub = provider.subscribe_logs(&filter).await.unwrap();
    let mut stream = sub.into_stream();

    while let Some(log) = stream.next().await {
        println!("{:?}", log);
        match log.topic0() {
            // Match the `Approval(address,address,uint256)` event.
            Some(&BBUSD::Transfer::SIGNATURE_HASH) => {
                let transfer: BBUSD::Transfer = log.log_decode().unwrap().inner.data;
                // println!("{}", log.data().data.0.len());
                db::insert_transaction(
                    pool,
                    log.block_number.unwrap() as i64,
                    log.transaction_hash.unwrap().0,
                    *transfer.from.0,
                    *transfer.to.0,
                    log.data().data.0.to_vec().try_into().unwrap(),
                )
                .await
                .unwrap();
                // println!("log sse");
                log_sender.send((log.transaction_hash.unwrap().0.into(), transfer)).unwrap();
                // app_state.update_channel.lock().await.0.send((from, log.clone().into())).unwrap();
                // app_state.update_channel.lock().await.0.send((to, log.into())).unwrap();
                // println!("Transfer from {from} to {to} of value {value}");
            }
            _ => (),
        }
        // Match on topic 0, the hash of the signature of the event.
        // match log.topic0() {
        //     // Match the `Approval(address,address,uint256)` event.
        //     Some(&Ibbusd::Approval::SIGNATURE_HASH) => {
        //         let Ibbusd::Approval { src, guy, wad } = log.log_decode()?.inner.data;
        //         println!("Approval from {src} to {guy} of value {wad}");
        //     }
        //     // Match the `Transfer(address,address,uint256)` event.
        //     Some(&Ibbusd::Transfer::SIGNATURE_HASH) => {
        //         let Ibbusd::Transfer { src, dst, wad } = log.log_decode()?.inner.data;
        //         println!("Transfer from {src} to {dst} of value {wad}");
        //     }
        //     // bbusd's `Deposit(address,uint256)` and `Withdrawal(address,uint256)` events are not
        //     // handled here.
        // _ => (),
    }
}
