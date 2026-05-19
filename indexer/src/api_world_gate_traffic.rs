//! World gate topology and jump traffic read API.
//!
//! Advisory read surface only. No enforcement decisions. No trust scoring.
//! All returned signals (is_linked, fw_extension_active) are informational.
//!
//! Endpoints:
//!   GET /world/gates/:gate_id/links
//!   GET /world/gates/:gate_id/jumps?limit=N
//!   GET /world/gates/:gate_id/activity
//!   GET /world/gates/:gate_id         (combined summary)
//!   GET /world/characters/:character_id/jumps?limit=N

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::{
    api_common::{ApiError, LimitParams},
    world_gate_traffic_db::{gate_exists, jump_count_24h, jump_item_from_row, JumpWindowCounts, WorldGateRow},
    world_jump::{recent_jumps_for_character, recent_jumps_for_gate},
    world_topology::active_links_for_gate,
};

// ── Limit constants ──────────────────────────────────────────────────────────

const DEFAULT_LIMIT: i64 = 50;
/// Maximum rows returned by any jump endpoint. Callers that send limit > MAX are
/// silently clamped — no error is returned.
const MAX_LIMIT: i64 = 200;

pub(crate) fn clamp_limit(requested: Option<i64>) -> i64 {
    requested.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

// ── Router ───────────────────────────────────────────────────────────────────

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/world/gates/{gate_id}/links", get(gate_links))
        .route("/world/gates/{gate_id}/jumps", get(gate_jumps))
        .route("/world/gates/{gate_id}/activity", get(gate_activity))
        .route("/world/gates/{gate_id}", get(gate_summary))
        .route(
            "/world/characters/{character_id}/jumps",
            get(character_jumps),
        )
}

// ── Response types ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ActiveLinkItem {
    pub destination_gate_id: String,
    pub destination_gate_item_id: i64,
    pub destination_gate_tenant: String,
    pub linked_at_checkpoint: i64,
}

#[derive(Serialize)]
pub struct GateLinksResponse {
    pub gate_id: String,
    pub active_links: Vec<ActiveLinkItem>,
    pub link_count: usize,
}

#[derive(Serialize)]
pub struct JumpItem {
    pub tx_digest: String,
    pub checkpoint: i64,
    pub source_gate_id: String,
    pub destination_gate_id: String,
    pub character_id: String,
    pub character_item_id: i64,
    pub character_tenant: String,
}

#[derive(Serialize)]
pub struct GateJumpsResponse {
    pub gate_id: String,
    pub jumps: Vec<JumpItem>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct CharacterJumpsResponse {
    pub character_id: String,
    pub jumps: Vec<JumpItem>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct GateActivityResponse {
    pub gate_id: String,
    pub jump_count_1h: i64,
    pub jump_count_24h: i64,
    pub jump_count_7d: i64,
    pub unique_characters_24h: i64,
    pub is_linked: bool,
    pub link_count: i64,
    pub activity_window_note: &'static str,
}

#[derive(Serialize)]
pub struct GateSummaryResponse {
    pub gate_id: String,
    pub item_id: i64,
    pub tenant: String,
    pub status: String,
    pub fw_extension_active: bool,
    pub fw_gate_policy_id: Option<String>,
    pub is_linked: bool,
    pub link_count: usize,
    pub jump_count_24h: i64,
    pub active_links: Vec<ActiveLinkItem>,
}

// ── Error helpers ────────────────────────────────────────────────────────────

fn gate_not_found(gate_id: &str) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": "gate not found", "gate_id": gate_id })),
    )
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn gate_links(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let exists = gate_exists(&pool, &gate_id).await?;
    if !exists {
        return Ok(gate_not_found(&gate_id).into_response());
    }

    let links = active_links_for_gate(&pool, &gate_id).await?;

    let active_links: Vec<ActiveLinkItem> = links
        .into_iter()
        .map(|r| ActiveLinkItem {
            destination_gate_id: r.destination_gate_id,
            destination_gate_item_id: r.destination_gate_item_id,
            destination_gate_tenant: r.destination_gate_tenant,
            linked_at_checkpoint: r.linked_at_checkpoint,
        })
        .collect();

    let link_count = active_links.len();
    Ok(Json(GateLinksResponse {
        gate_id,
        active_links,
        link_count,
    })
    .into_response())
}

async fn gate_jumps(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<impl IntoResponse, ApiError> {
    let exists = gate_exists(&pool, &gate_id).await?;
    if !exists {
        return Ok(gate_not_found(&gate_id).into_response());
    }

    let limit = clamp_limit(params.limit);
    let rows = recent_jumps_for_gate(&pool, &gate_id, limit).await?;

    let jumps: Vec<JumpItem> = rows.into_iter().map(jump_item_from_row).collect();
    let total = jumps.len();

    Ok(Json(GateJumpsResponse {
        gate_id,
        jumps,
        total,
    })
    .into_response())
}

async fn character_jumps(
    State(pool): State<PgPool>,
    Path(character_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let rows = recent_jumps_for_character(&pool, &character_id, limit).await?;

    let jumps: Vec<JumpItem> = rows.into_iter().map(jump_item_from_row).collect();
    let total = jumps.len();

    Ok(Json(CharacterJumpsResponse {
        character_id,
        jumps,
        total,
    })
    .into_response())
}

async fn gate_activity(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let exists = gate_exists(&pool, &gate_id).await?;
    if !exists {
        return Ok(gate_not_found(&gate_id).into_response());
    }

    let counts = sqlx::query_as::<_, JumpWindowCounts>(
        "SELECT
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')  AS jump_count_1h,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS jump_count_24h,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS jump_count_7d
         FROM world_gate_jumps
         WHERE source_gate_id = $1 OR destination_gate_id = $1",
    )
    .bind(&gate_id)
    .fetch_one(&pool)
    .await?;

    let unique_chars: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT character_id)
         FROM world_gate_jumps
         WHERE (source_gate_id = $1 OR destination_gate_id = $1)
           AND created_at >= NOW() - INTERVAL '24 hours'",
    )
    .bind(&gate_id)
    .fetch_one(&pool)
    .await?;

    let link_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM world_gate_links
         WHERE source_gate_id = $1 AND is_active = TRUE",
    )
    .bind(&gate_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(GateActivityResponse {
        gate_id,
        jump_count_1h: counts.jump_count_1h,
        jump_count_24h: counts.jump_count_24h,
        jump_count_7d: counts.jump_count_7d,
        unique_characters_24h: unique_chars,
        is_linked: link_count > 0,
        link_count,
        activity_window_note:
            "Activity windows are based on when the indexer observed the event, \
             not an authoritative on-chain event timestamp.",
    })
    .into_response())
}

async fn gate_summary(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let gate_row = sqlx::query_as::<_, WorldGateRow>(
        "SELECT gate_id, item_id, tenant, status, fw_extension_active,
                fw_gate_policy_id
         FROM world_gates
         WHERE gate_id = $1",
    )
    .bind(&gate_id)
    .fetch_optional(&pool)
    .await?;

    let Some(gate) = gate_row else {
        return Ok(gate_not_found(&gate_id).into_response());
    };

    let (links, jc24h) = tokio::try_join!(
        active_links_for_gate(&pool, &gate_id),
        jump_count_24h(&pool, &gate_id),
    )?;

    let active_links: Vec<ActiveLinkItem> = links
        .into_iter()
        .map(|r| ActiveLinkItem {
            destination_gate_id: r.destination_gate_id,
            destination_gate_item_id: r.destination_gate_item_id,
            destination_gate_tenant: r.destination_gate_tenant,
            linked_at_checkpoint: r.linked_at_checkpoint,
        })
        .collect();

    let link_count = active_links.len();

    Ok(Json(GateSummaryResponse {
        gate_id: gate.gate_id,
        item_id: gate.item_id,
        tenant: gate.tenant,
        status: gate.status,
        fw_extension_active: gate.fw_extension_active,
        fw_gate_policy_id: gate.fw_gate_policy_id,
        is_linked: link_count > 0,
        link_count,
        jump_count_24h: jc24h,
        active_links,
    })
    .into_response())
}
