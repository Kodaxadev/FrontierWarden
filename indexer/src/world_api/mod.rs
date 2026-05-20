#![allow(dead_code)]

#[cfg(test)]
mod tests;
pub mod types;

use anyhow::{Context, Result};
use reqwest::StatusCode;
use std::time::Duration;

pub use types::*;

pub struct WorldApiClient {
    base_url: String,
    http: reqwest::Client,
}

impl WorldApiClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client");
        Self {
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            http,
        }
    }

    pub async fn health(&self) -> Result<serde_json::Value> {
        self.get_json("/health").await
    }

    pub async fn config(&self) -> Result<serde_json::Value> {
        self.get_json("/config").await
    }

    pub async fn fetch_all_solar_systems(&self) -> Result<Vec<(String, serde_json::Value)>> {
        self.fetch_all_pages("/v2/solarsystems", |val| {
            let id = val
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow::anyhow!("missing id in solar system"))?;
            Ok((id.to_string(), val))
        })
        .await
    }

    pub async fn fetch_all_tribes(&self) -> Result<Vec<(String, serde_json::Value)>> {
        self.fetch_all_pages("/v2/tribes", |val| {
            let id = val
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow::anyhow!("missing id in tribe"))?;
            Ok((id.to_string(), val))
        })
        .await
    }

    pub async fn fetch_all_ships(&self) -> Result<Vec<(String, serde_json::Value)>> {
        self.fetch_all_pages("/v2/ships", |val| {
            let id = val
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow::anyhow!("missing id in ship"))?;
            Ok((id.to_string(), val))
        })
        .await
    }

    pub async fn fetch_all_types(&self) -> Result<Vec<(String, serde_json::Value)>> {
        self.fetch_all_pages("/v2/types", |val| {
            let id = val
                .get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| anyhow::anyhow!("missing id in type"))?;
            Ok((id.to_string(), val))
        })
        .await
    }

    pub async fn stream_pages<F, Fut>(&self, path: &str, mut on_page: F) -> Result<StreamResult>
    where
        F: FnMut(Vec<(String, serde_json::Value)>, u32, u64) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        const PAGE_SIZE: u32 = 100;
        let mut offset: u32 = 0;
        let mut page_num: u32 = 0;
        let mut total_processed: usize = 0;

        tracing::info!(endpoint = path, "fetching from World API");

        loop {
            page_num += 1;

            let fetch_limit = if page_num == 1 { 1 } else { PAGE_SIZE };
            let page = self.fetch_page(path, offset, fetch_limit).await?;
            let page_total: u64 = page.metadata.total;

            if page_num == 1 {
                tracing::info!(
                    endpoint = path,
                    total_items = page_total,
                    page_size = PAGE_SIZE,
                    "starting paginated fetch"
                );
            }

            let items: Vec<(String, serde_json::Value)> = page
                .data
                .into_iter()
                .filter_map(|val| {
                    let id = val.get("id").and_then(|v| v.as_i64())?;
                    Some((id.to_string(), val))
                })
                .collect();

            let page_items = items.len();
            let new_total = total_processed + page_items;

            on_page(items, page_num, page_total).await?;
            total_processed = new_total;

            offset += PAGE_SIZE;
            if offset as u64 >= page_total {
                tracing::info!(
                    endpoint = path,
                    pages = page_num,
                    total_items = page_total,
                    total_processed,
                    "paginated fetch complete"
                );
                return Ok(StreamResult {
                    total_items: page_total,
                    total_processed,
                    pages: page_num,
                });
            }
        }
    }

    async fn get_json(&self, path: &str) -> Result<serde_json::Value> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("World API request failed: {url}"))?;
        let status = resp.status();
        handle_world_api_response(resp, url, status).await
    }

    async fn fetch_page(
        &self,
        path: &str,
        offset: u32,
        limit: u32,
    ) -> Result<WorldApiResponse<serde_json::Value>> {
        let url = format!(
            "{}{}?limit={}&offset={}",
            self.base_url, path, limit, offset
        );
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("World API request failed: {url}"))?;
        let status = resp.status();
        let body: serde_json::Value = handle_world_api_response(resp, url.clone(), status).await?;
        serde_json::from_value(body)
            .with_context(|| format!("World API response parse failed: {url}"))
    }

    async fn fetch_all_pages<F>(
        &self,
        path: &str,
        extract: F,
    ) -> Result<Vec<(String, serde_json::Value)>>
    where
        F: Fn(serde_json::Value) -> Result<(String, serde_json::Value)>,
    {
        const PAGE_SIZE: u32 = 100;
        let mut results = Vec::new();
        let mut offset: u32 = 0;
        let mut page_num: u32 = 0;

        loop {
            page_num += 1;
            let page = self.fetch_page(path, offset, PAGE_SIZE).await?;
            let total = page.metadata.total;

            if page_num == 1 {
                tracing::info!(
                    endpoint = path,
                    total_items = total,
                    page_size = PAGE_SIZE,
                    "starting paginated fetch"
                );
            }

            tracing::info!(
                endpoint = path,
                page = page_num,
                offset,
                page_size = PAGE_SIZE,
                items_in_page = page.data.len(),
                total_items = total,
                "fetched page"
            );

            for val in page.data {
                match extract(val) {
                    Ok(entry) => results.push(entry),
                    Err(e) => tracing::warn!("skipping world API entry: {e:#}"),
                }
            }

            offset += PAGE_SIZE;
            if offset as u64 >= total {
                tracing::info!(
                    endpoint = path,
                    pages = page_num,
                    total_items = total,
                    fetched = results.len(),
                    "paginated fetch complete"
                );
                break;
            }
        }

        Ok(results)
    }
}

pub struct StreamResult {
    pub total_items: u64,
    pub total_processed: usize,
    pub pages: u32,
}

async fn handle_world_api_response(
    resp: reqwest::Response,
    url: String,
    status: StatusCode,
) -> Result<serde_json::Value> {
    if status == StatusCode::TOO_MANY_REQUESTS {
        if let Some(retry_after) = resp.headers().get(reqwest::header::RETRY_AFTER) {
            tracing::error!(
                retry_after = ?retry_after,
                url = %url,
                "World API rate limited"
            );
            anyhow::bail!("World API rate limit exceeded at {url}, retry-after: {retry_after:?}");
        }
        anyhow::bail!("World API rate limit exceeded at {url}");
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .with_context(|| format!("World API response decode failed: {url}"))?;

    if !status.is_success() {
        tracing::error!(
            status = status.as_u16(),
            url = %url,
            "World API error response: {body}"
        );
        anyhow::bail!("World API {url} returned {status}: {body}");
    }

    Ok(body)
}
