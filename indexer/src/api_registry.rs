use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::api_common::{ApiError, LimitParams};

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/schemas", get(schemas_list))
        .route("/oracles", get(oracles_list))
}

#[derive(Serialize, sqlx::FromRow)]
struct SchemaRow {
    schema_id: String,
    version: i64,
    resolver: Option<String>,
    deprecated_by: Option<String>,
    registered_tx: String,
    registered_at: String,
    deprecated_tx: Option<String>,
    deprecated_at: Option<String>,
}

async fn schemas_list(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<SchemaRow>>, ApiError> {
    let limit = params.limit.unwrap_or(100).min(500);
    let rows = sqlx::query_as::<_, SchemaRow>(
        "SELECT schema_id, version, resolver, deprecated_by, registered_tx,
                registered_at::TEXT AS registered_at,
                deprecated_tx, deprecated_at::TEXT AS deprecated_at
         FROM schemas
         ORDER BY registered_at DESC
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
struct OracleRow {
    oracle_address: String,
    name: String,
    tee_verified: bool,
    is_system_oracle: bool,
    registered_tx: String,
    registered_at: String,
}

async fn oracles_list(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<OracleRow>>, ApiError> {
    let limit = params.limit.unwrap_or(100).min(500);
    let rows = sqlx::query_as::<_, OracleRow>(
        "SELECT oracle_address, name, tee_verified, is_system_oracle, registered_tx,
                registered_at::TEXT AS registered_at
         FROM oracles
         ORDER BY registered_at DESC
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}
