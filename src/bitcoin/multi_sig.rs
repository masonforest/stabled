use crate::bitcoin::rpc::get_network;
use bitcoin::{opcodes::all, script::Builder, Address, PublicKey};

pub async fn address(m: i64, public_keys: Vec<PublicKey>) -> Address {
    let mut redeem_script = Builder::new();

    redeem_script = redeem_script.push_int(m);

    for public_key in &public_keys {
        redeem_script.clone().push_key(&public_key);
    }

    Address::p2wsh(
        redeem_script
            .clone()
            .push_int(public_keys.len() as i64)
            .push_opcode(all::OP_CHECKMULTISIG)
            .as_script(),
        *get_network().await,
    )
}
