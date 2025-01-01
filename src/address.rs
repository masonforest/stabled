use crate::{BorshDeserialize, BorshSerialize};
use bitcoin::ScriptBuf;
use k256::ecdsa::VerifyingKey;
use sha2::Digest;
use sha2::Sha256;
#[derive(
    Clone, Copy, sqlx::Type, PartialEq, sqlx::FromRow, Debug, BorshSerialize, BorshDeserialize,
)]
#[sqlx(transparent)]
pub struct Address(pub [u8; 17]);

impl From<[u8; 33]> for Address {
    fn from(array: [u8; 33]) -> Self {
        let hash = Sha256::digest(array);
        Self(hash[15..].try_into().unwrap())
    }
}

impl From<bitcoin::PublicKey> for Address {
    fn from(public_key: bitcoin::PublicKey) -> Self {
        public_key.inner.serialize().into()
    }
}
impl From<VerifyingKey> for Address {
    fn from(verifying_key: VerifyingKey) -> Self {
        <[u8; 33]>::try_from(verifying_key.to_sec1_bytes().as_ref())
            .unwrap()
            .into()
    }
}

pub fn script_buf_to_address(script_buf: &ScriptBuf) -> Address {
    Address(
        script_buf
            .instructions()
            .nth(1)
            .unwrap()
            .unwrap()
            .push_bytes()
            .unwrap()
            .as_bytes()[3..]
            .try_into()
            .unwrap(),
    )
}
