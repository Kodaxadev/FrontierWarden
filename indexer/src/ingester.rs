use anyhow::Result;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

use crate::{
    config::{Config, EveConfig},
    db, processor,
    processor::ProjectionConfig,
    rpc::{EventId, RpcClient},
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
pub async fn run(cfg: Config, pool: PgPool) -> Result<()> {
    let rpc = RpcClient::new(&cfg.network.rpc_url);
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

#[cfg(test)]
mod tests {
    use super::{cursor_key, TRACKED_MODULES};

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
}
