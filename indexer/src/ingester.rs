use anyhow::Result;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

use crate::{
    config::{Config, EveConfig},
    db,
    event_source::SuiEventSource,
    processor,
    processor::ProjectionConfig,
    rpc::EventId,
};

pub const TRACKED_MODULES: &[&str] = &[
    "schema_registry",
    "profile",
    "attestation",
    "oracle_registry",
    "vouch",
    "lending",
    "fraud_challenge",
    "reputation_gate",
    "system_sdk",
    "singleton",
];

const WORLD_GATE_EXTENSION_EVENTS: &[&str] = &["ExtensionAuthorizedEvent", "ExtensionRevokedEvent"];

/// World gate topology events — link/unlink pairs from `gate.move`.
/// Tracked using the world package `original-id` (type origin), which is
/// stable across package upgrades. These are separate from the FW package
/// extension events above and must not share cursors with them.
const WORLD_GATE_TOPOLOGY_EVENTS: &[&str] = &["GateLinkedEvent", "GateUnlinkedEvent"];

/// World gate jump events — per-jump activity from `gate.move`.
/// Uses the same `original-id` prefix as topology events; tracked on a
/// separate cursor so topology and jump indexing progress independently.
/// Cold-start checkpoint: 308264360 (confirmed Stillness world-event start).
const WORLD_GATE_JUMP_EVENTS: &[&str] = &["JumpEvent"];

const HEAT_REFRESH_INTERVAL: Duration = Duration::from_secs(300);

pub fn spawn_heat_refresh(pool: PgPool) {
    tokio::spawn(async move {
        loop {
            sleep(HEAT_REFRESH_INTERVAL).await;
            match sqlx::query("REFRESH MATERIALIZED VIEW CONCURRENTLY system_heat")
                .execute(&pool)
                .await
            {
                Ok(_) => info!("system_heat refreshed"),
                Err(e) => warn!("system_heat refresh failed: {e:#}"),
            }
        }
    });
}

/// Main indexer loop. Polls each Move module separately (the devnet fullnode
/// does not support Package or Any filters), persists a cursor per module so
/// restarts resume correctly.
pub async fn run<S: SuiEventSource>(cfg: Config, pool: PgPool, rpc: S) -> Result<()> {
    let package_id = cfg.package.id.clone();
    let projection_cfg = ProjectionConfig {
        fw_gate_extension_typename: cfg
            .eve
            .as_ref()
            .map(|eve| eve.fw_gate_extension_typename.clone())
            .unwrap_or_default(),
    };

    // Load saved cursors for each module.
    let mut cursors: Vec<(&str, Option<EventId>)> = Vec::with_capacity(TRACKED_MODULES.len());
    for &module in TRACKED_MODULES {
        let cursor = restore_cursor(&pool, &package_id, module).await;
        cursors.push((module, cursor));
    }
    let mut world_cursors = restore_world_gate_extension_cursors(&pool, cfg.eve.as_ref()).await;
    let mut topology_cursors =
        restore_world_gate_topology_cursors(&pool, cfg.eve.as_ref()).await;
    let mut jump_cursors = restore_world_gate_jump_cursors(&pool, cfg.eve.as_ref()).await;

    info!(
        package = %package_id,
        deploy_checkpoint = cfg.package.start_checkpoint,
        "indexer started ({} modules)",
        TRACKED_MODULES.len()
    );

    loop {
        let mut any_new = false;

        for (module, cursor) in &mut cursors {
            let page = match rpc
                .query_events(&package_id, module, cursor.as_ref(), cfg.indexer.batch_size)
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    warn!(module, "RPC query failed, skipping: {e:#}");
                    continue;
                }
            };

            let count = page.data.len();
            for ev in &page.data {
                processor::process(&pool, ev, &projection_cfg).await;
            }

            if count > 0 {
                info!(module, count, "pipeline:ingest");
            }
            if count > 0 || page.has_next_page {
                any_new = true;
            }

            if let Some(next) = page.next_cursor {
                persist_cursor(&pool, &package_id, module, &next).await;
                *cursor = Some(next);
            }
        }

        for world in &mut world_cursors {
            let page = match rpc
                .query_events_by_type(
                    &world.event_type,
                    world.cursor.as_ref(),
                    cfg.indexer.batch_size,
                )
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    warn!(event_type = %world.event_type, "world event RPC query failed, skipping: {e:#}");
                    continue;
                }
            };

            let count = page.data.len();
            for ev in &page.data {
                processor::process(&pool, ev, &projection_cfg).await;
            }

            if count > 0 {
                info!(event_type = %world.event_type, count, "pipeline:world_gate_extension_ingest");
            }
            if count > 0 || page.has_next_page {
                any_new = true;
            }

            if let Some(next) = page.next_cursor {
                persist_cursor_key(&pool, &world.cursor_key, &next).await;
                world.cursor = Some(next);
            }
        }

        for topo in &mut topology_cursors {
            let page = match rpc
                .query_events_by_type(
                    &topo.event_type,
                    topo.cursor.as_ref(),
                    cfg.indexer.batch_size,
                )
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    warn!(event_type = %topo.event_type, "topology event RPC query failed, skipping: {e:#}");
                    continue;
                }
            };

            let count = page.data.len();
            for ev in &page.data {
                processor::process(&pool, ev, &projection_cfg).await;
            }

            if count > 0 {
                info!(event_type = %topo.event_type, count, "pipeline:world_gate_topology_ingest");
            }
            if count > 0 || page.has_next_page {
                any_new = true;
            }

            if let Some(next) = page.next_cursor {
                persist_cursor_key(&pool, &topo.cursor_key, &next).await;
                topo.cursor = Some(next);
            }
        }

        for jump in &mut jump_cursors {
            let page = match rpc
                .query_events_by_type(
                    &jump.event_type,
                    jump.cursor.as_ref(),
                    cfg.indexer.batch_size,
                )
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    warn!(event_type = %jump.event_type, "jump event RPC query failed, skipping: {e:#}");
                    continue;
                }
            };

            let count = page.data.len();
            for ev in &page.data {
                processor::process(&pool, ev, &projection_cfg).await;
            }

            if count > 0 {
                info!(event_type = %jump.event_type, count, "pipeline:world_gate_jump_ingest");
            }
            if count > 0 || page.has_next_page {
                any_new = true;
            }

            if let Some(next) = page.next_cursor {
                persist_cursor_key(&pool, &jump.cursor_key, &next).await;
                jump.cursor = Some(next);
            }
        }

        if !any_new {
            sleep(Duration::from_millis(cfg.indexer.poll_interval_ms)).await;
        }
    }
}

struct WorldEventCursor {
    event_type: String,
    cursor_key: String,
    cursor: Option<EventId>,
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

fn cursor_key(package_id: &str, module: &str) -> String {
    format!("cursor:{package_id}:{module}")
}

async fn restore_cursor(pool: &PgPool, package_id: &str, module: &str) -> Option<EventId> {
    let key = cursor_key(package_id, module);
    restore_cursor_key(pool, module, &key).await
}

async fn restore_cursor_key(pool: &PgPool, label: &str, key: &str) -> Option<EventId> {
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

async fn persist_cursor(pool: &PgPool, package_id: &str, module: &str, cursor: &EventId) {
    let key = cursor_key(package_id, module);
    persist_cursor_key(pool, &key, cursor).await
}

async fn persist_cursor_key(pool: &PgPool, key: &str, cursor: &EventId) {
    match serde_json::to_string(cursor) {
        Ok(json) => {
            if let Err(e) = db::save_cursor(pool, key, &json).await {
                warn!(cursor = key, "cursor persist failed: {e:#}");
            }
        }
        Err(e) => warn!(cursor = key, "cursor serialize failed: {e}"),
    }
}

async fn restore_world_gate_extension_cursors(
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
async fn restore_world_gate_jump_cursors(
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
async fn restore_world_gate_topology_cursors(
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

#[cfg(test)]
mod tests {
    use super::{
        cursor_key, TRACKED_MODULES, WORLD_GATE_EXTENSION_EVENTS, WORLD_GATE_JUMP_EVENTS,
        WORLD_GATE_TOPOLOGY_EVENTS,
    };

    #[test]
    fn tracks_operational_protocol_modules() {
        assert!(TRACKED_MODULES.contains(&"fraud_challenge"));
        assert!(TRACKED_MODULES.contains(&"reputation_gate"));
    }

    #[test]
    fn module_cursor_keys_are_package_scoped() {
        let old_key = cursor_key("0xold", "reputation_gate");
        let new_key = cursor_key("0xnew", "reputation_gate");

        assert_eq!(old_key, "cursor:0xold:reputation_gate");
        assert_ne!(old_key, new_key);
    }

    #[test]
    fn jump_events_list_contains_jump_event() {
        assert!(WORLD_GATE_JUMP_EVENTS.contains(&"JumpEvent"));
    }

    #[test]
    fn topology_and_jump_event_sets_are_disjoint() {
        for event in WORLD_GATE_JUMP_EVENTS {
            assert!(
                !WORLD_GATE_TOPOLOGY_EVENTS.contains(event),
                "event '{event}' must not appear in both topology and jump event lists"
            );
        }
    }

    #[test]
    fn world_event_type_never_contains_placeholder() {
        let pkg = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
        for event in WORLD_GATE_EXTENSION_EVENTS
            .iter()
            .chain(WORLD_GATE_TOPOLOGY_EVENTS)
            .chain(WORLD_GATE_JUMP_EVENTS)
        {
            let event_type = format!("{pkg}::gate::{event}");
            assert!(
                !event_type.contains("PLACEHOLDER"),
                "event type contains PLACEHOLDER: {event_type}"
            );
        }
    }

    #[test]
    fn world_event_cursor_key_exceeds_old_varchar64_limit() {
        // Demonstrates why the indexer_state.key column must be TEXT, not VARCHAR(64).
        let pkg = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
        let event_type = format!("{pkg}::gate::ExtensionAuthorizedEvent");
        let key = format!("cursor:world:{event_type}");
        assert!(
            key.len() > 64,
            "expected cursor key > 64 chars, got {} chars: {key}",
            key.len()
        );
    }
}
