mod api;
mod api_attestations;
mod api_auth;
mod api_challenges;
mod api_common;
mod api_gate_ops;
mod api_gates;
mod api_rate_limit;
mod api_registry;
mod api_reputation;
mod api_request_log;
mod api_sessions;
mod api_trust;
mod config;
mod db;
mod ingester;
mod processor;
mod rpc;
#[cfg(test)]
mod trust_api_http_tests;
mod trust_evaluator;
#[cfg(test)]
mod trust_evaluator_tests;
mod trust_freshness;
mod trust_types;

use anyhow::Result;
use tracing_subscriber::{fmt, EnvFilter};

/// efrep-indexer — EVE Frontier Reputation Protocol event indexer + REST API
///
/// Reads config.toml from the current directory.
/// Set RUST_LOG=efrep_indexer=debug for verbose output.
///
/// Spawns three concurrent tasks:
///   1. Indexer loop  — polls suix_queryEvents, writes to Postgres
///   2. Heat refresh  — REFRESH MATERIALIZED VIEW CONCURRENTLY system_heat every 5 min
///   3. API server    — Axum REST server on 0.0.0.0:3000
#[tokio::main]
async fn main() -> Result<()> {
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("efrep_indexer=info")),
        )
        .init();

    let cfg = config::Config::load("config.toml")?;
    let pool = db::create_pool(&cfg.database).await?;

    // Materialized view refresh — fire-and-forget background task
    ingester::spawn_heat_refresh(pool.clone());

    // REST API — bind before starting indexer so health checks work immediately
    let api_addr = "0.0.0.0:3000";
    let listener = tokio::net::TcpListener::bind(api_addr).await?;
    tracing::info!(addr = api_addr, "API server listening");
    let app = api::router(pool.clone());
    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("API server crashed");
    });

    // Indexer loop — runs forever; returns only on fatal error
    ingester::run(cfg, pool).await
}
