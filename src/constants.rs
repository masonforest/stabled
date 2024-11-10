use bitcoin::key::{PrivateKey, PublicKey, Secp256k1};
use lazy_static::lazy_static;
use std::{env, net::IpAddr};

pub enum Env {
    Production,
    Development,
}
pub const SYSTEM_ADDRESS: [u8; 33] = [0; 33];
lazy_static! {
    pub static ref ENV: Env = if env::var("ENV").unwrap_or("".to_string()) == "production" {
        Env::Production
    } else {
        Env::Development
    };
    pub static ref PORT: u16 = env::var("PORT")
        .ok()
        .and_then(|port_str| port_str.parse::<u16>().ok())
        .unwrap_or(80);
    pub static ref PUBLIC_KEY: PublicKey =
        PublicKey::from_private_key(&Secp256k1::new(), &*PRIVATE_KEY);
    pub static ref NODE_ADDRESS: [u8; 33] = (*PUBLIC_KEY).inner.serialize();
    static ref PRIVATE_KEY: PrivateKey =
        PrivateKey::from_wif(&env::var("PRIVATE_KEY").expect("PRIVATE_KEY must be set")).unwrap();
    pub static ref PUBLIC_IP: IpAddr = env::var("PUBLIC_IP")
        .expect("PUBLIC_IP must be set")
        .parse()
        .expect("Failed to parse PUBLIC_IP");
    pub static ref LETS_ENCRYPT_EMAILS: Vec<String> = env::var("LETS_ENCRYPT_EMAILS")
        .and_then(|emails| Ok(emails
            .split(",")
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
            .clone()))
        .unwrap_or(vec![]);
    pub static ref LETS_ENCRYPT_DOMAINS: Vec<String> = env::var("LETS_ENCRYPT_DOMAINS")
        .and_then(|emails| Ok(emails
            .split(",")
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
            .clone()))
        .unwrap_or(vec![]);
    pub static ref COIN_MARKET_CAP_KEY: String = env::var("COIN_MARKET_CAP_KEY").unwrap();
}
