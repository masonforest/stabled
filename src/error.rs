use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::{array::TryFromSliceError, convert::Infallible};

pub type Result<T> = core::result::Result<T, Error>;

#[derive(thiserror::Error, Debug, Clone)]
pub enum Error {
    #[error("{0}")]
    Error(String),
    #[error("{0}")]
    SqlxError(String),
    #[error("Invalid Address Error: {0}")]
    InvalidAddressError(String),
    #[error("{0}")]
    IoError(String),
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
    }
}

impl From<Infallible> for Error {
    fn from(err: Infallible) -> Self {
        Error::Error(err.to_string())
    }
}
impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::IoError(err.to_string())
    }
}

impl From<sqlx::Error> for Error {
    fn from(err: sqlx::Error) -> Self {
        Error::SqlxError(err.to_string())
    }
}

impl From<Vec<u8>> for Error {
    fn from(err: Vec<u8>) -> Self {
        Error::Error(hex::encode(err))
    }
}

impl From<base64::DecodeError> for Error {
    fn from(err: base64::DecodeError) -> Self {
        Error::Error(err.to_string())
    }
}

impl From<hex::FromHexError> for Error {
    fn from(err: hex::FromHexError) -> Self {
        Error::Error(err.to_string())
    }
}

impl From<TryFromSliceError> for Error {
    fn from(err: TryFromSliceError) -> Self {
        Error::Error(err.to_string())
    }
}
impl From<bitcoin::address::ParseError> for Error {
    fn from(err: bitcoin::address::ParseError) -> Self {
        Error::Error(err.to_string())
    }
}
impl From<reqwest::Error> for Error {
    fn from(err: reqwest::Error) -> Self {
        Error::Error(err.to_string())
    }
}
