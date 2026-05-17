//! Read-only kill mail API.
//!
//! Exposes native EVE Frontier kill data ingested from the alpha-strike
//! community API. This is combat telemetry — not trust scores, not
//! attestations, and not targeting intelligence.
//!
//! SHIP_KILL attestations are a separate, trust-layer concept and are served
//! by the attestation endpoints. These two data sources must not be conflated.
//!
//! Data aggregation policy: paginated reads only, max 200 rows per page,
//! no bulk export, no "vulnerable pilot" filters, no social-graph traversal.
//!
//! Endpoints:
//!   GET /kill-mails?limit=&cursor=
//!   GET /kill-mails/:id
//!   GET /world/characters/:address/kills?limit=&cursor=
//!   GET /world/characters/:address/losses?limit=&cursor=
//!   GET /world/systems/:system_id/kills?limit=&cursor=

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::api_common::ApiError;

// ── Pagination constants ──────────────────────────────────────────────────────

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

fn clamp_limit(requested: Option<i64>) -> i64 {
    requested.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

/// Decode a cursor string into an exclusive upper-bound row id.
/// Cursor is base64url(decimal string of i64 id).
fn decode_cursor(s: &str) -> Option<i64> {
    let bytes = URL_SAFE_NO_PAD.decode(s).ok()?;
    let id_str = std::str::from_utf8(&bytes).ok()?;
    id_str.parse::<i64>().ok()
}

fn encode_cursor(id: i64) -> String {
    URL_SAFE_NO_PAD.encode(id.to_string())
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/kill-mails", get(list_kill_mails))
        .route("/kill-mails/{id}", get(get_kill_mail))
        .route(
            "/world/characters/{address}/kills",
            get(character_kills),
        )
        .route(
            "/world/characters/{address}/losses",
            get(character_losses),
        )
        .route("/world/systems/{system_id}/kills", get(system_kills))
}

// ── Query params ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PageParams {
    limit: Option<i64>,
    cursor: Option<String>,
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailItem {
    pub kill_mail_id: i64,
    pub source_id: i64,
    pub environment: String,
    pub killer_name: Option<String>,
    pub killer_address: Option<String>,
    pub killer_tribe: Option<String>,
    pub victim_name: Option<String>,
    pub victim_address: Option<String>,
    pub victim_tribe: Option<String>,
    pub solar_system_id: Option<i64>,
    pub solar_system_name: Option<String>,
    pub loss_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kill_timestamp: Option<String>,
    pub indexed_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailListResponse {
    pub items: Vec<KillMailItem>,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// Reminds callers that this is raw combat telemetry, not trust scores.
    pub data_note: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailResponse {
    #[serde(flatten)]
    pub kill_mail: KillMailItem,
    pub raw_json: Option<serde_json::Value>,
}

// ── DB row ────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct KillMailRow {
    id: i64,
    source_id: i64,
    environment: String,
    killer_name: Option<String>,
    killer_address: Option<String>,
    killer_tribe: Option<String>,
    victim_name: Option<String>,
    victim_address: Option<String>,
    victim_tribe: Option<String>,
    solar_system_id: Option<i64>,
    solar_system_name: Option<String>,
    loss_type: Option<String>,
    kill_time: Option<chrono::DateTime<chrono::Utc>>,
    indexed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
struct KillMailRowWithRaw {
    id: i64,
    source_id: i64,
    environment: String,
    killer_name: Option<String>,
    killer_address: Option<String>,
    killer_tribe: Option<String>,
    victim_name: Option<String>,
    victim_address: Option<String>,
    victim_tribe: Option<String>,
    solar_system_id: Option<i64>,
    solar_system_name: Option<String>,
    loss_type: Option<String>,
    kill_time: Option<chrono::DateTime<chrono::Utc>>,
    indexed_at: chrono::DateTime<chrono::Utc>,
    raw_json: Option<serde_json::Value>,
}

// ── Conversion ────────────────────────────────────────────────────────────────

fn row_to_item(r: KillMailRow) -> KillMailItem {
    KillMailItem {
        kill_mail_id: r.id,
        source_id: r.source_id,
        environment: r.environment,
        killer_name: r.killer_name,
        killer_address: r.killer_address,
        killer_tribe: r.killer_tribe,
        victim_name: r.victim_name,
        victim_address: r.victim_address,
        victim_tribe: r.victim_tribe,
        solar_system_id: r.solar_system_id,
        solar_system_name: r.solar_system_name,
        loss_type: r.loss_type,
        kill_timestamp: r.kill_time.map(|t| t.to_rfc3339()),
        indexed_at: r.indexed_at.to_rfc3339(),
    }
}

const DATA_NOTE: &str =
    "Native kill mail data is combat telemetry. \
     It is not a trust score, attestation, or targeting recommendation. \
     SHIP_KILL attestations are a separate trust-layer signal served by /attestations.";

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /kill-mails?limit=&cursor=
///
/// Paginated list of all kill mails, ordered newest first (by id DESC).
/// Cursor is an opaque token from a previous response's `nextCursor` field.
/// Max 200 rows per page. No bulk export.
async fn list_kill_mails(
    State(pool): State<PgPool>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE id < $1
             ORDER BY id DESC
             LIMIT $2",
        )
        .bind(before_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             ORDER BY id DESC
             LIMIT $1",
        )
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    };

    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /kill-mails/:id
///
/// Single kill mail by DB row id. Includes raw_json (the original alpha-strike payload).
async fn get_kill_mail(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, KillMailRowWithRaw>(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at, raw_json
         FROM world_kill_mails
         WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?;

    let Some(r) = row else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "kill mail not found", "id": id })),
        )
            .into_response());
    };

    let kill_mail = KillMailItem {
        kill_mail_id: r.id,
        source_id: r.source_id,
        environment: r.environment,
        killer_name: r.killer_name,
        killer_address: r.killer_address,
        killer_tribe: r.killer_tribe,
        victim_name: r.victim_name,
        victim_address: r.victim_address,
        victim_tribe: r.victim_tribe,
        solar_system_id: r.solar_system_id,
        solar_system_name: r.solar_system_name,
        loss_type: r.loss_type,
        kill_timestamp: r.kill_time.map(|t| t.to_rfc3339()),
        indexed_at: r.indexed_at.to_rfc3339(),
    };

    Ok(Json(KillMailResponse {
        kill_mail,
        raw_json: r.raw_json,
    })
    .into_response())
}

/// GET /world/characters/:address/kills?limit=&cursor=
///
/// Kill mails where the given address was the killer, newest first.
async fn character_kills(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = fetch_by_column(&pool, "killer_address", &address, limit, cursor_id).await?;
    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /world/characters/:address/losses?limit=&cursor=
///
/// Kill mails where the given address was the victim, newest first.
async fn character_losses(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = fetch_by_column(&pool, "victim_address", &address, limit, cursor_id).await?;
    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /world/systems/:system_id/kills?limit=&cursor=
///
/// Kill mails in the given solar system, newest first.
async fn system_kills(
    State(pool): State<PgPool>,
    Path(system_id): Path<i64>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE solar_system_id = $1 AND id < $2
             ORDER BY id DESC
             LIMIT $3",
        )
        .bind(system_id)
        .bind(before_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE solar_system_id = $1
             ORDER BY id DESC
             LIMIT $2",
        )
        .bind(system_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    };

    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async fn fetch_by_column(
    pool: &PgPool,
    column: &str,
    value: &str,
    limit: i64,
    cursor_id: Option<i64>,
) -> Result<Vec<KillMailRow>, sqlx::Error> {
    // column is always a hardcoded literal from callers — no injection risk.
    let sql_cursor = format!(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at
         FROM world_kill_mails
         WHERE {column} = $1 AND id < $2
         ORDER BY id DESC
         LIMIT $3"
    );
    let sql_first = format!(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at
         FROM world_kill_mails
         WHERE {column} = $1
         ORDER BY id DESC
         LIMIT $2"
    );

    if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(&sql_cursor)
            .bind(value)
            .bind(before_id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as::<_, KillMailRow>(&sql_first)
            .bind(value)
            .bind(limit + 1)
            .fetch_all(pool)
            .await
    }
}

/// Splits limit+1 rows into (items, next_cursor).
/// If we got limit+1 back, there is another page; the cursor points at the
/// last item we return (exclusive — caller fetches rows with id < cursor).
fn paginate(mut rows: Vec<KillMailRow>, limit: i64) -> (Vec<KillMailItem>, Option<String>) {
    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }
    let next_cursor = if has_more {
        rows.last().map(|r| encode_cursor(r.id))
    } else {
        None
    };
    let items = rows.into_iter().map(row_to_item).collect();
    (items, next_cursor)
}
