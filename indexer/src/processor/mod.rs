pub mod attestation;
pub mod fraud_challenge;
pub mod lending;
pub mod oracle_registry;
pub mod profile;
pub mod raw;
pub mod reputation_gate;
pub mod schema_registry;
pub mod singleton;
pub mod system_sdk;
pub mod vouch;

use sqlx::PgPool;

use crate::rpc::{event_name, SuiEvent};
use crate::world_gate_extensions;

#[derive(Debug, Clone, Default)]
pub struct ProjectionConfig {
    pub fw_gate_extension_typename: String,
}

/// Dispatch a single event: write to raw_events first, then route to the
/// module-specific projection handler.
///
/// Projection errors are logged and swallowed. raw_events stays the replay log,
/// while duplicate raw events still replay projections so fixed handlers can
/// repair previously failed projection writes.
pub async fn process(pool: &PgPool, ev: &SuiEvent, cfg: &ProjectionConfig) {
    match raw::insert(pool, ev).await {
        Ok(true) => {}
        Ok(false) => {
            tracing::debug!(
                tx = %ev.id.tx_digest,
                seq = %ev.id.event_seq,
                "raw event already indexed; replaying projection",
            );
        }
        Err(e) => {
            tracing::error!(
                tx = %ev.id.tx_digest,
                seq = %ev.id.event_seq,
                "raw_events insert failed; skipping projection: {e:#}",
            );
            return;
        }
    }

    let module = ev.transaction_module.as_str();
    let result = match module {
        "schema_registry" => schema_registry::handle(pool, ev).await,
        "profile" => profile::handle(pool, ev).await,
        "attestation" => attestation::handle(pool, ev).await,
        "oracle_registry" => oracle_registry::handle(pool, ev).await,
        "vouch" => vouch::handle(pool, ev).await,
        "lending" => lending::handle(pool, ev).await,
        "fraud_challenge" => fraud_challenge::handle(pool, ev).await,
        "reputation_gate" => reputation_gate::handle(pool, ev).await,
        "system_sdk" => system_sdk::handle(pool, ev).await,
        "singleton" => singleton::handle(pool, ev).await,
        "gate" => world_gate_extensions::handle(pool, ev, &cfg.fw_gate_extension_typename).await,
        other => {
            tracing::debug!(module = other, "no projection handler for module");
            Ok(())
        }
    };

    if let Err(e) = result {
        tracing::error!(
            module,
            event = event_name(&ev.type_),
            tx = %ev.id.tx_digest,
            "projection handler failed: {e:#}",
        );
    }
}
