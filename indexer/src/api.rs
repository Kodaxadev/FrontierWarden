use axum::http::{header, HeaderValue, Method};
use axum::{middleware, Router};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};

use crate::api_trust::TrustConfig;
use crate::config::EveConfig;

#[cfg(test)]
pub fn router(
    pool: PgPool,
    trust_cfg: TrustConfig,
    eve_cfg: Option<EveConfig>,
) -> Router {
    router_with_health(
        pool,
        trust_cfg,
        eve_cfg,
        crate::api_health::HealthConfig::default(),
    )
}

pub fn router_with_health(
    pool: PgPool,
    trust_cfg: TrustConfig,
    eve_cfg: Option<EveConfig>,
    health_cfg: crate::api_health::HealthConfig,
) -> Router {
    let sessions = crate::api_sessions::SessionState::new();
    router_with_security(
        pool,
        crate::api_rate_limit::RateLimitState::from_env(),
        sessions,
        trust_cfg,
        eve_cfg,
        health_cfg,
    )
}

pub(crate) fn router_with_security(
    pool: PgPool,
    rate_limit: Option<crate::api_rate_limit::RateLimitState>,
    sessions: crate::api_sessions::SessionState,
    trust_cfg: TrustConfig,
    eve_cfg: Option<EveConfig>,
    health_cfg: crate::api_health::HealthConfig,
) -> Router {
    let sensitive_limit = crate::api_rate_limit::RateLimitState::sensitive_from_env();
    let elevated_limit = crate::api_rate_limit::RateLimitState::elevated_from_env();

    // ── Sensitive tier (30/min default): identity batch, character jumps ──
    let sensitive_routes = Router::new()
        .merge(crate::api_eve::router(eve_cfg.clone()))
        .merge(crate::api_world_gate_traffic::router());
    let sensitive_routes = apply_rate_limit(sensitive_routes, sensitive_limit);

    // ── Elevated tier (60/min default): kill-mails, leaderboard, reputation ──
    let elevated_routes = Router::new()
        .merge(crate::api_kill_mails::router())
        .merge(crate::api_reputation::router());
    let elevated_routes = apply_rate_limit(elevated_routes, elevated_limit);

    // ── Standard routes (global limit only) ──
    let standard_routes = Router::new()
        .merge(crate::api_attestations::router())
        .merge(crate::api_challenges::router())
        .merge(crate::api_gates::router())
        .merge(crate::api_gate_ops::router())
        .merge(crate::api_registry::router())
        .merge(crate::api_trust::router_with_config(trust_cfg))
        .merge(crate::api_world_gates::router());

    // Merge all tiers then apply global rate limit on top.
    let api_routes = Router::new()
        .merge(sensitive_routes)
        .merge(elevated_routes)
        .merge(standard_routes);
    let api_routes = apply_rate_limit(api_routes, rate_limit.clone());

    let auth_routes = crate::api_sessions::router(sessions.clone());
    let auth_routes = apply_rate_limit(auth_routes, rate_limit);

    Router::new()
        .merge(crate::api_health::router(health_cfg))
        .merge(auth_routes)
        .merge(api_routes)
        .layer(middleware::from_fn(crate::api_request_log::log_request))
        .layer(cors_layer())
        .with_state(pool)
}

fn apply_rate_limit(
    router: Router<PgPool>,
    limiter: Option<crate::api_rate_limit::RateLimitState>,
) -> Router<PgPool> {
    if let Some(limiter) = limiter {
        router.layer(middleware::from_fn_with_state(
            limiter,
            crate::api_rate_limit::rate_limit,
        ))
    } else {
        router
    }
}

fn cors_layer() -> CorsLayer {
    let allowed_headers = [header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT];
    let allowed_methods = [Method::GET, Method::POST, Method::OPTIONS];

    let allow_any = std::env::var("EFREP_CORS_ALLOW_ANY")
        .unwrap_or_default()
        .eq_ignore_ascii_case("true");

    if allow_any {
        return CorsLayer::new()
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
            .allow_origin(Any);
    }

    let raw = std::env::var("EFREP_CORS_ALLOWED_ORIGINS")
        .or_else(|_| std::env::var("EFREP_ALLOWED_ORIGINS"))
        .unwrap_or_else(|_| {
            "http://localhost:5173,http://localhost:3000,https://frontierwarden.kodaxa.dev"
                .to_owned()
        });
    let allowed: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|o| o.parse().ok())
        .collect();
    CorsLayer::new()
        .allow_methods(allowed_methods)
        .allow_headers(allowed_headers)
        .allow_origin(allowed)
}
