use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::normalize_sui_address;

use super::types::EveIdentity;

/// Resolve cached identity for a wallet.
/// Returns `None` when no identity row exists.
pub async fn resolve_cached_identity(pool: &PgPool, wallet: &str) -> Result<Option<EveIdentity>> {
    let wallet = normalize_sui_address(wallet);
    let row = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
        ),
    >(
        "SELECT wallet, player_profile_object, character_id, character_object,
                tribe_id, character_name, tenant, item_id, frontierwarden_profile_id, identity_status, synced_at::TEXT
         FROM eve_identities
         WHERE wallet = $1",
    )
    .bind(&wallet)
    .fetch_optional(pool)
    .await?;

    let Some(r) = row else {
        return Ok(None);
    };

    // Resolve tribe name from eve_tribes if tribe_id is present
    let tribe_name = if let Some(ref tid) = r.4 {
        resolve_tribe_name(pool, tid).await.ok().flatten()
    } else {
        None
    };

    Ok(Some(EveIdentity {
        wallet: r.0,
        player_profile_object: r.1,
        character_id: r.2,
        character_object: r.3,
        tribe_id: r.4,
        tribe_name,
        character_name: r.5,
        tenant: r.6,
        item_id: r.7,
        frontierwarden_profile_id: r.8,
        identity_status: r.9,
        source: "cached".into(),
        synced_at: r.10,
    }))
}

/// Look up the FrontierWarden profile_id for a wallet owner.
/// Returns None if no profile exists.
pub async fn resolve_fw_profile_id(pool: &PgPool, wallet: &str) -> Result<Option<String>> {
    let wallet = normalize_sui_address(wallet);
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT profile_id FROM profiles WHERE owner = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&wallet)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.0))
}

/// Resolve a human-readable tribe name from eve_tribes by tribe_id.
pub(crate) async fn resolve_tribe_name(pool: &PgPool, tribe_id: &str) -> Result<Option<String>> {
    let name: Option<String> =
        sqlx::query_scalar("SELECT name FROM eve_tribes WHERE tribe_id = $1")
            .bind(tribe_id)
            .fetch_optional(pool)
            .await?;
    Ok(name)
}

/// Upsert identity into eve_identities.
pub async fn upsert_identity(
    pool: &PgPool,
    identity: &EveIdentity,
    raw_json: Option<&serde_json::Value>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO eve_identities
            (wallet, player_profile_object, character_id, character_object,
             tribe_id, character_name, tenant, item_id, frontierwarden_profile_id, identity_status, raw, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (wallet) DO UPDATE SET
            player_profile_object     = EXCLUDED.player_profile_object,
            character_id              = EXCLUDED.character_id,
            character_object          = EXCLUDED.character_object,
            tribe_id                  = EXCLUDED.tribe_id,
            character_name            = EXCLUDED.character_name,
            tenant                    = EXCLUDED.tenant,
            item_id                   = EXCLUDED.item_id,
            frontierwarden_profile_id = EXCLUDED.frontierwarden_profile_id,
            identity_status           = EXCLUDED.identity_status,
            raw                       = EXCLUDED.raw,
            synced_at                 = NOW()",
    )
    .bind(&identity.wallet)
    .bind(&identity.player_profile_object)
    .bind(&identity.character_id)
    .bind(&identity.character_object)
    .bind(&identity.tribe_id)
    .bind(&identity.character_name)
    .bind(&identity.tenant)
    .bind(&identity.item_id)
    .bind(&identity.frontierwarden_profile_id)
    .bind(&identity.identity_status)
    .bind(raw_json)
    .execute(pool)
    .await?;

    mark_identity_resolved(pool, &identity.wallet).await?;
    refresh_wallet_character_map(pool).await;
    Ok(())
}

async fn mark_identity_resolved(pool: &PgPool, wallet: &str) -> Result<()> {
    sqlx::query("UPDATE identity_resolution_queue SET resolved_at = NOW() WHERE wallet = $1")
        .bind(wallet)
        .execute(pool)
        .await?;
    Ok(())
}

async fn refresh_wallet_character_map(pool: &PgPool) {
    if let Err(err) = sqlx::query("REFRESH MATERIALIZED VIEW wallet_character_map")
        .execute(pool)
        .await
    {
        tracing::warn!(error = %err, "wallet_character_map refresh skipped");
    }
}
