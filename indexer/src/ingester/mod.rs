mod cursors;
#[cfg(test)]
mod tests;

use anyhow::Result;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

use crate::{
    config::Config,
    event_source::SuiEventSource,
    processor,
    processor::ProjectionConfig,
    rpc::EventId,
};

use cursors::{
    persist_cursor, persist_cursor_key, restore_cursor,
    restore_world_gate_extension_cursors, restore_world_gate_jump_cursors,
    restore_world_gate_topology_cursors,
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
const WORLD_GATE_TOPOLOGY_EVENTS: &[&str] = &["GateLinkedEvent", "GateUnlinkedEvent"];

/// World gate jump events — per-jump activity from `gate.move`.
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
