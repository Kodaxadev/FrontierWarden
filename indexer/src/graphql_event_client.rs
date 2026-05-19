// graphql_event_client.rs — Sui GraphQL event source for the indexer.
//
// Implements `SuiEventSource` behind the existing trait boundary so
// `ingester::run` can be driven by either JSON-RPC or GraphQL.
//
// Selected at startup via `[network] event_source_mode = "graphql"`.
// Default remains "jsonrpc" (no production behavior change).
//
// See Documents/INDEXER_EVENT_GRAPHQL_SPIKE.md for the research spike.

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;

use crate::event_source::SuiEventSource;
use crate::rpc::{EventId, EventPage, SuiEvent};

// ── GraphQL query ────────────────────────────────────────────────────────────

const EVENTS_QUERY: &str = r#"
query Events($filter: EventFilter!, $cursor: String, $limit: Int) {
  events(filter: $filter, after: $cursor, first: $limit) {
    nodes {
      sequenceNumber
      timestamp
      sender { address }
      contents { json type { repr } }
      transactionModule { package { address } name }
      transaction {
        digest
        effects { checkpoint { sequenceNumber } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
"#;

/// Sentinel value stored in `EventId.event_seq` to distinguish a GraphQL
/// opaque cursor (stored in `EventId.tx_digest`) from a JSON-RPC cursor.
pub const GQL_CURSOR_SENTINEL: &str = "gql";

// ── Wire types (GraphQL response) ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GqlResponse {
    data: Option<GqlData>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct GqlData {
    events: Option<GqlEventConnection>,
}

#[derive(Debug, Deserialize)]
struct GqlEventConnection {
    nodes: Vec<GqlEventNode>,
    #[serde(rename = "pageInfo")]
    page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
struct GqlPageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GqlEventNode {
    #[serde(rename = "sequenceNumber")]
    sequence_number: u64,
    timestamp: Option<String>,
    sender: Option<GqlAddress>,
    contents: Option<GqlMoveValue>,
    #[serde(rename = "transactionModule")]
    transaction_module: Option<GqlMoveModule>,
    transaction: Option<GqlTransaction>,
}

#[derive(Debug, Deserialize)]
struct GqlAddress {
    address: String,
}

#[derive(Debug, Deserialize)]
struct GqlMoveValue {
    json: Option<Value>,
    #[serde(rename = "type")]
    type_: Option<GqlMoveType>,
}

#[derive(Debug, Deserialize)]
struct GqlMoveType {
    repr: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GqlMoveModule {
    package: Option<GqlMovePackage>,
    name: String,
}

#[derive(Debug, Deserialize)]
struct GqlMovePackage {
    address: String,
}

#[derive(Debug, Deserialize)]
struct GqlTransaction {
    digest: String,
    effects: Option<GqlEffects>,
}

#[derive(Debug, Deserialize)]
struct GqlEffects {
    checkpoint: Option<GqlCheckpoint>,
}

#[derive(Debug, Deserialize)]
struct GqlCheckpoint {
    #[serde(rename = "sequenceNumber")]
    sequence_number: u64,
}

// ── Client ───────────────────────────────────────────────────────────────────

pub struct GraphqlEventClient {
    http: reqwest::Client,
    url: String,
}

impl GraphqlEventClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            url: url.into(),
        }
    }

    /// Execute a GraphQL events query with the given filter variables.
    async fn fetch_events(
        &self,
        filter: Value,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let gql_cursor = extract_gql_cursor(cursor);

        let body = serde_json::json!({
            "query": EVENTS_QUERY,
            "variables": {
                "filter": filter,
                "cursor": gql_cursor,
                "limit": limit,
            }
        });

        let resp: GqlResponse = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .context("GraphQL HTTP request failed")?
            .json()
            .await
            .context("GraphQL response JSON decode failed")?;

        if let Some(errors) = &resp.errors {
            let msgs: Vec<&str> = errors.iter().map(|e| e.message.as_str()).collect();
            anyhow::bail!("Sui GraphQL error: {}", msgs.join("; "));
        }

        let connection = resp
            .data
            .and_then(|d| d.events)
            .context("missing 'events' in GraphQL response")?;

        let data: Vec<SuiEvent> = connection
            .nodes
            .into_iter()
            .filter_map(map_gql_event)
            .collect();

        let next_cursor = connection.page_info.end_cursor.map(|c| EventId {
            tx_digest: c,
            event_seq: GQL_CURSOR_SENTINEL.to_owned(),
        });

        Ok(EventPage {
            data,
            next_cursor,
            has_next_page: connection.page_info.has_next_page,
        })
    }
}

impl SuiEventSource for GraphqlEventClient {
    async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        // GraphQL module filter format: "pkg::mod"
        let module_str = format!("{package_id}::{module}");
        let filter = serde_json::json!({ "module": module_str });
        self.fetch_events(filter, cursor, limit).await
    }

    async fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let filter = serde_json::json!({ "type": event_type });
        self.fetch_events(filter, cursor, limit).await
    }
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/// Extract the GraphQL opaque cursor string from an EventId, if it was
/// produced by this client (sentinel check). Returns None for JSON-RPC
/// cursors, which causes the query to start from the beginning.
fn extract_gql_cursor(cursor: Option<&EventId>) -> Option<&str> {
    cursor
        .filter(|c| c.event_seq == GQL_CURSOR_SENTINEL)
        .map(|c| c.tx_digest.as_str())
}

/// Map a single GraphQL event node into the existing SuiEvent model.
fn map_gql_event(node: GqlEventNode) -> Option<SuiEvent> {
    let tx = node.transaction.as_ref()?;
    let contents = node.contents.as_ref()?;

    let package_id = node
        .transaction_module
        .as_ref()
        .and_then(|m| m.package.as_ref())
        .map(|p| p.address.clone())
        .unwrap_or_default();

    let transaction_module = node
        .transaction_module
        .as_ref()
        .map(|m| m.name.clone())
        .unwrap_or_default();

    let type_ = contents
        .type_
        .as_ref()
        .and_then(|t| t.repr.clone())
        .unwrap_or_default();

    let checkpoint = tx
        .effects
        .as_ref()
        .and_then(|e| e.checkpoint.as_ref())
        .map(|c| c.sequence_number.to_string());

    let timestamp_ms = node.timestamp.as_deref().and_then(iso_to_epoch_ms);

    Some(SuiEvent {
        id: EventId {
            tx_digest: tx.digest.clone(),
            event_seq: node.sequence_number.to_string(),
        },
        package_id,
        transaction_module,
        sender: node.sender.map(|s| s.address),
        type_,
        parsed_json: contents.json.clone().unwrap_or(Value::Null),
        timestamp_ms,
        checkpoint,
    })
}

/// Convert an ISO 8601 timestamp to epoch milliseconds string.
/// Returns None on parse failure (matches JSON-RPC's Optional timestamp).
pub fn iso_to_epoch_ms(iso: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.timestamp_millis().to_string())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_node() -> GqlEventNode {
        GqlEventNode {
            sequence_number: 2,
            timestamp: Some("2026-05-07T00:44:30.989Z".to_owned()),
            sender: Some(GqlAddress { address: "0xabcd".to_owned() }),
            contents: Some(GqlMoveValue {
                json: Some(json!({"gate_id": "0x1234", "score": "750"})),
                type_: Some(GqlMoveType {
                    repr: Some("0xpkg::reputation_gate::PassageGranted".to_owned()),
                }),
            }),
            transaction_module: Some(GqlMoveModule {
                package: Some(GqlMovePackage { address: "0xpkg".to_owned() }),
                name: "reputation_gate".to_owned(),
            }),
            transaction: Some(GqlTransaction {
                digest: "ABC123digest".to_owned(),
                effects: Some(GqlEffects {
                    checkpoint: Some(GqlCheckpoint { sequence_number: 334098227 }),
                }),
            }),
        }
    }

    #[test]
    fn maps_all_sui_event_fields() {
        let ev = map_gql_event(sample_node()).expect("should map");
        assert_eq!(ev.id.tx_digest, "ABC123digest");
        assert_eq!(ev.id.event_seq, "2");
        assert_eq!(ev.package_id, "0xpkg");
        assert_eq!(ev.transaction_module, "reputation_gate");
        assert_eq!(ev.sender.as_deref(), Some("0xabcd"));
        assert_eq!(ev.type_, "0xpkg::reputation_gate::PassageGranted");
        assert_eq!(ev.parsed_json["gate_id"], "0x1234");
        assert_eq!(ev.parsed_json["score"], "750");
        assert_eq!(ev.checkpoint.as_deref(), Some("334098227"));
        assert_eq!(ev.timestamp_ms, Some("1778114670989".to_owned()));
    }

    #[test]
    fn iso_timestamp_conversion() {
        assert_eq!(iso_to_epoch_ms("2026-05-07T00:44:30.989Z"), Some("1778114670989".to_owned()));
        assert_eq!(iso_to_epoch_ms("not-a-date"), None);
        assert_eq!(iso_to_epoch_ms(""), None);
    }

    #[test]
    fn none_when_transaction_or_contents_missing() {
        let mut n = sample_node();
        n.transaction = None;
        assert!(map_gql_event(n).is_none());

        let mut n = sample_node();
        n.contents = None;
        assert!(map_gql_event(n).is_none());
    }

    #[test]
    fn checkpoint_none_when_effects_missing() {
        let mut n = sample_node();
        n.transaction.as_mut().unwrap().effects = None;
        assert_eq!(map_gql_event(n).unwrap().checkpoint, None);
    }

    #[test]
    fn gql_cursor_extraction() {
        let gql = EventId { tx_digest: "opaque".to_owned(), event_seq: "gql".to_owned() };
        assert_eq!(extract_gql_cursor(Some(&gql)), Some("opaque"));

        let rpc = EventId { tx_digest: "digest".to_owned(), event_seq: "3".to_owned() };
        assert_eq!(extract_gql_cursor(Some(&rpc)), None);

        assert_eq!(extract_gql_cursor(None), None);
    }
}
