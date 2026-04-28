use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions};

use crate::config::DatabaseConfig;

pub async fn create_pool(cfg: &DatabaseConfig) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .connect(&cfg.url)
        .await?;
    init_indexer_state(&pool).await?;
    Ok(pool)
}

/// Creates the cursor-persistence table if it doesn't exist.
/// Intentionally separate from 0001_efrep.sql — this is internal indexer
/// bookkeeping, not protocol data.
async fn init_indexer_state(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS indexer_state (
            key        VARCHAR(64) PRIMARY KEY,
            value      TEXT        NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn load_cursor(pool: &PgPool, key: &str) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM indexer_state WHERE key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(v,)| v))
}

pub async fn save_cursor(pool: &PgPool, key: &str, cursor_json: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO indexer_state (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_at = NOW()",
    )
    .bind(key)
    .bind(cursor_json)
    .execute(pool)
    .await?;
    Ok(())
}
