use anyhow::Result;
use sqlx::PgPool;
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

use crate::{
    config::Config,
    db,
    processor,
    rpc::{EventId, RpcClient},
};

// system_heat is a materialized view over kill_mails; refresh it every 5 min.
// CONCURRENTLY means reads are not blocked during refresh (requires unique index
// on system_heat.system_id — added in 0002_efrep_indexes.sql).
const HEAT_REFRESH_INTERVAL: Duration = Duration::from_secs(300);

pub fn spawn_heat_refresh(pool: PgPool) {
    tokio::spawn(async move {
        loop {
            sleep(HEAT_REFRESH_INTERVAL).await;
            match sqlx::query("REFRESH MATERIALIZED VIEW CONCURRENTLY system_heat")
                .execute(&pool)
                .await
            {
                Ok(_)  => info!("system_heat refreshed"),
                Err(e) => warn!("system_heat refresh failed: {e:#}"),
            }
        }
    });
}

/// Main indexer loop. Polls `suix_queryEvents` for the deployed package,
/// dispatches each event through the processor, and persists the cursor so
/// restarts resume from where they left off.
pub async fn run(cfg: Config, pool: PgPool) -> Result<()> {
    let rpc        = RpcClient::new(&cfg.network.rpc_url);
    let package_id = cfg.package.id.clone();

    let mut cursor: Option<EventId> = restore_cursor(&pool).await;
    if cursor.is_none() {
        info!(
            deploy_checkpoint = cfg.package.start_checkpoint,
            "no saved cursor — indexing from genesis (suix_queryEvents will return all package events)"
        );
    }

    info!(package = %package_id, "indexer started");

    loop {
        let page = match rpc.query_events(&package_id, cursor.as_ref(), cfg.indexer.batch_size).await {
            Ok(p)  => p,
            Err(e) => {
                warn!("RPC query failed, backing off: {e:#}");
                sleep(Duration::from_millis(cfg.indexer.poll_interval_ms * 5)).await;
                continue;
            }
        };

        let count = page.data.len();
        for ev in &page.data {
            processor::process(&pool, ev).await;
        }

        if count > 0 {
            info!(count, "processed event batch");
        }

        // Advance cursor whether or not there are more pages — the fullnode returns
        // next_cursor even on the last page so we resume correctly after new events arrive.
        if let Some(next) = page.next_cursor {
            persist_cursor(&pool, &next).await;
            cursor = Some(next);
        }

        if !page.has_next_page {
            sleep(Duration::from_millis(cfg.indexer.poll_interval_ms)).await;
        }
    }
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

async fn restore_cursor(pool: &PgPool) -> Option<EventId> {
    let json = db::load_cursor(pool).await.ok()??;
    match serde_json::from_str::<EventId>(&json) {
        Ok(c)  => { info!(tx = %c.tx_digest, seq = %c.event_seq, "restored cursor"); Some(c) }
        Err(e) => { warn!("cursor JSON invalid, starting from genesis: {e}"); None }
    }
}

async fn persist_cursor(pool: &PgPool, cursor: &EventId) {
    match serde_json::to_string(cursor) {
        Ok(json) => {
            if let Err(e) = db::save_cursor(pool, &json).await {
                warn!("cursor persist failed: {e:#}");
            }
        }
        Err(e) => warn!("cursor serialize failed: {e}"),
    }
}
