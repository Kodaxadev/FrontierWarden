use axum::{middleware, routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use std::time::Instant;

use crate::api_trust::TrustConfig;

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub fn router(pool: PgPool, trust_cfg: TrustConfig) -> Router {
    let sessions = crate::api_sessions::SessionState::new();
    router_with_security(
        pool,
        crate::api_auth::configured_api_key(),
        crate::api_rate_limit::RateLimitState::from_env(),
        sessions,
        trust_cfg,
    )
}

pub(crate) fn router_with_security(
    pool: PgPool,
    api_key: Option<String>,
    rate_limit: Option<crate::api_rate_limit::RateLimitState>,
    sessions: crate::api_sessions::SessionState,
    trust_cfg: TrustConfig,
) -> Router {
    START.get_or_init(Instant::now);

    let api_routes = Router::new()
        .merge(crate::api_attestations::router())
        .merge(crate::api_challenges::router())
        .merge(crate::api_gates::router())
        .merge(crate::api_gate_ops::router())
        .merge(crate::api_registry::router())
        .merge(crate::api_reputation::router())
        .merge(crate::api_trust::router_with_config(trust_cfg));

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

    let api_routes = if api_key.is_some() {
        let access = crate::api_auth::AccessState {
            api_key,
            sessions: sessions.clone(),
        };
        api_routes.layer(middleware::from_fn(move |req, next| {
            crate::api_auth::require_access(req, next, access.clone())
        }))
    } else {
        api_routes
    };

    Router::new()
        .route("/health", get(health))
        .merge(auth_routes)
        .merge(api_routes)
        .layer(middleware::from_fn(crate::api_request_log::log_request))
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
