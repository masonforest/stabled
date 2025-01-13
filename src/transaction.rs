use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

#[cfg(test)]
use k256::ecdsa::SigningKey;

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
pub struct CreateCheck {
    pub signer: crate::Address,
    pub currency: Currency,
    pub value: i64,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct CashCheck {
    pub transaction_id: i64,
    pub signature: [u8; 65],
}
impl CashCheck {
    #[cfg(test)]
    pub fn sign(
        transaction_id: i64,
        recipient_address: crate::Address,
        signing_key: &SigningKey,
    ) -> Self {
        let (signature, recovery_id) = signing_key
            .sign_recoverable(&borsh::to_vec(&(transaction_id, &recipient_address)).unwrap())
            .unwrap();
        let signature_bytes: [u8; 65] = [signature.to_bytes().as_slice(), &[recovery_id.to_byte()]]
            .concat()
            .try_into()
            .unwrap();
        Self {
            transaction_id: transaction_id,
            signature: signature_bytes,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct ClaimUtxo {
    pub currency: Currency,
    pub transaction_id: [u8; 32],
    pub vout: i32,
}
