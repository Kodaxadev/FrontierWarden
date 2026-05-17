// Kill mail poller — ingests native EVE Frontier kill data from the alpha-strike
// community API (https://api.alpha-strike.space/incident).
//
// Disabled by default. Enable via [kill_mails] enabled = true in config.toml.
// The poller is additive and idempotent: ON CONFLICT (source_id, environment) DO NOTHING.

use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;
use tokio::time::sleep;

use crate::config::KillMailsConfig;

const CURSOR_KEY_PREFIX: &str = "cursor:kill_mails";

/// Raw response row from the alpha-strike /incident endpoint.
#[derive(Debug, Deserialize)]
struct IncidentRow {
    id: i64,
    victim_name: Option<String>,
    victim_address: Option<String>,
    victim_tribe_name: Option<String>,
    killer_name: Option<String>,
    killer_address: Option<String>,
    killer_tribe_name: Option<String>,
    solar_system_id: Option<i64>,
    solar_system_name: Option<String>,
    loss_type: Option<String>,
    time_stamp: Option<i64>,
}

pub async fn run(cfg: KillMailsConfig, pool: PgPool) -> Result<()> {
    if !cfg.enabled {
        tracing::info!("kill mail poller disabled (kill_mails.enabled = false)");
        return Ok(());
    }

    let http = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("FrontierWarden-indexer/1.0")
        .build()?;

    let cursor_key = format!("{CURSOR_KEY_PREFIX}:{}", cfg.environment);
    let mut cursor = load_cursor(&pool, &cursor_key).await;
    let poll_interval = Duration::from_millis(cfg.poll_interval_ms);

    tracing::info!(
        environment = cfg.environment,
        source_url = cfg.source_url,
        cursor,
        "kill mail poller starting"
    );

    loop {
        match poll_once(&http, &cfg, &pool, cursor, &cursor_key).await {
            Ok(new_rows) => {
                if new_rows > 0 {
                    cursor = load_cursor(&pool, &cursor_key).await;
                    tracing::info!(new_rows, cursor, "kill mails ingested");
                    // Immediately loop if we may have more (full page)
                    if new_rows as u64 >= cfg.page_size {
                        continue;
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "kill mail poll failed — will retry");
            }
        }
        sleep(poll_interval).await;
    }
}

async fn poll_once(
    http: &Client,
    cfg: &KillMailsConfig,
    pool: &PgPool,
    cursor: i64,
    cursor_key: &str,
) -> Result<usize> {
    let rows = fetch_page(http, &cfg.source_url, cfg.page_size, 0).await?;

    // Filter to only rows newer than our cursor
    let mut new_rows: Vec<IncidentRow> = rows.into_iter().filter(|r| r.id > cursor).collect();
    if new_rows.is_empty() {
        return Ok(0);
    }

    // Insert oldest-first so the cursor always points to the highest confirmed id
    new_rows.sort_by_key(|r| r.id);

    let mut inserted = 0usize;
    for row in &new_rows {
        let kill_time = row
            .time_stamp
            .map(|ts| chrono::DateTime::from_timestamp(ts, 0))
            .flatten()
            .map(|dt| dt.with_timezone(&chrono::Utc));

        let raw_json = serde_json::to_value(serde_json::json!({
            "id": row.id,
            "victim_name": row.victim_name,
            "victim_address": row.victim_address,
            "victim_tribe_name": row.victim_tribe_name,
            "killer_name": row.killer_name,
            "killer_address": row.killer_address,
            "killer_tribe_name": row.killer_tribe_name,
            "solar_system_id": row.solar_system_id,
            "solar_system_name": row.solar_system_name,
            "loss_type": row.loss_type,
            "time_stamp": row.time_stamp,
        }))?;

        let result = sqlx::query(
            "INSERT INTO world_kill_mails
                 (source_id, environment, victim_name, victim_address, victim_tribe,
                  killer_name, killer_address, killer_tribe,
                  solar_system_id, solar_system_name, loss_type, kill_time, raw_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (source_id, environment) DO NOTHING",
        )
        .bind(row.id)
        .bind(&cfg.environment)
        .bind(&row.victim_name)
        .bind(&row.victim_address)
        .bind(&row.victim_tribe_name)
        .bind(&row.killer_name)
        .bind(&row.killer_address)
        .bind(&row.killer_tribe_name)
        .bind(row.solar_system_id)
        .bind(&row.solar_system_name)
        .bind(&row.loss_type)
        .bind(kill_time)
        .bind(&raw_json)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            inserted += 1;
        }
    }

    // Save cursor = highest source_id successfully processed
    if let Some(max_id) = new_rows.last().map(|r| r.id) {
        save_cursor(pool, cursor_key, max_id).await?;
    }

    Ok(inserted)
}

async fn fetch_page(http: &Client, url: &str, limit: u64, offset: u64) -> Result<Vec<IncidentRow>> {
    let resp = http
        .get(url)
        .query(&[("limit", limit), ("offset", offset)])
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        // alpha-strike returns {"error":"Bad Request! No incident records found"} at end of pages
        if body.contains("No incident records found") {
            return Ok(vec![]);
        }
        anyhow::bail!("kill mail source returned {status}: {body}");
    }

    let rows: Vec<IncidentRow> = resp.json().await?;
    Ok(rows)
}

async fn load_cursor(pool: &PgPool, key: &str) -> i64 {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM indexer_state WHERE key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .and_then(|s| s.parse().ok())
    .unwrap_or(0)
}

async fn save_cursor(pool: &PgPool, key: &str, value: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO indexer_state (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(key)
    .bind(value.to_string())
    .execute(pool)
    .await?;
    Ok(())
}

/// Backfill historical kill mails from the beginning (source_id = 0).
/// Runs once at startup if cursor is 0 and pages through the full corpus.
/// Called from main before spawning the incremental poller loop.
pub async fn backfill_if_needed(cfg: &KillMailsConfig, pool: &PgPool) -> Result<()> {
    if !cfg.enabled {
        return Ok(());
    }

    let cursor_key = format!("{CURSOR_KEY_PREFIX}:{}", cfg.environment);
    let cursor = load_cursor(pool, &cursor_key).await;
    if cursor > 0 {
        tracing::info!(cursor, "kill mail backfill skipped — cursor already set");
        return Ok(());
    }

    let http = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("FrontierWarden-indexer/1.0")
        .build()?;

    tracing::info!("kill mail backfill starting (cursor=0, ingesting full history)");

    let mut offset: u64 = 0;
    let mut total = 0usize;
    loop {
        let rows = fetch_page(&http, &cfg.source_url, cfg.page_size, offset).await?;
        if rows.is_empty() {
            break;
        }
        let page_len = rows.len();

        for row in &rows {
            let kill_time = row
                .time_stamp
                .map(|ts| chrono::DateTime::from_timestamp(ts, 0))
                .flatten()
                .map(|dt| dt.with_timezone(&chrono::Utc));

            let raw_json = serde_json::to_value(serde_json::json!({
                "id": row.id,
                "victim_name": row.victim_name,
                "victim_address": row.victim_address,
                "victim_tribe_name": row.victim_tribe_name,
                "killer_name": row.killer_name,
                "killer_address": row.killer_address,
                "killer_tribe_name": row.killer_tribe_name,
                "solar_system_id": row.solar_system_id,
                "solar_system_name": row.solar_system_name,
                "loss_type": row.loss_type,
                "time_stamp": row.time_stamp,
            }))?;

            sqlx::query(
                "INSERT INTO world_kill_mails
                     (source_id, environment, victim_name, victim_address, victim_tribe,
                      killer_name, killer_address, killer_tribe,
                      solar_system_id, solar_system_name, loss_type, kill_time, raw_json)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                 ON CONFLICT (source_id, environment) DO NOTHING",
            )
            .bind(row.id)
            .bind(&cfg.environment)
            .bind(&row.victim_name)
            .bind(&row.victim_address)
            .bind(&row.victim_tribe_name)
            .bind(&row.killer_name)
            .bind(&row.killer_address)
            .bind(&row.killer_tribe_name)
            .bind(row.solar_system_id)
            .bind(&row.solar_system_name)
            .bind(&row.loss_type)
            .bind(kill_time)
            .bind(&raw_json)
            .execute(pool)
            .await?;
        }

        // Track highest source_id seen (rows arrive newest-first; last row is oldest)
        // We track per-page max to protect against source ordering changes
        if let Some(max_id) = rows.iter().map(|r| r.id).max() {
            save_cursor(pool, &cursor_key, max_id).await?;
        }

        total += page_len;
        tracing::info!(total, offset, page_len, "kill mail backfill progress");

        if (page_len as u64) < cfg.page_size {
            break; // Last partial page
        }
        offset += cfg.page_size;
    }

    tracing::info!(total, "kill mail backfill complete");
    Ok(())
}
