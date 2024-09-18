use crate::error::Result;
use crate::Error;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
pub type Address = [u8; 33];

pub fn from_str(address: &str) -> Result<Address> {
    if !address.starts_with("usd1") {
        return Err(Error::InvalidAddressError(address.to_string()))
    }

    Ok(URL_SAFE_NO_PAD.decode(&address[4..]).map_err(|_| Error::InvalidAddressError(address.to_string()))?.try_into().map_err(|_| Error::InvalidAddressError(address.to_string()))?)
}

pub fn to_str(address: Address) -> String {
    format!("usd1{}", URL_SAFE_NO_PAD.encode(&address[..]))
}