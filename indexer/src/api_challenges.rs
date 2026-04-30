use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::api_common::{ApiError, LimitParams};
use crate::rpc::normalize_sui_address;

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/challenges", get(challenges))
        .route("/challenges/stats", get(challenge_stats))
        .route("/challenges/{challenge_id}", get(challenge_single))
        .route(
            "/challenges/by-challenger/{address}",
            get(challenges_by_challenger),
        )
        .route("/oracles/{oracle}/challenges", get(challenges_for_oracle))
}

#[derive(Serialize, sqlx::FromRow)]
struct FraudChallengeRow {
    challenge_id: String,
    attestation_id: String,
    challenger: String,
    oracle: String,
    created_tx: String,
    created_at: String,
    resolved: bool,
    guilty: Option<bool>,
    slash_amount: Option<i64>,
    resolved_tx: Option<String>,
    resolved_at: Option<String>,
}

#[derive(Serialize)]
struct ChallengeStats {
    total: i64,
    active: i64,
    resolved: i64,
    guilty_count: i64,
    cleared_count: i64,
    total_slashed: i64,
    /// Guilty rate as percentage (0–100), null when no resolved challenges.
    guilty_rate: Option<f64>,
}

async fn challenges(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<FraudChallengeRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = challenge_query().bind(limit).fetch_all(&pool).await?;

    Ok(Json(rows))
}

async fn challenge_single(
    State(pool): State<PgPool>,
    Path(challenge_id): Path<String>,
) -> Result<Json<Option<FraudChallengeRow>>, ApiError> {
    let row = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         WHERE challenge_id = $1",
    )
    .bind(&challenge_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn challenges_for_oracle(
    State(pool): State<PgPool>,
    Path(oracle): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<FraudChallengeRow>>, ApiError> {
    let normalized = normalize_sui_address(&oracle);
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         WHERE oracle = $1
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(&normalized)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn challenges_by_challenger(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<FraudChallengeRow>>, ApiError> {
    let normalized = normalize_sui_address(&address);
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         WHERE challenger = $1
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(&normalized)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn challenge_stats(State(pool): State<PgPool>) -> Result<Json<ChallengeStats>, ApiError> {
    let row = sqlx::query_as::<_, (i64, i64, i64, i64, i64)>(
        "SELECT COUNT(*)::BIGINT                                             AS total,
                COUNT(*) FILTER (WHERE NOT resolved)::BIGINT                 AS active,
                COUNT(*) FILTER (WHERE resolved)::BIGINT                     AS resolved,
                COUNT(*) FILTER (WHERE resolved AND guilty = TRUE)::BIGINT   AS guilty_count,
                COUNT(*) FILTER (WHERE resolved AND guilty = FALSE)::BIGINT  AS cleared_count
         FROM fraud_challenges",
    )
    .fetch_one(&pool)
    .await?;

    let total_slashed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(slash_amount), 0)::BIGINT FROM fraud_challenges WHERE resolved AND guilty = TRUE",
    )
    .fetch_one(&pool)
    .await?;

    let guilty_rate = if row.2 > 0 {
        Some((row.3 as f64 / row.2 as f64) * 100.0)
    } else {
        None
    };

    Ok(Json(ChallengeStats {
        total: row.0,
        active: row.1,
        resolved: row.2,
        guilty_count: row.3,
        cleared_count: row.4,
        total_slashed,
        guilty_rate,
    }))
}

fn challenge_query(
) -> sqlx::query::QueryAs<'static, sqlx::Postgres, FraudChallengeRow, sqlx::postgres::PgArguments> {
    sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         ORDER BY created_at DESC
         LIMIT $1",
    )
}
