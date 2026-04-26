pub mod attestation;
pub mod lending;
pub mod oracle_registry;
pub mod profile;
pub mod raw;
pub mod schema_registry;
pub mod singleton;
pub mod system_sdk;
pub mod vouch;

use sqlx::PgPool;

use crate::rpc::{SuiEvent, event_name};

/// Dispatch a single event: write to raw_events first, then route to the
/// module-specific projection handler.
///
/// Projection errors are logged and swallowed — raw_events is always written
/// first, so any failed projection can be replayed by re-processing that event.
pub async fn process(pool: &PgPool, ev: &SuiEvent) {
    if let Err(e) = raw::insert(pool, ev).await {
        tracing::error!(
            tx  = %ev.id.tx_digest,
            seq = %ev.id.event_seq,
            "raw_events insert failed — skipping projection: {e:#}",
        );
        return;
    }

    let module = ev.transaction_module.as_str();
    let result = match module {
        "schema_registry" => schema_registry::handle(pool, ev).await,
        "profile"         => profile::handle(pool, ev).await,
        "attestation"     => attestation::handle(pool, ev).await,
        "oracle_registry" => oracle_registry::handle(pool, ev).await,
        "vouch"           => vouch::handle(pool, ev).await,
        "lending"         => lending::handle(pool, ev).await,
        "system_sdk"      => system_sdk::handle(pool, ev).await,
        "singleton"       => singleton::handle(pool, ev).await,
        other => {
            tracing::debug!(module = other, "no projection handler for module");
            Ok(())
        }
    };

    if let Err(e) = result {
        tracing::error!(
            module,
            event = event_name(&ev.type_),
            tx    = %ev.id.tx_digest,
            "projection handler failed: {e:#}",
        );
    }
}
