use sqlx::PgPool;
use tracing::{info, warn};

use crate::{config::EveConfig, db, rpc::EventId};

use super::{
    WORLD_GATE_EXTENSION_EVENTS, WORLD_GATE_JUMP_EVENTS, WORLD_GATE_TOPOLOGY_EVENTS,
};

pub(super) struct WorldEventCursor {
    pub(super) event_type: String,
    pub(super) cursor_key: String,
    pub(super) cursor: Option<EventId>,
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

pub(super) fn cursor_key(package_id: &str, module: &str) -> String {
    format!("cursor:{package_id}:{module}")
}

pub(super) async fn restore_cursor(
    pool: &PgPool,
    package_id: &str,
    module: &str,
) -> Option<EventId> {
    let key = cursor_key(package_id, module);
    restore_cursor_key(pool, module, &key).await
}

pub(super) async fn restore_cursor_key(
    pool: &PgPool,
    label: &str,
    key: &str,
) -> Option<EventId> {
    let json = db::load_cursor(pool, key).await.ok()??;
    match serde_json::from_str::<EventId>(&json) {
        Ok(c) => {
            info!(cursor = label, tx = %c.tx_digest, seq = %c.event_seq, "restored cursor");
            Some(c)
        }
        Err(e) => {
            warn!(
                cursor = label,
                "cursor JSON invalid, starting from genesis: {e}"
            );
            None
        }
    }
}

pub(super) async fn persist_cursor(
    pool: &PgPool,
    package_id: &str,
    module: &str,
    cursor: &EventId,
) {
    let key = cursor_key(package_id, module);
    persist_cursor_key(pool, &key, cursor).await
}

pub(super) async fn persist_cursor_key(pool: &PgPool, key: &str, cursor: &EventId) {
    match serde_json::to_string(cursor) {
        Ok(json) => {
            if let Err(e) = db::save_cursor(pool, key, &json).await {
                warn!(cursor = key, "cursor persist failed: {e:#}");
            }
        }
        Err(e) => warn!(cursor = key, "cursor serialize failed: {e}"),
    }
}

pub(super) async fn restore_world_gate_extension_cursors(
    pool: &PgPool,
    eve: Option<&EveConfig>,
) -> Vec<WorldEventCursor> {
    let Some(eve) = eve.filter(|cfg| cfg.enabled && !cfg.world_pkg_original_id.is_empty()) else {
        return Vec::new();
    };

    let mut cursors = Vec::with_capacity(WORLD_GATE_EXTENSION_EVENTS.len());
    for event in WORLD_GATE_EXTENSION_EVENTS {
        let event_type = format!("{}::gate::{event}", eve.world_pkg_original_id);
        let cursor_key = format!("cursor:world:{event_type}");
        let cursor = restore_cursor_key(pool, &event_type, &cursor_key).await;
        cursors.push(WorldEventCursor {
            event_type,
            cursor_key,
            cursor,
        });
    }
    cursors
}

/// Build cursors for `JumpEvent` using the world package `original-id` as the
/// type-origin prefix (upgrade-safe). Separate from topology cursors so jump
/// and topology indexing progress independently.
pub(super) async fn restore_world_gate_jump_cursors(
    pool: &PgPool,
    eve: Option<&EveConfig>,
) -> Vec<WorldEventCursor> {
    let Some(eve) = eve.filter(|cfg| cfg.enabled && !cfg.world_pkg_original_id.is_empty()) else {
        return Vec::new();
    };

    let mut cursors = Vec::with_capacity(WORLD_GATE_JUMP_EVENTS.len());
    for event in WORLD_GATE_JUMP_EVENTS {
        let event_type = format!("{}::gate::{event}", eve.world_pkg_original_id);
        let cursor_key = format!("cursor:world:{event_type}");
        let cursor = restore_cursor_key(pool, &event_type, &cursor_key).await;
        cursors.push(WorldEventCursor {
            event_type,
            cursor_key,
            cursor,
        });
    }
    cursors
}

/// Build cursors for `GateLinkedEvent` and `GateUnlinkedEvent` using the world
/// package `original-id` as the type-origin prefix (upgrade-safe).
pub(super) async fn restore_world_gate_topology_cursors(
    pool: &PgPool,
    eve: Option<&EveConfig>,
) -> Vec<WorldEventCursor> {
    let Some(eve) = eve.filter(|cfg| cfg.enabled && !cfg.world_pkg_original_id.is_empty()) else {
        return Vec::new();
    };

    let mut cursors = Vec::with_capacity(WORLD_GATE_TOPOLOGY_EVENTS.len());
    for event in WORLD_GATE_TOPOLOGY_EVENTS {
        let event_type = format!("{}::gate::{event}", eve.world_pkg_original_id);
        let cursor_key = format!("cursor:world:{event_type}");
        let cursor = restore_cursor_key(pool, &event_type, &cursor_key).await;
        cursors.push(WorldEventCursor {
            event_type,
            cursor_key,
            cursor,
        });
    }
    cursors
}
