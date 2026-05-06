use axum::http::{HeaderValue, Method};
use axum::{middleware, routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};

use crate::api_trust::TrustConfig;
use crate::config::EveConfig;

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub fn router(pool: PgPool, trust_cfg: TrustConfig, eve_cfg: Option<EveConfig>) -> Router {
    let sessions = crate::api_sessions::SessionState::new();
    router_with_security(
        pool,
        crate::api_rate_limit::RateLimitState::from_env(),
        sessions,
        trust_cfg,
        eve_cfg,
    )
}

pub(crate) fn router_with_security(
    pool: PgPool,
    rate_limit: Option<crate::api_rate_limit::RateLimitState>,
    sessions: crate::api_sessions::SessionState,
    trust_cfg: TrustConfig,
    eve_cfg: Option<EveConfig>,
) -> Router {
    START.get_or_init(Instant::now);

    let api_routes = Router::new()
        .merge(crate::api_attestations::router())
        .merge(crate::api_challenges::router())
        .merge(crate::api_eve::router(eve_cfg))
        .merge(crate::api_gates::router())
        .merge(crate::api_gate_ops::router())
        .merge(crate::api_registry::router())
        .merge(crate::api_reputation::router())
        .merge(crate::api_trust::router_with_config(trust_cfg))
        .merge(crate::api_world_gates::router());

    let auth_routes = crate::api_sessions::router(sessions.clone());

    let auth_routes = if let Some(limiter) = rate_limit.clone() {
        auth_routes.layer(middleware::from_fn_with_state(
            limiter,
            crate::api_rate_limit::rate_limit,
        ))
    } else {
        auth_routes
    };

    let api_routes = if let Some(limiter) = rate_limit {
        api_routes.layer(middleware::from_fn_with_state(
            limiter,
            crate::api_rate_limit::rate_limit,
        ))
    } else {
        api_routes
    };

    Router::new()
        .route("/health", get(health))
        .merge(auth_routes)
        .merge(api_routes)
        .layer(middleware::from_fn(crate::api_request_log::log_request))
        .layer(cors_layer())
        .with_state(pool)
}

fn cors_layer() -> CorsLayer {
    let raw = std::env::var("EFREP_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:5173,http://localhost:3000".to_owned());
    let allowed: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter_map(|o| o.parse().ok())
        .collect();
    CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .allow_origin(allowed)
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
