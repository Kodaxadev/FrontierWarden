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
    pub eve: Option<EveConfig>,
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
    #[serde(default = "TrustConfig::default_bounty_schema_str")]
    pub default_bounty_schema: String,
}

impl Default for TrustConfig {
    fn default() -> Self {
        Self {
            default_gate_schema: "TRIBE_STANDING".into(),
            default_counterparty_schema: "TRIBE_STANDING".into(),
            default_bounty_schema: "TRIBE_STANDING".into(),
        }
    }
}

impl TrustConfig {
    fn default_bounty_schema_str() -> String {
        "TRIBE_STANDING".into()
    }
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct EveConfig {
    pub enabled: bool,
    pub world_api_base: String,
    pub graphql_url: String,
    pub world_package_id: String,
    #[serde(default)]
    pub world_pkg_original_id: String,
    #[serde(default)]
    pub world_pkg_published_at: String,
    #[serde(default = "EveConfig::default_world_tenant")]
    pub world_tenant: String,
    pub player_profile_type: String,
    #[serde(default = "EveConfig::default_fw_gate_auth_witness")]
    pub fw_gate_auth_witness: String,
}

impl EveConfig {
    fn default_world_tenant() -> String {
        "stillness".into()
    }

    fn default_fw_gate_auth_witness() -> String {
        "FrontierWardenAuth".into()
    }
}

impl Config {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let text = std::fs::read_to_string(path.as_ref())
            .with_context(|| format!("cannot read {:?}", path.as_ref()))?;
        let mut cfg: Self = toml::from_str(&text).context("config.toml parse failed")?;
        cfg.database.url = resolve_database_url(&cfg.database.url)?;
        // Env var overrides for package config (Railway deployment)
        if let Ok(s) = std::env::var("EFREP_PACKAGE_ID") {
            cfg.package.id = s;
        }
        if let Ok(s) = std::env::var("EFREP_START_CHECKPOINT") {
            cfg.package.start_checkpoint = s.parse().unwrap_or(0);
        }
        // Env var overrides for trust schemas (TOML is optional, env wins when set)
        if let Ok(s) = std::env::var("EFREP_TRUST_GATE_SCHEMA") {
            cfg.trust.default_gate_schema = s;
        }
        if let Ok(s) = std::env::var("EFREP_TRUST_COUNTERPARTY_SCHEMA") {
            cfg.trust.default_counterparty_schema = s;
        }
        if let Ok(s) = std::env::var("EFREP_TRUST_BOUNTY_SCHEMA") {
            cfg.trust.default_bounty_schema = s;
        }
        // Env var overrides for EVE config
        if let Some(eve) = &mut cfg.eve {
            if let Ok(s) = std::env::var("EFREP_EVE_WORLD_API_BASE") {
                eve.world_api_base = s;
            }
            if let Ok(s) = std::env::var("EFREP_EVE_GRAPHQL_URL") {
                eve.graphql_url = s;
            }
            if let Ok(s) = std::env::var("EFREP_EVE_WORLD_PACKAGE_ID") {
                eve.world_package_id = s;
            }
            if let Ok(s) = std::env::var("EFREP_WORLD_PKG_ORIGINAL_ID") {
                eve.world_pkg_original_id = s;
            }
            if let Ok(s) = std::env::var("EFREP_WORLD_PKG_PUBLISHED_AT") {
                eve.world_pkg_published_at = s;
            }
            if let Ok(s) = std::env::var("EFREP_WORLD_TENANT") {
                eve.world_tenant = s;
            }
            if let Ok(s) = std::env::var("EFREP_FW_GATE_AUTH_WITNESS") {
                eve.fw_gate_auth_witness = s;
            }
            if let Ok(s) = std::env::var("EFREP_EVE_PLAYER_PROFILE_TYPE") {
                eve.player_profile_type = s;
            }
            if eve.world_pkg_original_id.is_empty() {
                eve.world_pkg_original_id = eve.world_package_id.clone();
            }
            if eve.world_pkg_published_at.is_empty() {
                eve.world_pkg_published_at = eve.world_package_id.clone();
            }
        }
        // Env var override for database max connections
        // Default to 5 in production to avoid Supabase session mode limit (15)
        // Clamp to 10 unless explicitly set higher via EFREP_MAX_CONNECTIONS_OVERRIDE
        let is_production = std::env::var("RAILWAY_ENVIRONMENT").as_deref() == Ok("production")
            || std::env::var("RUST_LOG").as_deref().is_ok();
        let default_max = if is_production {
            5
        } else {
            cfg.database.max_connections
        };
        let override_allowed = std::env::var("EFREP_MAX_CONNECTIONS_OVERRIDE").is_ok();
        let max_limit = if override_allowed { u32::MAX } else { 10 };
        cfg.database.max_connections = std::env::var("EFREP_MAX_CONNECTIONS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(default_max)
            .min(max_limit);
        Ok(cfg)
    }
}

fn resolve_database_url(value: &str) -> Result<String> {
    if let Some(env_key) = value.strip_prefix("env:") {
        return std::env::var(env_key)
            .with_context(|| format!("{env_key} must be set for database.url"));
    }

    // Railway/Supabase standard: DATABASE_URL env var
    if let Ok(url) = std::env::var("DATABASE_URL") {
        return Ok(url);
    }

    if let Ok(url) = std::env::var("EFREP_DATABASE_URL") {
        return Ok(url);
    }

    Ok(value.to_owned())
}
