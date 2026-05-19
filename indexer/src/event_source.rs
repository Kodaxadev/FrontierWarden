use anyhow::Result;

use crate::rpc::{EventId, EventPage, RpcClient};

// Adapter boundary: all Sui event fetching goes through this trait.
// Two implementations:
//   - RpcClient (rpc.rs)                — JSON-RPC suix_queryEvents (default)
//   - GraphqlEventClient (graphql_event_client.rs) — Sui GraphQL events query
// Selected at startup via [network] event_source_mode in config.toml.
// See Documents/INDEXER_EVENT_GRAPHQL_SPIKE.md for migration plan.
pub trait SuiEventSource: Send + Sync {
    async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage>;

    async fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage>;
}

impl SuiEventSource for RpcClient {
    async fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        RpcClient::query_events(self, package_id, module, cursor, limit).await
    }

    async fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        RpcClient::query_events_by_type(self, event_type, cursor, limit).await
    }
}
