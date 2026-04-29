use axum::{routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use std::time::Instant;

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub fn router(pool: PgPool) -> Router {
    START.get_or_init(Instant::now);
    Router::new()
        .route("/health", get(health))
        .merge(crate::api_attestations::router())
        .merge(crate::api_challenges::router())
        .merge(crate::api_gates::router())
        .merge(crate::api_gate_ops::router())
        .merge(crate::api_registry::router())
        .merge(crate::api_reputation::router())
        .merge(crate::api_trust::router())
        .with_state(pool)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    uptime_secs: u64,
}

async fn health() -> Json<HealthResponse> {
    let uptime = START.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    Json(HealthResponse {
        status: "ok",
        uptime_secs: uptime,
    })
}
