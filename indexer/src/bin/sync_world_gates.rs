//! sync_world_gates - read-only Stillness world gate object projection.
//!
//! Usage:
//!   cargo run --bin sync_world_gates
//!
//! Requires:
//!   - config.toml with [eve] section
//!   - EFREP_DATABASE_URL or DATABASE_URL

use anyhow::Result;
use tracing::info;

use efrep_indexer::{
    config::Config,
    db,
    world_gates::{sync_world_gates, WorldGateSyncConfig},
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("sync_world_gates=info")),
        )
        .init();

    let cfg = Config::load("config.toml")?;
    let pool = db::create_pool(&cfg.database).await?;

    let Some(eve_cfg) = &cfg.eve else {
        anyhow::bail!("[eve] section not found in config.toml");
    };
    if !eve_cfg.enabled {
        anyhow::bail!("EVE sync is disabled (eve.enabled = false)");
    }

    let sync_cfg = WorldGateSyncConfig {
        graphql_url: &eve_cfg.graphql_url,
        world_pkg_original_id: &eve_cfg.world_pkg_original_id,
        world_pkg_published_at: &eve_cfg.world_pkg_published_at,
        tenant: &eve_cfg.world_tenant,
        efrep_package_id: &cfg.package.id,
        fw_module_name: "reputation_gate",
        fw_auth_witness: &eve_cfg.fw_gate_auth_witness,
    };

    info!(
        tenant = sync_cfg.tenant,
        world_pkg_original_id = sync_cfg.world_pkg_original_id,
        world_pkg_published_at = sync_cfg.world_pkg_published_at,
        "syncing world gate objects"
    );
    let count = sync_world_gates(&pool, &sync_cfg).await?;
    info!(count, "world gate object sync complete");
    Ok(())
}
