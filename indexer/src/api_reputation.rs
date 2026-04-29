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
        .route("/scores/{profile_id}", get(scores_for_profile))
        .route("/scores/{profile_id}/{schema_id}", get(score_single))
        .route("/profiles/{profile_id}/vouches", get(vouches_for_profile))
        .route("/profiles/by-owner/{address}", get(profile_by_owner))
        .route("/profiles/{address}/given-vouches", get(given_vouches))
        .route("/leaderboard/{schema_id}", get(leaderboard))
}

#[derive(Serialize, sqlx::FromRow)]
struct ScoreRow {
    profile_id: String,
    schema_id: String,
    value: i64,
    issuer: String,
    last_tx_digest: String,
    last_checkpoint: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct LeaderboardEntry {
    profile_id: String,
    value: i64,
    issuer: String,
}

#[derive(Serialize, sqlx::FromRow)]
struct VouchRow {
    vouch_id: String,
    voucher: String,
    vouchee: String,
    stake_amount: i64,
    created_tx: String,
    created_at: String,
    redeemed: bool,
    amount_returned: Option<i64>,
    redeemed_tx: Option<String>,
    redeemed_at: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct ProfileRow {
    profile_id: String,
    owner: String,
    created_tx: String,
    created_at: String,
}

async fn scores_for_profile(
    State(pool): State<PgPool>,
    Path(profile_id): Path<String>,
) -> Result<Json<Vec<ScoreRow>>, ApiError> {
    let rows = sqlx::query_as::<_, ScoreRow>(
        "SELECT profile_id, schema_id, value, issuer, last_tx_digest, last_checkpoint
         FROM score_cache
         WHERE profile_id = $1
         ORDER BY schema_id",
    )
    .bind(&profile_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn score_single(
    State(pool): State<PgPool>,
    Path((profile_id, schema_id)): Path<(String, String)>,
) -> Result<Json<Option<ScoreRow>>, ApiError> {
    let row = sqlx::query_as::<_, ScoreRow>(
        "SELECT profile_id, schema_id, value, issuer, last_tx_digest, last_checkpoint
         FROM score_cache
         WHERE profile_id = $1 AND schema_id = $2",
    )
    .bind(&profile_id)
    .bind(&schema_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn vouches_for_profile(
    State(pool): State<PgPool>,
    Path(profile_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<VouchRow>>, ApiError> {
    vouches_by_column(pool, "vouchee", &profile_id, params.limit).await
}

async fn given_vouches(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<VouchRow>>, ApiError> {
    vouches_by_column(pool, "voucher", &address, params.limit).await
}

async fn leaderboard(
    State(pool): State<PgPool>,
    Path(schema_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<LeaderboardEntry>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, LeaderboardEntry>(
        "SELECT profile_id, value, issuer
         FROM score_cache
         WHERE schema_id = $1
         ORDER BY value DESC
         LIMIT $2",
    )
    .bind(&schema_id)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn profile_by_owner(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
) -> Result<Json<Option<ProfileRow>>, ApiError> {
    let row = sqlx::query_as::<_, ProfileRow>(
        "SELECT profile_id, owner, created_tx, created_at::TEXT AS created_at
         FROM profiles
         WHERE owner = $1
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(&address)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn vouches_by_column(
    pool: PgPool,
    column: &str,
    address: &str,
    requested_limit: Option<i64>,
) -> Result<Json<Vec<VouchRow>>, ApiError> {
    let limit = requested_limit.unwrap_or(50).min(200);
    let sql = format!(
        "SELECT vouch_id, voucher, vouchee, stake_amount, created_tx,
                created_at::TEXT AS created_at, redeemed, amount_returned,
                redeemed_tx, redeemed_at::TEXT AS redeemed_at
         FROM vouches
         WHERE {column} = $1
         ORDER BY created_at DESC
         LIMIT $2"
    );
    let rows = sqlx::query_as::<_, VouchRow>(&sql)
        .bind(address)
        .bind(limit)
        .fetch_all(&pool)
        .await?;

    Ok(Json(rows))
}
