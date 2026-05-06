use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::api_common::ApiError;

const DEFAULT_TENANT: &str = "stillness";

pub fn router() -> Router<PgPool> {
    Router::new().route("/world/gates", get(world_gates))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldGatesQuery {
    tenant: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorldGatesResponse {
    tenant: String,
    count: usize,
    gates: Vec<WorldGateCandidate>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct WorldGateCandidate {
    #[sqlx(rename = "gate_id")]
    world_gate_id: String,
    item_id: i64,
    tenant: String,
    status: String,
    linked_gate_id: Option<String>,
    fw_extension_active: bool,
    checkpoint_updated: i64,
    updated_at: String,
}

async fn world_gates(
    State(pool): State<PgPool>,
    Query(params): Query<WorldGatesQuery>,
) -> Result<Json<WorldGatesResponse>, ApiError> {
    let tenant = params
        .tenant
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_TENANT)
        .to_owned();

    let gates = sqlx::query_as::<_, WorldGateCandidate>(
        "SELECT
            gate_id,
            item_id,
            tenant,
            status,
            linked_gate_id,
            fw_extension_active,
            checkpoint_updated,
            updated_at::TEXT AS updated_at
         FROM world_gates
         WHERE tenant = $1
         ORDER BY
            CASE status
                WHEN 'online' THEN 0
                WHEN 'offline' THEN 1
                ELSE 2
            END,
            item_id ASC,
            checkpoint_updated DESC",
    )
    .bind(&tenant)
    .fetch_all(&pool)
    .await?;

    Ok(Json(WorldGatesResponse {
        tenant,
        count: gates.len(),
        gates,
    }))
}
