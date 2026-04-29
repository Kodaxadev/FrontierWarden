use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::api_common::{ApiError, LimitParams};

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/gates", get(gates))
        .route("/gates/{gate_id}", get(gate_single))
        .route("/gates/{gate_id}/policy", get(gate_policy))
        .route("/gates/{gate_id}/passages", get(gate_passages))
}

#[derive(Serialize, sqlx::FromRow)]
struct GateSummaryRow {
    gate_id: String,
    ally_threshold: Option<i64>,
    base_toll_mist: Option<i64>,
    config_updated_at: Option<String>,
    latest_checkpoint: Option<i64>,
    passages_24h: i64,
    denies_24h: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct GatePolicyRow {
    gate_id: String,
    ally_threshold: i64,
    base_toll_mist: i64,
    tx_digest: String,
    checkpoint_seq: i64,
    indexed_at: String,
}

#[derive(Serialize, sqlx::FromRow)]
struct GatePassageRow {
    gate_id: String,
    traveler: String,
    allowed: bool,
    score: Option<i64>,
    toll_paid: Option<i64>,
    tier: Option<i16>,
    reason: Option<i16>,
    epoch: i64,
    tx_digest: String,
    checkpoint_seq: i64,
    indexed_at: String,
}

async fn gates(State(pool): State<PgPool>) -> Result<Json<Vec<GateSummaryRow>>, ApiError> {
    let rows = sqlx::query_as::<_, GateSummaryRow>(GATES_SQL)
        .fetch_all(&pool)
        .await?;

    Ok(Json(rows))
}

async fn gate_single(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<Json<Option<GateSummaryRow>>, ApiError> {
    let row = sqlx::query_as::<_, GateSummaryRow>(GATE_SINGLE_SQL)
        .bind(&gate_id)
        .fetch_optional(&pool)
        .await?;

    Ok(Json(row))
}

async fn gate_policy(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<Json<Option<GatePolicyRow>>, ApiError> {
    let row = sqlx::query_as::<_, GatePolicyRow>(
        "SELECT gate_id, ally_threshold, base_toll_mist, tx_digest, checkpoint_seq,
                indexed_at::TEXT AS indexed_at
         FROM gate_config_updates
         WHERE gate_id = $1
         ORDER BY indexed_at DESC
         LIMIT 1",
    )
    .bind(&gate_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn gate_passages(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<GatePassageRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, GatePassageRow>(
        "SELECT gate_id, traveler, allowed, score, toll_paid, tier, reason, epoch,
                tx_digest, checkpoint_seq, indexed_at::TEXT AS indexed_at
         FROM gate_passages
         WHERE gate_id = $1
         ORDER BY indexed_at DESC
         LIMIT $2",
    )
    .bind(&gate_id)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

const GATES_SQL: &str = "
    WITH gate_ids AS (
        SELECT gate_id FROM gate_config_updates
        UNION
        SELECT gate_id FROM gate_passages
    ),
    latest_config AS (
        SELECT DISTINCT ON (gate_id)
               gate_id, ally_threshold, base_toll_mist, checkpoint_seq, indexed_at
        FROM gate_config_updates
        ORDER BY gate_id, indexed_at DESC
    )
    SELECT g.gate_id,
           c.ally_threshold,
           c.base_toll_mist,
           c.indexed_at::TEXT AS config_updated_at,
           NULLIF(GREATEST(COALESCE(MAX(c.checkpoint_seq), 0), COALESCE(MAX(p.checkpoint_seq), 0)), 0)::BIGINT AS latest_checkpoint,
           COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours')::BIGINT AS passages_24h,
           COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours' AND NOT p.allowed)::BIGINT AS denies_24h
    FROM gate_ids g
    LEFT JOIN latest_config c ON c.gate_id = g.gate_id
    LEFT JOIN gate_passages p ON p.gate_id = g.gate_id
    GROUP BY g.gate_id, c.ally_threshold, c.base_toll_mist, c.indexed_at
    ORDER BY COALESCE(c.indexed_at, NOW()) DESC, g.gate_id";

const GATE_SINGLE_SQL: &str = "
    WITH latest_config AS (
        SELECT DISTINCT ON (gate_id)
               gate_id, ally_threshold, base_toll_mist, checkpoint_seq, indexed_at
        FROM gate_config_updates
        WHERE gate_id = $1
        ORDER BY gate_id, indexed_at DESC
    )
    SELECT g.gate_id,
           c.ally_threshold,
           c.base_toll_mist,
           c.indexed_at::TEXT AS config_updated_at,
           NULLIF(GREATEST(COALESCE(MAX(c.checkpoint_seq), 0), COALESCE(MAX(p.checkpoint_seq), 0)), 0)::BIGINT AS latest_checkpoint,
           COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours')::BIGINT AS passages_24h,
           COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours' AND NOT p.allowed)::BIGINT AS denies_24h
    FROM (SELECT $1::TEXT AS gate_id) g
    LEFT JOIN latest_config c ON c.gate_id = g.gate_id
    LEFT JOIN gate_passages p ON p.gate_id = g.gate_id
    GROUP BY g.gate_id, c.ally_threshold, c.base_toll_mist, c.indexed_at
    HAVING c.gate_id IS NOT NULL OR COUNT(p.id) > 0";
