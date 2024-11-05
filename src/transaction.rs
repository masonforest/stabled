use crate::address::Address;
use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Clone, Debug, PartialOrd, sqlx::Type)]
#[sqlx(type_name = "token_type", rename_all = "lowercase")]
pub enum TokenType {
    Snt,
    Usd,
}

impl FromStr for TokenType {

    type Err = ();

    fn from_str(input: &str) -> Result<Self, Self::Err> {
        match input {
            "snt"  => Ok(Self::Snt),
            "usd"  => Ok(Self::Usd),
            _      => Err(()),
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Transfer {
    pub nonce: i64,
    pub token_type: TokenType,
    pub to: Address,
    pub value: i64,
}
