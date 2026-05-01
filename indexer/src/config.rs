use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub network: NetworkConfig,
    pub package: PackageConfig,
    pub database: DatabaseConfig,
    pub indexer: IndexerConfig,
    pub trust: TrustConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct NetworkConfig {
    pub rpc_url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct PackageConfig {
    pub id: String,
    /// Informational — documents the deploy epoch in config.toml.
    /// suix_queryEvents paginates by EventID, not checkpoint; this field
    /// is logged on fresh start but cannot be used as an RPC filter.
    pub start_checkpoint: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct IndexerConfig {
    pub batch_size: u32,
    pub poll_interval_ms: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TrustConfig {
    pub default_gate_schema: String,
    pub default_counterparty_schema: String,
}

impl Default for TrustConfig {
    fn default() -> Self {
        Self {
            default_gate_schema: "TRIBE_STANDING".into(),
            default_counterparty_schema: "TRIBE_STANDING".into(),
        }
    }
}

impl Config {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let text = std::fs::read_to_string(path.as_ref())
            .with_context(|| format!("cannot read {:?}", path.as_ref()))?;
        let mut cfg: Self = toml::from_str(&text).context("config.toml parse failed")?;
        cfg.database.url = resolve_database_url(&cfg.database.url)?;
        // Env var overrides for trust schemas (TOML is optional, env wins when set)
        if let Ok(s) = std::env::var("EFREP_TRUST_GATE_SCHEMA") {
            cfg.trust.default_gate_schema = s;
        }
        if let Ok(s) = std::env::var("EFREP_TRUST_COUNTERPARTY_SCHEMA") {
            cfg.trust.default_counterparty_schema = s;
        }
        Ok(cfg)
    }
}

fn resolve_database_url(value: &str) -> Result<String> {
    if let Some(env_key) = value.strip_prefix("env:") {
        return std::env::var(env_key)
            .with_context(|| format!("{env_key} must be set for database.url"));
    }

    if let Ok(url) = std::env::var("EFREP_DATABASE_URL") {
        return Ok(url);
    }

    Ok(value.to_owned())
}
