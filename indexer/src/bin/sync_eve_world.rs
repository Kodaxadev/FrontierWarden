//! sync_eve_world — CLI binary to fetch paginated EVE Frontier World API data
//! and upsert raw JSON + key fields into Postgres.
//!
//! Usage:
//!   cargo run --bin sync_eve_world
//!
//! Requires:
//!   - config.toml with [eve] section
//!   - EFREP_DATABASE_URL or database.url in config.toml

use anyhow::Result;
use sqlx::PgPool;
use std::time::Instant;
use tracing::info;

use efrep_indexer::{config::Config, db, world_api::WorldApiClient};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("sync_eve_world=info")),
        )
        .init();

    let cfg = Config::load("config.toml")?;
    let pool = db::create_pool(&cfg.database).await?;

    let Some(eve_cfg) = &cfg.eve else {
        anyhow::bail!("[eve] section not found in config.toml");
    };
    if !eve_cfg.enabled {
        anyhow::bail!("EVE sync is disabled (eve.enabled = false)");
    }

    let client = WorldApiClient::new(&eve_cfg.world_api_base);

    let health = client.health().await?;
    info!(?health, "World API health check");

    let _systems = sync_solar_systems(&pool, &client).await?;

    let _tribes = sync_tribes(&pool, &client).await?;

    let _ships = sync_ships(&pool, &client).await?;

    let _types = sync_types(&pool, &client).await?;

    record_sync_state(&pool, "last_full_sync", &chrono::Utc::now().to_rfc3339()).await?;

    info!("EVE world data sync complete");
    Ok(())
}

// Pre-parsed row structs to avoid per-row string extraction in the query builder.
struct SolarSystemRow {
    id: String,
    name: Option<String>,
    raw: serde_json::Value,
}

struct TribeRow {
    id: String,
    name: Option<String>,
    raw: serde_json::Value,
}

struct ShipRow {
    id: String,
    name: Option<String>,
    owner_character_id: Option<String>,
    type_id: Option<String>,
    raw: serde_json::Value,
}

struct TypeRow {
    id: String,
    name: Option<String>,
    group_id: Option<String>,
    category_id: Option<String>,
    raw: serde_json::Value,
}

async fn sync_solar_systems(pool: &PgPool, client: &WorldApiClient) -> Result<usize> {
    let start = Instant::now();
    let count = client
        .stream_pages("/v2/solarsystems", |items, _page_num, _total| {
            let rows: Vec<_> = items
                .into_iter()
                .map(|(id, raw)| {
                    let name = raw.get("name").and_then(|v| v.as_str()).map(|s| s.to_owned());
                    SolarSystemRow { id, name, raw }
                })
                .collect();
            upsert_batch_solar_systems(pool, rows)
        })
        .await?;
    info!(
        endpoint = "solarsystems",
        total = count.total_processed,
        pages = count.pages,
        elapsed_ms = start.elapsed().as_millis(),
        "endpoint sync complete"
    );
    Ok(count.total_processed)
}

async fn sync_tribes(pool: &PgPool, client: &WorldApiClient) -> Result<usize> {
    let start = Instant::now();
    let count = client
        .stream_pages("/v2/tribes", |items, _page_num, _total| {
            let rows: Vec<_> = items
                .into_iter()
                .map(|(id, raw)| {
                    let name = raw.get("name").and_then(|v| v.as_str()).map(|s| s.to_owned());
                    TribeRow { id, name, raw }
                })
                .collect();
            upsert_batch_tribes(pool, rows)
        })
        .await?;
    info!(
        endpoint = "tribes",
        total = count.total_processed,
        pages = count.pages,
        elapsed_ms = start.elapsed().as_millis(),
        "endpoint sync complete"
    );
    Ok(count.total_processed)
}

async fn sync_ships(pool: &PgPool, client: &WorldApiClient) -> Result<usize> {
    let start = Instant::now();
    let count = client
        .stream_pages("/v2/ships", |items, _page_num, _total| {
            let rows: Vec<_> = items
                .into_iter()
                .map(|(id, raw)| {
                    let name = raw.get("name").and_then(|v| v.as_str()).map(|s| s.to_owned());
                    let owner_character_id = raw
                        .get("ownerCharacterId")
                        .or_else(|| raw.get("owner_character_id"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_owned());
                    let type_id = raw
                        .get("typeId")
                        .or_else(|| raw.get("type_id"))
                        .and_then(|v| v.as_i64())
                        .map(|n| n.to_string());
                    ShipRow { id, name, owner_character_id, type_id, raw }
                })
                .collect();
            upsert_batch_ships(pool, rows)
        })
        .await?;
    info!(
        endpoint = "ships",
        total = count.total_processed,
        pages = count.pages,
        elapsed_ms = start.elapsed().as_millis(),
        "endpoint sync complete"
    );
    Ok(count.total_processed)
}

async fn sync_types(pool: &PgPool, client: &WorldApiClient) -> Result<usize> {
    let start = Instant::now();
    let count = client
        .stream_pages("/v2/types", |items, _page_num, _total| {
            let rows: Vec<_> = items
                .into_iter()
                .map(|(id, raw)| {
                    let name = raw.get("name").and_then(|v| v.as_str()).map(|s| s.to_owned());
                    let group_id = raw
                        .get("groupId")
                        .or_else(|| raw.get("group_id"))
                        .and_then(|v| v.as_i64())
                        .map(|n| n.to_string());
                    let category_id = raw
                        .get("categoryId")
                        .or_else(|| raw.get("category_id"))
                        .and_then(|v| v.as_i64())
                        .map(|n| n.to_string());
                    TypeRow { id, name, group_id, category_id, raw }
                })
                .collect();
            upsert_batch_types(pool, rows)
        })
        .await?;
    info!(
        endpoint = "types",
        total = count.total_processed,
        pages = count.pages,
        elapsed_ms = start.elapsed().as_millis(),
        "endpoint sync complete"
    );
    Ok(count.total_processed)
}

async fn upsert_batch_solar_systems(
    pool: &PgPool,
    rows: Vec<SolarSystemRow>,
) -> Result<()> {
    let start = Instant::now();
    let count = rows.len();

    let mut qb = sqlx::QueryBuilder::new(
        "INSERT INTO eve_solar_systems (system_id, name, raw, synced_at) VALUES",
    );
    for (i, row) in rows.iter().enumerate() {
        if i > 0 {
            qb.push(",");
        }
        qb.push(" (")
            .push_bind(&row.id)
            .push(",")
            .push_bind(&row.name)
            .push(",")
            .push_bind(&row.raw)
            .push(", NOW())");
    }
    qb.push(" ON CONFLICT (system_id) DO UPDATE SET name = EXCLUDED.name, raw = EXCLUDED.raw, synced_at = EXCLUDED.synced_at");

    qb.build().execute(pool).await?;

    info!(
        endpoint = "solarsystems",
        count,
        db_ms = start.elapsed().as_millis(),
        "batch upsert"
    );
    Ok(())
}

async fn upsert_batch_tribes(pool: &PgPool, rows: Vec<TribeRow>) -> Result<()> {
    let start = Instant::now();
    let count = rows.len();

    let mut qb = sqlx::QueryBuilder::new(
        "INSERT INTO eve_tribes (tribe_id, name, raw, synced_at) VALUES",
    );
    for (i, row) in rows.iter().enumerate() {
        if i > 0 {
            qb.push(",");
        }
        qb.push(" (")
            .push_bind(&row.id)
            .push(",")
            .push_bind(&row.name)
            .push(",")
            .push_bind(&row.raw)
            .push(", NOW())");
    }
    qb.push(" ON CONFLICT (tribe_id) DO UPDATE SET name = EXCLUDED.name, raw = EXCLUDED.raw, synced_at = EXCLUDED.synced_at");

    qb.build().execute(pool).await?;

    info!(
        endpoint = "tribes",
        count,
        db_ms = start.elapsed().as_millis(),
        "batch upsert"
    );
    Ok(())
}

async fn upsert_batch_ships(pool: &PgPool, rows: Vec<ShipRow>) -> Result<()> {
    let start = Instant::now();
    let count = rows.len();

    let mut qb = sqlx::QueryBuilder::new(
        "INSERT INTO eve_ships (ship_id, name, owner_character_id, type_id, raw, synced_at) VALUES",
    );
    for (i, row) in rows.iter().enumerate() {
        if i > 0 {
            qb.push(",");
        }
        qb.push(" (")
            .push_bind(&row.id)
            .push(",")
            .push_bind(&row.name)
            .push(",")
            .push_bind(&row.owner_character_id)
            .push(",")
            .push_bind(&row.type_id)
            .push(",")
            .push_bind(&row.raw)
            .push(", NOW())");
    }
    qb.push(" ON CONFLICT (ship_id) DO UPDATE SET name = EXCLUDED.name, owner_character_id = EXCLUDED.owner_character_id, type_id = EXCLUDED.type_id, raw = EXCLUDED.raw, synced_at = EXCLUDED.synced_at");

    qb.build().execute(pool).await?;

    info!(
        endpoint = "ships",
        count,
        db_ms = start.elapsed().as_millis(),
        "batch upsert"
    );
    Ok(())
}

async fn upsert_batch_types(pool: &PgPool, rows: Vec<TypeRow>) -> Result<()> {
    let start = Instant::now();
    let count = rows.len();

    let mut qb = sqlx::QueryBuilder::new(
        "INSERT INTO eve_types (type_id, name, group_id, category_id, raw, synced_at) VALUES",
    );
    for (i, row) in rows.iter().enumerate() {
        if i > 0 {
            qb.push(",");
        }
        qb.push(" (")
            .push_bind(&row.id)
            .push(",")
            .push_bind(&row.name)
            .push(",")
            .push_bind(&row.group_id)
            .push(",")
            .push_bind(&row.category_id)
            .push(",")
            .push_bind(&row.raw)
            .push(", NOW())");
    }
    qb.push(" ON CONFLICT (type_id) DO UPDATE SET name = EXCLUDED.name, group_id = EXCLUDED.group_id, category_id = EXCLUDED.category_id, raw = EXCLUDED.raw, synced_at = EXCLUDED.synced_at");

    qb.build().execute(pool).await?;

    info!(
        endpoint = "types",
        count,
        db_ms = start.elapsed().as_millis(),
        "batch upsert"
    );
    Ok(())
}

async fn record_sync_state(pool: &PgPool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO eve_world_sync_state (key, value, synced_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, synced_at = NOW()",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
