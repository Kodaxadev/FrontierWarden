mod api;
mod api_attestations;
mod api_auth;
mod api_kill_mails;
mod api_challenges;
mod api_common;
mod api_eve;
mod api_gate_ops;
mod api_gates;
mod api_rate_limit;
mod api_registry;
mod api_reputation;
mod api_request_log;
mod api_sessions;
mod api_trust;
mod zklogin_verifier;
mod api_world_gate_traffic;
mod api_world_gates;

// Re-export for main
use api_trust::TrustConfig;
mod config;
mod db;
mod eve_identity;
#[cfg(test)]
mod gate_binding_status_api_tests;
mod gate_policy_bindings;
mod event_source;
mod ingester;
mod processor;
mod rpc;
#[cfg(test)]
mod trust_api_http_tests;
mod trust_db;
mod trust_eval_gate;
mod trust_eval_score;
mod trust_evaluator;
#[cfg(test)]
mod trust_evaluator_tests;
mod trust_freshness;
mod trust_response;
mod trust_types;
mod world_api;
mod world_gate_extensions;
mod world_gates;
mod world_gates_parser;
mod world_jump;
mod world_jump_parser;
mod kill_mail_poller;
mod world_topology;
mod world_topology_parser;
#[cfg(test)]
mod world_gate_traffic_api_tests;
#[cfg(test)]
mod world_gates_api_tests;

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
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let api_addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&api_addr).await?;
    tracing::info!(addr = api_addr, "API server listening");
    let trust_cfg = TrustConfig {
        default_gate_schema: cfg.trust.default_gate_schema.clone(),
        default_counterparty_schema: cfg.trust.default_counterparty_schema.clone(),
        default_bounty_schema: cfg.trust.default_bounty_schema.clone(),
    };
    let app = api::router(pool.clone(), trust_cfg, cfg.eve.clone());
    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("API server crashed");
    });

    // Kill mail backfill — pages through full history on first run (cursor = 0)
    kill_mail_poller::backfill_if_needed(&cfg.kill_mails, &pool).await?;

    // Kill mail incremental poller — fire-and-forget; disabled when kill_mails.enabled=false
    let km_cfg = cfg.kill_mails.clone();
    let km_pool = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = kill_mail_poller::run(km_cfg, km_pool).await {
            tracing::error!(error = %e, "kill mail poller exited with error");
        }
    });

    // Indexer loop — runs forever; returns only on fatal error
    let event_source = rpc::RpcClient::new(&cfg.network.rpc_url);
    ingester::run(cfg, pool, event_source).await
}
