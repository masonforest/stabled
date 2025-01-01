use crate::{constants::COIN_MARKET_CAP_KEY, error::Result};
use reqwest::Client;
use serde_json::Value;

pub async fn bitcoin() -> Result<u64> {
    // Create an HTTP client
    let client = Client::new();

    // Perform the GET request
    let response = client
        .get("https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=BTC")
        .header("X-CMC_PRO_API_KEY", COIN_MARKET_CAP_KEY.clone())
        .send()
        .await;

    match response {
        Ok(resp) => {
            // println!("{:?}", resp);
            // Parse the JSON response
            let json: Value = resp.json().await?;
            // Print the JSON data
            println!(
                "{:#}",
                json.get("data").expect("data").get("BTC").expect("BTC")[0]
                    .get("quote")
                    .expect("quote")
                    .get("USD")
                    .expect("USD")
                    .get("price")
                    .expect("price")
            );
            Ok((json.get("data").expect("data").get("BTC").expect("BTC")[0]
                .get("quote")
                .expect("quote")
                .get("USD")
                .expect("USD")
                .get("price")
                .expect("price")
                .as_f64()
                .expect("not f64")
                * 1000.00) as u64)
        }
        Err(e) => Err(e.into()),
    }
}
