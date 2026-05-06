use std::collections::{HashMap, HashSet};

use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::normalize_sui_address;

use super::types::IdentityEnrichment;

const MAX_BATCH_WALLETS: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchWallet {
    pub original: String,
    pub normalized: String,
}

pub fn normalize_batch_wallets(wallets: Vec<String>) -> Vec<BatchWallet> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for original in wallets.into_iter().take(MAX_BATCH_WALLETS) {
        if !original.trim_start().starts_with("0x") {
            continue;
        }
        let normalized = normalize_sui_address(&original);
        if seen.insert(normalized.clone()) {
            out.push(BatchWallet {
                original,
                normalized,
            });
        }
    }

    out
}

pub fn queued_enrichment(wallet: &str) -> IdentityEnrichment {
    IdentityEnrichment {
        wallet: wallet.to_string(),
        character_id: None,
        character_name: None,
        tribe_id: None,
        tribe_name: None,
        frontierwarden_profile_id: None,
        identity_status: "queued".to_string(),
        synced_at: None,
    }
}

pub async fn batch_identity_enrichments(
    pool: &PgPool,
    wallets: Vec<String>,
) -> Result<HashMap<String, IdentityEnrichment>> {
    let batch = normalize_batch_wallets(wallets);
    let normalized: Vec<String> = batch.iter().map(|w| w.normalized.clone()).collect();
    queue_identity_resolutions(pool, &normalized, "batch_identity_lookup", 10).await?;

    let rows = if normalized.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, IdentityEnrichment>(
            "SELECT wallet, character_id, character_name, tribe_id, tribe_name,
                    frontierwarden_profile_id, identity_status, synced_at::TEXT
             FROM wallet_character_map
             WHERE wallet = ANY($1)",
        )
        .bind(&normalized)
        .fetch_all(pool)
        .await?
    };

    let mut by_wallet: HashMap<String, IdentityEnrichment> =
        rows.into_iter().map(|row| (row.wallet.clone(), row)).collect();

    for wallet in normalized {
        by_wallet
            .entry(wallet.clone())
            .or_insert_with(|| queued_enrichment(&wallet));
    }

    Ok(by_wallet)
}

pub async fn identity_by_character(
    pool: &PgPool,
    character_id: &str,
) -> Result<Option<IdentityEnrichment>> {
    let row = sqlx::query_as::<_, IdentityEnrichment>(
        "SELECT wallet, character_id, character_name, tribe_id, tribe_name,
                frontierwarden_profile_id, identity_status, synced_at::TEXT
         FROM wallet_character_map
         WHERE character_id = $1
         LIMIT 1",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn queue_identity_resolution(
    pool: &PgPool,
    wallet: &str,
    source: &str,
    priority: i32,
) -> Result<()> {
    let normalized = normalize_sui_address(wallet);
    sqlx::query(
        "INSERT INTO identity_resolution_queue (wallet, source, priority)
         VALUES ($1, $2, $3)
         ON CONFLICT (wallet) DO UPDATE SET
            source = EXCLUDED.source,
            priority = GREATEST(identity_resolution_queue.priority, EXCLUDED.priority),
            queued_at = NOW()",
    )
    .bind(&normalized)
    .bind(source)
    .bind(priority)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn queue_identity_resolutions(
    pool: &PgPool,
    wallets: &[String],
    source: &str,
    priority: i32,
) -> Result<()> {
    for wallet in wallets {
        queue_identity_resolution(pool, wallet, source, priority).await?;
    }
    Ok(())
}
