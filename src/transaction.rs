use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

#[derive(
    Hash, BorshSerialize, BorshDeserialize, PartialEq, Clone, Debug, PartialOrd, sqlx::Type, Eq,
)]
#[sqlx(type_name = "currency", rename_all = "lowercase")]
pub enum Currency {
    Usd,
}
#[derive(Clone, Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum Address {
    Bitcoin(String),
    Stable(crate::Address),
}

impl FromStr for Currency {
    type Err = ();

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        match input {
            "usd" => Ok(Self::Usd),
            _ => Err(()),
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Transfer {
    pub currency: Currency,
    pub to: Address,
    pub value: i64,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct ClaimUtxo {
    pub currency: Currency,
    pub transaction_id: [u8; 32],
    pub vout: i32,
}
