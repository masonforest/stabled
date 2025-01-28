use self::super::rpc;
use crate::address::script_buf_to_address;
use crate::db::Utxo;
use crate::{db, exchange_rates, Address, AppState, Currency};
use bitcoin::Transaction;
use std::collections::HashMap;
use tokio::time;

pub async fn run(app_state: AppState) {
    let mut interval = time::interval(time::Duration::from_secs(1));
    loop {
        interval.tick().await;
        poll(&app_state).await;
    }
}

pub async fn poll(app_state: &AppState) {
    let current_best_block_hash = db::get_best_block_hash(&*app_state.pool.lock().await)
        .await
        .unwrap();
    let new_best_block_hash = rpc::get_best_block_hash().await;

    if current_best_block_hash != Some(new_best_block_hash) {
        println!(
            "Inserting Bitcoin Block {}",
            hex::encode(new_best_block_hash)
        );
        use std::time::{SystemTime, UNIX_EPOCH};

        let start = SystemTime::now();
        let since_the_epoch = start
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");
        println!("{:?}", since_the_epoch);
        let block = rpc::get_block(new_best_block_hash).await;
        let deposit_utxos: Vec<(db::Utxo, Address)> = txdata_to_utxos(block.txdata.clone());

        for (_, address) in &deposit_utxos {
            app_state
                .update_channel
                .lock()
                .await
                .0
                .send(*address)
                .unwrap();
        }
        db::insert_bitcoin_block(
            &app_state.pool.lock().await.clone(),
            block.clone(),
            HashMap::from([(Currency::Usd, exchange_rates::bitcoin().await.unwrap())]),
            deposit_utxos,
        )
        .await
        .unwrap();
    }
}

fn txdata_to_utxos(txdata: Vec<Transaction>) -> Vec<(db::Utxo, Address)> {
    txdata
        .clone()
        .into_iter()
        .flat_map(|t| {
            t.output.clone().into_iter().enumerate().map(move |(i, o)| {
                (
                    Utxo {
                        transaction_id: <bitcoin::Txid as AsRef<[u8; 32]>>::as_ref(
                            &t.compute_txid(),
                        )
                        .iter()
                        .copied()
                        .rev()
                        .collect::<Vec<_>>()
                        .to_vec(),
                        vout: i as i32,
                        value: o.value.to_sat() as i64,
                    },
                    o.clone(),
                )
            })
        })
        .filter(|(_, output)| {
            output.script_pubkey.is_p2wpkh()
                && crate::bitcoin::is_stable_address(&output.script_pubkey)
        })
        .map(|(utxo, output)| (utxo, script_buf_to_address(&output.script_pubkey)))
        .collect()
}
