pub mod multi_sig;
pub mod poller;
pub mod rpc;

#[derive(Debug, Default)]
pub struct Block {
    pub hash: [u8; 32],
    pub height: i64,
    pub parent_hash: [u8; 32],
    pub deposits: Vec<Deposit>,
    pub withdrawls: Vec<Withdrawl>,
}

#[derive(Debug)]
pub struct Deposit {
    pub depositor: [u8; 33],
    pub transaction_hash: [u8; 32],
    pub value: i64,
}


#[derive(Debug)]
pub struct Withdrawl {
    pub hash: [u8; 32],
    pub value: i64,
}
