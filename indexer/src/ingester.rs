use anyhow::Result;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

use crate::{
    config::Config,
    db, processor,
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

    // Load saved cursors for each module.
    let mut cursors: Vec<(&str, Option<EventId>)> = Vec::with_capacity(TRACKED_MODULES.len());
    for &module in TRACKED_MODULES {
        let cursor = restore_cursor(&pool, module).await;
        cursors.push((module, cursor));
    }

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
                processor::process(&pool, ev).await;
            }

            if count > 0 {
                info!(module, count, "pipeline:ingest");
            }
            if count > 0 || page.has_next_page {
                any_new = true;
            }

            if let Some(next) = page.next_cursor {
                persist_cursor(&pool, module, &next).await;
                *cursor = Some(next);
            }
        }

        if !any_new {
            sleep(Duration::from_millis(cfg.indexer.poll_interval_ms)).await;
        }
    }
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

fn cursor_key(module: &str) -> String {
    format!("cursor:{module}")
}

async fn restore_cursor(pool: &PgPool, module: &str) -> Option<EventId> {
    let key = cursor_key(module);
    let json = db::load_cursor(pool, &key).await.ok()??;
    match serde_json::from_str::<EventId>(&json) {
        Ok(c) => {
            info!(module, tx = %c.tx_digest, seq = %c.event_seq, "restored cursor");
            Some(c)
        }
        Err(e) => {
            warn!(module, "cursor JSON invalid, starting from genesis: {e}");
            None
        }
    }
}

async fn persist_cursor(pool: &PgPool, module: &str, cursor: &EventId) {
    let key = cursor_key(module);
    match serde_json::to_string(cursor) {
        Ok(json) => {
            if let Err(e) = db::save_cursor(pool, &key, &json).await {
                warn!(module, "cursor persist failed: {e:#}");
            }
        }
        Err(e) => warn!(module, "cursor serialize failed: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::TRACKED_MODULES;

    #[test]
    fn tracks_operational_protocol_modules() {
        assert!(TRACKED_MODULES.contains(&"fraud_challenge"));
        assert!(TRACKED_MODULES.contains(&"reputation_gate"));
    }
}
