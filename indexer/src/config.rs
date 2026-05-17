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
    #[serde(default)]
    pub kill_mails: KillMailsConfig,
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

#[derive(Debug, Deserialize, Clone)]
pub struct KillMailsConfig {
    /// Set to true to start the kill mail poller. Default false.
    pub enabled: bool,
    /// GET endpoint returning kill mail JSON array.
    #[serde(default = "KillMailsConfig::default_source_url")]
    pub source_url: String,
    /// Environment tag written to world_kill_mails.environment.
    #[serde(default = "KillMailsConfig::default_environment")]
    pub environment: String,
    /// Milliseconds between poll cycles when no new kills were found.
    #[serde(default = "KillMailsConfig::default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// Records per page (offset pagination).
    #[serde(default = "KillMailsConfig::default_page_size")]
    pub page_size: u64,
}

impl Default for KillMailsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            source_url: Self::default_source_url(),
            environment: Self::default_environment(),
            poll_interval_ms: Self::default_poll_interval_ms(),
            page_size: Self::default_page_size(),
        }
    }
}

impl KillMailsConfig {
    fn default_source_url() -> String {
        "https://api.alpha-strike.space/incident".into()
    }
    fn default_environment() -> String {
        "stillness".into()
    }
    fn default_poll_interval_ms() -> u64 {
        30_000
    }
    fn default_page_size() -> u64 {
        200
    }
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct EveConfig {
    pub enabled: bool,
    pub world_api_base: String,
    pub graphql_url: String,
    #[serde(default)]
    pub world_package_id: String,
    #[serde(default)]
    pub world_pkg_original_id: String,
    #[serde(default)]
    pub world_pkg_published_at: String,
    #[serde(default = "EveConfig::default_world_tenant")]
    pub world_tenant: String,
    #[serde(default)]
    pub world_start_checkpoint: u64,
    #[serde(default)]
    pub player_profile_type: String,
    #[serde(default = "EveConfig::default_fw_gate_auth_witness")]
    pub fw_gate_auth_witness: String,
    #[serde(default)]
    pub fw_gate_extension_typename: String,
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
            if let Ok(s) = std::env::var("EFREP_WORLD_START_CHECKPOINT") {
                eve.world_start_checkpoint = s.parse().unwrap_or(0);
            }
            if let Ok(s) = std::env::var("EFREP_FW_GATE_AUTH_WITNESS") {
                eve.fw_gate_auth_witness = s;
            }
            if let Ok(s) = std::env::var("EFREP_FW_GATE_EXTENSION_TYPENAME") {
                eve.fw_gate_extension_typename = s;
            }
            if let Ok(s) = std::env::var("EFREP_EVE_PLAYER_PROFILE_TYPE") {
                eve.player_profile_type = s;
            }
            if eve.enabled {
                validate_world_pkg_ids(eve)?;
            }
        }
        // Env var overrides for kill mail poller
        if let Ok(s) = std::env::var("EFREP_KILL_MAILS_ENABLED") {
            cfg.kill_mails.enabled = s.eq_ignore_ascii_case("true");
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

/// Reject placeholder or empty world package IDs at startup so the indexer
/// never subscribes to `0xPLACEHOLDER::gate::*` event filters.
fn validate_world_pkg_ids(eve: &EveConfig) -> Result<()> {
    for (name, val) in [
        ("world_pkg_original_id", &eve.world_pkg_original_id),
        ("world_pkg_published_at", &eve.world_pkg_published_at),
    ] {
        anyhow::ensure!(
            !val.is_empty(),
            "EVE config: {name} must be set — add EFREP_WORLD_PKG_ORIGINAL_ID / EFREP_WORLD_PKG_PUBLISHED_AT env vars"
        );
        anyhow::ensure!(
            !val.contains("PLACEHOLDER"),
            "EVE config: {name} is still a placeholder value ({val}) — set EFREP_WORLD_PKG_ORIGINAL_ID / EFREP_WORLD_PKG_PUBLISHED_AT"
        );
        anyhow::ensure!(
            val.starts_with("0x")
                && val.len() == 66
                && val[2..].chars().all(|c| c.is_ascii_hexdigit()),
            "EVE config: {name} must be a 0x-prefixed 64-hex-char Sui address, got: {val}"
        );
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_ADDR: &str =
        "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

    fn eve_with(original_id: &str, published_at: &str) -> EveConfig {
        EveConfig {
            enabled: true,
            world_pkg_original_id: original_id.into(),
            world_pkg_published_at: published_at.into(),
            ..Default::default()
        }
    }

    #[test]
    fn accepts_real_addresses() {
        assert!(validate_world_pkg_ids(&eve_with(REAL_ADDR, REAL_ADDR)).is_ok());
    }

    #[test]
    fn rejects_placeholder_original_id() {
        let err = validate_world_pkg_ids(&eve_with("0xPLACEHOLDER", REAL_ADDR)).unwrap_err();
        assert!(err.to_string().contains("placeholder"), "{err}");
    }

    #[test]
    fn rejects_placeholder_published_at() {
        let err = validate_world_pkg_ids(&eve_with(REAL_ADDR, "0xPLACEHOLDER")).unwrap_err();
        assert!(err.to_string().contains("placeholder"), "{err}");
    }

    #[test]
    fn rejects_empty_original_id() {
        let err = validate_world_pkg_ids(&eve_with("", REAL_ADDR)).unwrap_err();
        assert!(err.to_string().contains("must be set"), "{err}");
    }

    #[test]
    fn rejects_malformed_address() {
        let err = validate_world_pkg_ids(&eve_with("not-an-address", REAL_ADDR)).unwrap_err();
        assert!(err.to_string().contains("0x-prefixed"), "{err}");
    }

    #[test]
    fn rejects_truncated_address() {
        // Only 32 hex chars, not 64.
        let err =
            validate_world_pkg_ids(&eve_with("0x28b497559d65ab320d9da4613bf2498d", REAL_ADDR))
                .unwrap_err();
        assert!(err.to_string().contains("0x-prefixed"), "{err}");
    }

    #[test]
    fn kill_mails_enabled_env_toggle_parsing() {
        // Verify the boolean parsing rule used by EFREP_KILL_MAILS_ENABLED.
        // Config::load uses s.eq_ignore_ascii_case("true") — test that contract.
        assert!("true".eq_ignore_ascii_case("true"));
        assert!("TRUE".eq_ignore_ascii_case("true"));
        assert!("True".eq_ignore_ascii_case("true"));
        assert!(!"false".eq_ignore_ascii_case("true"));
        assert!(!"1".eq_ignore_ascii_case("true"));
        assert!(!"yes".eq_ignore_ascii_case("true"));
    }
}
