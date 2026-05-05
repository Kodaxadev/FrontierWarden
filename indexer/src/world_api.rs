// EVE World API client — called from eve_identity pipeline; struct/method
// definitions here are scaffolded for future direct call sites.
#![allow(dead_code)]

use anyhow::{Context, Result};
use reqwest::StatusCode;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

// ── Wire types ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct WorldApiResponse<T> {
    pub data: Vec<T>,
    pub metadata: WorldApiMetadata,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldApiMetadata {
    pub total: u64,
    pub limit: u32,
    pub offset: u32,
}

// Minimal typed structs — full JSON preserved via `raw` in DB.
#[derive(Debug, Deserialize, Clone)]
pub struct WorldSolarSystem {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldTribe {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldShip {
    pub id: i64,
    pub name: Option<String>,
    #[serde(rename = "classId")]
    pub class_id: Option<i64>,
    #[serde(rename = "className")]
    pub class_name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldType {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

// ── Client ────────────────────────────────────────────────────────────────────

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

    // ── Paginated fetchers (legacy: fetches all into memory) ─────────────

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

    // ── Streaming page callback ───────────────────────────────────────────

    /// Fetch pages one at a time, calling `on_page` for each batch of rows.
    /// This enables incremental DB writes instead of buffering everything.
    /// The callback is async so it can perform database writes.
    pub async fn stream_pages<F, Fut>(
        &self,
        path: &str,
        mut on_page: F,
    ) -> Result<StreamResult>
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

    // ── Internal helpers ──────────────────────────────────────────────────

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
        let body: serde_json::Value =
            handle_world_api_response(resp, url.clone(), status).await?;
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

/// Result of a streaming page fetch.
pub struct StreamResult {
    pub total_items: u64,
    pub total_processed: usize,
    pub pages: u32,
}

/// Handle World API HTTP response with clear error logging.
async fn handle_world_api_response(
    resp: reqwest::Response,
    url: String,
    status: StatusCode,
) -> Result<serde_json::Value> {
    // Handle rate limits explicitly
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_new_trims_trailing_slash() {
        let client = WorldApiClient::new("https://example.com/");
        assert_eq!(client.base_url, "https://example.com");
    }

    #[test]
    fn client_new_without_trailing_slash() {
        let client = WorldApiClient::new("https://example.com");
        assert_eq!(client.base_url, "https://example.com");
    }

    #[test]
    fn deserialize_solar_system() {
        let json = serde_json::json!({
            "id": 30000001,
            "name": "A 2560",
            "constellationId": 20000001,
            "regionId": 10000001,
            "location": {
                "x": -5103797186450162000i64,
                "y": -442889159183433700i64,
                "z": 1335601100954271700i64
            }
        });
        let ss: WorldSolarSystem = serde_json::from_value(json).unwrap();
        assert_eq!(ss.id, 30000001);
        assert_eq!(ss.name, Some("A 2560".to_string()));
        assert!(ss.raw_extra.contains_key("constellationId"));
        assert!(ss.raw_extra.contains_key("location"));
    }

    #[test]
    fn deserialize_tribe() {
        let json = serde_json::json!({
            "id": 1000044,
            "name": "NPC Corp 1000044",
            "nameShort": "SAK",
            "description": "",
            "taxRate": 0,
            "tribeUrl": ""
        });
        let tribe: WorldTribe = serde_json::from_value(json).unwrap();
        assert_eq!(tribe.id, 1000044);
        assert_eq!(tribe.name, Some("NPC Corp 1000044".to_string()));
        assert!(tribe.raw_extra.contains_key("nameShort"));
        assert!(tribe.raw_extra.contains_key("taxRate"));
    }

    #[test]
    fn deserialize_ship() {
        let json = serde_json::json!({
            "id": 81609,
            "name": "USV",
            "classId": 25,
            "className": "Frigate",
            "description": "A light vessel optimized for resource extraction (placeholder)."
        });
        let ship: WorldShip = serde_json::from_value(json).unwrap();
        assert_eq!(ship.id, 81609);
        assert_eq!(ship.name, Some("USV".to_string()));
        assert_eq!(ship.class_id, Some(25));
        assert_eq!(ship.class_name, Some("Frigate".to_string()));
        assert!(ship.raw_extra.contains_key("description"));
    }

    #[test]
    fn deserialize_type() {
        let json = serde_json::json!({
            "id": 72244,
            "name": "Feral Data",
            "description": "",
            "mass": 0.1,
            "radius": 1,
            "volume": 0.1,
            "portionSize": 1,
            "groupName": "Rogue Drone Analysis Data",
            "groupId": 0,
            "categoryName": "Commodity",
            "categoryId": 17,
            "iconUrl": ""
        });
        let t: WorldType = serde_json::from_value(json).unwrap();
        assert_eq!(t.id, 72244);
        assert_eq!(t.name, Some("Feral Data".to_string()));
        assert!(t.raw_extra.contains_key("mass"));
        assert!(t.raw_extra.contains_key("groupName"));
    }

    #[test]
    fn deserialize_paginated_response() {
        let json = serde_json::json!({
            "data": [
                {"id": 30000001, "name": "A 2560"},
                {"id": 30000002, "name": "B 2561"}
            ],
            "metadata": { "total": 24502, "limit": 100, "offset": 0 }
        });
        let resp: WorldApiResponse<serde_json::Value> = serde_json::from_value(json).unwrap();
        assert_eq!(resp.metadata.total, 24502);
        assert_eq!(resp.metadata.limit, 100);
        assert_eq!(resp.data.len(), 2);
        assert_eq!(resp.data[0]["name"], "A 2560");
    }
}
