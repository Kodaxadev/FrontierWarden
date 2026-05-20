use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

use crate::event_source::SuiEventSource;
use crate::rpc::{EventId, EventPage, SuiEvent};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

const EVENTS_QUERY: &str = "\
query EventsPage($filter:EventFilter,$cursor:String,$limit:Int){\
events(filter:$filter,after:$cursor,first:$limit){\
nodes{sendingModule{package{address}name}type{repr}sender{address}\
json timestamp checkpoint{sequenceNumber}transactionBlock{digest}}\
pageInfo{hasNextPage endCursor}}}";

pub struct GraphQLEventClient {
    client: reqwest::Client,
    url: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlResponse {
    data: Option<GqlData>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
struct GqlData {
    events: GqlEventsConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlEventsConnection {
    nodes: Vec<GqlEventNode>,
    page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GqlPageInfo {
    has_next_page: bool,
    #[allow(dead_code)] // Deserialized but cursor tracking uses EventId
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlEventNode {
    pub sending_module: Option<GqlModule>,
    #[serde(rename = "type")]
    pub type_: Option<GqlTypeRepr>,
    pub sender: Option<GqlAddress>,
    pub json: Option<Value>,
    pub timestamp: Option<String>,
    pub checkpoint: Option<GqlCheckpoint>,
    pub transaction_block: Option<GqlTransactionBlock>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlModule {
    pub package: Option<GqlAddress>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTypeRepr {
    pub repr: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlAddress {
    pub address: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlCheckpoint {
    pub sequence_number: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlTransactionBlock {
    pub digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GqlError {
    message: String,
}

impl GraphQLEventClient {
    pub fn new(url: impl Into<String>) -> Result<Self> {
        let url = url.into();
        validate_graphql_url(&url)?;
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { client, url })
    }

    async fn fetch_events(
        &self,
        filter: Value,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let gql_cursor = self.resolve_cursor(cursor, &filter).await?;

        let body = json!({
            "query": EVENTS_QUERY,
            "variables": {
                "filter": filter,
                "cursor": gql_cursor,
                "limit": limit,
            }
        });

        let resp: GqlResponse = self
            .client
            .post(&self.url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .context("GraphQL HTTP request failed")?
            .json()
            .await
            .context("GraphQL response JSON decode failed")?;

        if let Some(errors) = &resp.errors {
            if !errors.is_empty() {
                let msgs: Vec<&str> = errors.iter().map(|e| e.message.as_str()).collect();
                anyhow::bail!("Sui GraphQL errors: {}", msgs.join("; "));
            }
        }

        let data = resp.data.context("missing 'data' in GraphQL response")?;
        let connection = data.events;

        let events: Vec<SuiEvent> = connection
            .nodes
            .into_iter()
            .filter_map(|node| normalize_event(node).ok())
            .collect();

        let next_cursor = if connection.page_info.has_next_page {
            events.last().map(|ev| ev.id.clone())
        } else {
            None
        };

        Ok(EventPage {
            data: events,
            next_cursor,
            has_next_page: connection.page_info.has_next_page,
        })
    }

    /// Translate an EventId cursor to a GraphQL opaque cursor.
    ///
    /// On first call (cursor=None), returns None (start from beginning).
    /// Full cursor translation (EventId -> GraphQL opaque cursor) is
    /// deferred to the switchover phase. Shadow mode compares page
    /// contents starting from cursor=None on both sides.
    async fn resolve_cursor(
        &self,
        cursor: Option<&EventId>,
        _filter: &Value,
    ) -> Result<Option<String>> {
        let _cursor = match cursor {
            Some(c) => c,
            None => return Ok(None),
        };
        Ok(None)
    }
}

pub(crate) fn normalize_event(node: GqlEventNode) -> Result<SuiEvent> {
    let tx_digest = node
        .transaction_block
        .as_ref()
        .and_then(|tb| tb.digest.as_ref())
        .context("event missing transactionBlock.digest")?
        .clone();

    let module_name = node
        .sending_module
        .as_ref()
        .and_then(|m| m.name.as_ref())
        .context("event missing sendingModule.name")?
        .clone();

    let package_id = node
        .sending_module
        .as_ref()
        .and_then(|m| m.package.as_ref())
        .and_then(|p| p.address.as_ref())
        .context("event missing sendingModule.package.address")?
        .clone();

    let type_ = node
        .type_
        .as_ref()
        .and_then(|t| t.repr.as_ref())
        .context("event missing type.repr")?
        .clone();

    let sender = node.sender.as_ref().and_then(|s| s.address.clone());

    let checkpoint = node
        .checkpoint
        .as_ref()
        .and_then(|c| c.sequence_number)
        .map(|n| n.to_string());

    let parsed_json = node.json.unwrap_or(Value::Null);

    let timestamp_ms = node.timestamp.as_ref().and_then(|ts| {
        chrono::DateTime::parse_from_rfc3339(ts)
            .ok()
            .map(|dt| dt.timestamp_millis().to_string())
    });

    Ok(SuiEvent {
        id: EventId {
            tx_digest,
            event_seq: "0".to_string(),
        },
        package_id,
        transaction_module: module_name,
        sender,
        type_,
        parsed_json,
        timestamp_ms,
        checkpoint,
    })
}

impl SuiEventSource for GraphQLEventClient {
    async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let filter = json!({
            "emittingModule": format!("{}::{}", package_id, module)
        });
        self.fetch_events(filter, cursor, limit).await
    }

    async fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let filter = json!({ "eventType": event_type });
        self.fetch_events(filter, cursor, limit).await
    }
}

fn validate_graphql_url(url: &str) -> Result<()> {
    let is_https = url.starts_with("https://");
    let is_local = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
    anyhow::ensure!(
        is_https || is_local,
        "GraphQL URL must use https:// (rejecting: {url})"
    );
    Ok(())
}

#[cfg(test)]
mod tests;
