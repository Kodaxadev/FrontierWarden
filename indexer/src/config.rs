use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub network:  NetworkConfig,
    pub package:  PackageConfig,
    pub database: DatabaseConfig,
    pub indexer:  IndexerConfig,
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

impl Config {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let text = std::fs::read_to_string(path.as_ref())
            .with_context(|| format!("cannot read {:?}", path.as_ref()))?;
        toml::from_str(&text).context("config.toml parse failed")
    }
}
