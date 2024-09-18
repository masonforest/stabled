use borsh::{BorshDeserialize, BorshSerialize};
use crate::address::Address;
use k256::ecdsa::{RecoveryId, Signature, SigningKey, VerifyingKey};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Clone, Debug, PartialOrd, sqlx::Type)]
#[sqlx(type_name = "token_type", rename_all = "lowercase")]
pub enum TokenType {
    Snt,
    Usd,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Transaction {
    pub nonce: i64,
    pub token_type: TokenType,
    pub to: Address,
    pub value: i64,
}

pub trait Signable: BorshSerialize + Clone {
    fn encode(&self) -> Vec<u8> {
        borsh::to_vec(self).unwrap()
    }

    fn sign(&self, signing_key: &SigningKey) -> Signed<Self> {
        let (signature, recovery_id) = signing_key.sign_recoverable(&self.encode()).unwrap();
        let signature_bytes: [u8; 65] = [
            signature.to_bytes().as_slice(),
            &[recovery_id.to_byte()],
        ]
        .concat()
        .try_into()
        .unwrap();
        Signed (
             self.clone(),
            signature_bytes

        )
    }
}

impl Signable for Transaction {}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Signed<T: Signable> (
    pub T,
    pub [u8; 65],
);

impl<T: Signable> Signed<T> {
    pub fn from_address(&self) -> [u8; 33] {
        let s: [u8; 64] = self.1[0..64].try_into().unwrap();
        let signature = Signature::from_bytes(&s.into()).unwrap();
        let recovery_id = RecoveryId::from_byte(self.1[64]).unwrap();
        VerifyingKey::recover_from_msg(&self.0.encode(), &signature, recovery_id)
            .unwrap()
            .to_sec1_bytes()
            .to_vec()
            .try_into()
            .unwrap()
    }
}