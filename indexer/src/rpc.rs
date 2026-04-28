use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// ── Wire types ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct SuiEvent {
    pub id: EventId,
    #[serde(rename = "packageId")]
    pub package_id: String,
    #[serde(rename = "transactionModule")]
    pub transaction_module: String,
    pub sender: Option<String>,
    /// Full StructTag, e.g. "0x11a3...::schema_registry::SchemaRegistered"
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(rename = "parsedJson")]
    pub parsed_json: Value,
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: Option<String>,
    pub checkpoint: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EventId {
    #[serde(rename = "txDigest")]
    pub tx_digest: String,
    #[serde(rename = "eventSeq")]
    pub event_seq: String,
}

#[derive(Debug, Deserialize)]
pub struct EventPage {
    pub data: Vec<SuiEvent>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<EventId>,
    #[serde(rename = "hasNextPage")]
    pub has_next_page: bool,
}

// ── RPC client ────────────────────────────────────────────────────────────────

pub struct RpcClient {
    http: reqwest::Client,
    url:  String,
}

impl RpcClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self { http: reqwest::Client::new(), url: url.into() }
    }

    /// Fetch a page of events from a single Move module, starting after `cursor`.
    /// Returns events in ascending checkpoint order.
    pub async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let filter = json!({
            "MoveModule": { "package": package_id, "module": module }
        });
        let cursor_param = cursor.map(|c| json!(c)).unwrap_or(Value::Null);

        let body = json!({
            "jsonrpc": "2.0",
            "id":      1,
            "method":  "suix_queryEvents",
            "params":  [filter, cursor_param, limit, false]
        });

        let resp: Value = self.http
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .context("RPC HTTP request failed")?
            .json()
            .await
            .context("RPC response JSON decode failed")?;

        if let Some(err) = resp.get("error") {
            anyhow::bail!("Sui RPC error: {err}");
        }

        let result = resp.get("result").context("missing 'result' in RPC response")?;
        serde_json::from_value(result.clone()).context("EventPage deserialize failed")
    }
}

// ── Field extraction helpers ──────────────────────────────────────────────────

/// Extract the short event name from a full StructTag string.
/// "0x11a3...::schema_registry::SchemaRegistered" → "SchemaRegistered"
pub fn event_name(type_: &str) -> &str {
    type_.rsplit("::").next().unwrap_or(type_)
}

/// Parse a `vector<u8>` field from parsed_json.
///
/// Sui serializes Move `vector<u8>` as a JSON array of byte integers.
/// If the value is already a string (e.g. a pre-decoded representation),
/// it is returned as-is.
pub fn field_str(payload: &Value, key: &'static str) -> Result<String> {
    let v = payload.get(key).with_context(|| format!("missing field '{key}'"))?;
    match v {
        Value::Array(arr) => {
            let bytes: Vec<u8> = arr.iter()
                .filter_map(|n| n.as_u64().map(|b| b as u8))
                .collect();
            String::from_utf8(bytes)
                .with_context(|| format!("field '{key}': bytes are not valid UTF-8"))
        }
        Value::String(s) => Ok(s.clone()),
        _ => anyhow::bail!("field '{key}': unexpected JSON type"),
    }
}

/// Parse an address or `sui::object::ID` field.
///
/// Plain addresses arrive as "0x..." strings.
/// `ID` structs arrive as {"bytes": "0x..."} in some SDK versions.
pub fn field_addr(payload: &Value, key: &'static str) -> Result<String> {
    let v = payload.get(key).with_context(|| format!("missing field '{key}'"))?;
    match v {
        Value::String(s) => Ok(s.clone()),
        Value::Object(obj) => {
            obj.get("bytes")
                .and_then(|b| b.as_str())
                .map(|s| s.to_owned())
                .with_context(|| format!("field '{key}': no 'bytes' key in ID object"))
        }
        _ => anyhow::bail!("field '{key}': expected string or ID object"),
    }
}

/// Parse an optional address field (JSON null → None).
pub fn field_opt_addr(payload: &Value, key: &'static str) -> Option<String> {
    let v = payload.get(key)?;
    match v {
        Value::Null => None,
        Value::String(s) if s.is_empty() => None,
        Value::String(s) => Some(s.clone()),
        Value::Object(obj) => obj.get("bytes")?.as_str().map(|s| s.to_owned()),
        _ => None,
    }
}

/// Parse a `u64` field. Sui encodes large integers as JSON strings to avoid
/// JS precision loss, so we handle both string and number representations.
pub fn field_u64(payload: &Value, key: &'static str) -> Result<i64> {
    let v = payload.get(key).with_context(|| format!("missing field '{key}'"))?;
    match v {
        Value::String(s) => s.parse::<i64>()
            .with_context(|| format!("field '{key}': cannot parse '{s}' as i64")),
        Value::Number(n) => n.as_i64()
            .with_context(|| format!("field '{key}': number out of i64 range")),
        _ => anyhow::bail!("field '{key}': expected string or number"),
    }
}

/// Parse a bool field.
pub fn field_bool(payload: &Value, key: &'static str) -> Result<bool> {
    payload.get(key)
        .and_then(|v| v.as_bool())
        .with_context(|| format!("missing bool field '{key}'"))
}
