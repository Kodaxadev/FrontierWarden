use anyhow::{Context, Result};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::path::Path;

use crate::config::DatabaseConfig;

pub async fn create_pool(cfg: &DatabaseConfig) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .connect(&cfg.url)
        .await?;
    init_indexer_state(&pool).await?;
    run_migrations(&pool).await?;
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

/// Runs all migration SQL files from the migrations/ directory in order.
/// Each file is split by semicolons and executed as individual statements.
async fn run_migrations(pool: &PgPool) -> Result<()> {
    let migrations_dir = Path::new("migrations");
    if !migrations_dir.exists() {
        tracing::warn!(
            path = ?migrations_dir,
            "migrations directory not found; skipping auto-migrations"
        );
        return Ok(());
    }

    let mut entries: Vec<_> = std::fs::read_dir(migrations_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext == "sql")
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    if entries.is_empty() {
        tracing::info!("no migration files found; skipping auto-migrations");
        return Ok(());
    }

    for entry in &entries {
        let path = entry.path();
        let filename = entry.file_name();
        let filename_str = filename.to_string_lossy();
        let sql = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read migration {}", filename_str))?;

        let statements: Vec<&str> = sql
            .split(';')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        for (i, stmt) in statements.iter().enumerate() {
            let preview: String = stmt.chars().take(60).collect();
            tracing::debug!(
                migration = %filename_str,
                statement = i + 1,
                "Executing: {}...",
                preview
            );
            sqlx::query(stmt).execute(pool).await.with_context(|| {
                format!(
                    "failed to execute statement {} in {}",
                    i + 1,
                    filename_str
                )
            })?;
        }

        tracing::info!(migration = %filename_str, "Migration applied");
    }

    Ok(())
}

pub async fn load_cursor(pool: &PgPool, key: &str) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM indexer_state WHERE key = $1")
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
