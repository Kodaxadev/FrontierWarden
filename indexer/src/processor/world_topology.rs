use anyhow::Result;
use sqlx::PgPool;

use crate::{
    rpc::{event_name, SuiEvent},
    world_topology::{mark_gate_unlinked, upsert_gate_link},
    world_topology_parser::{parse_gate_linked_event, parse_gate_unlinked_event},
};

/// Dispatch a `gate` module event to the topology processor.
///
/// Handles `GateLinkedEvent` and `GateUnlinkedEvent` only. Returns `Ok(false)`
/// for all other event names so the caller can try the next handler.
pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<bool> {
    let checkpoint: i64 = ev
        .checkpoint
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    match event_name(&ev.type_) {
        "GateLinkedEvent" => {
            let row =
                parse_gate_linked_event(&ev.parsed_json, checkpoint, Some(&ev.id.tx_digest))?;
            upsert_gate_link(pool, &row).await?;
            Ok(true)
        }
        "GateUnlinkedEvent" => {
            let row = parse_gate_unlinked_event(&ev.parsed_json, checkpoint)?;
            mark_gate_unlinked(pool, &row).await?;
            Ok(true)
        }
        _ => Ok(false),
    }
}
