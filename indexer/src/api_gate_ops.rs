use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::api_common::{ApiError, LimitParams};

pub fn router() -> Router<PgPool> {
    Router::new().route("/gates/{gate_id}/withdrawals", get(gate_withdrawals))
}

#[derive(Serialize, sqlx::FromRow)]
struct TollWithdrawalRow {
    gate_id: String,
    owner: String,
    amount_mist: i64,
    tx_digest: String,
    event_seq: i64,
    checkpoint_seq: i64,
    indexed_at: String,
}

async fn gate_withdrawals(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<TollWithdrawalRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, TollWithdrawalRow>(
        "SELECT gate_id, owner, amount_mist, tx_digest, event_seq, checkpoint_seq,
                indexed_at::TEXT AS indexed_at
         FROM toll_withdrawals
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
