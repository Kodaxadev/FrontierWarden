use anyhow::Result;

use crate::rpc::{EventId, EventPage, RpcClient};

// Adapter boundary: all Sui event fetching goes through this trait.
// GraphQL cutover point — GraphQLEventClient implements this trait.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md, Phase 3.
pub trait SuiEventSource: Send + Sync {
    fn query_events(
        &self,
        package_id: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> impl std::future::Future<Output = Result<EventPage>> + Send;

    fn query_events_by_type(
        &self,
        event_type: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> impl std::future::Future<Output = Result<EventPage>> + Send;
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
