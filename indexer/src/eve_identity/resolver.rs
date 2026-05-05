use anyhow::Result;
use sqlx::PgPool;

use crate::config::EveConfig;
use crate::rpc::normalize_sui_address;

use super::client::{fetch_character_object, fetch_player_profile};
use super::db::{resolve_fw_profile_id, resolve_tribe_name, upsert_identity};
use super::types::EveIdentity;

/// Resolve identity via Sui GraphQL lookup.
/// Returns EveIdentity with resolved status or appropriate error status.
pub async fn resolve_identity_via_graphql(
    pool: &PgPool,
    wallet: &str,
    eve_cfg: &EveConfig,
) -> Result<EveIdentity> {
    let wallet = normalize_sui_address(wallet);

    if eve_cfg.player_profile_type.is_empty() {
        tracing::info!(wallet = %wallet, identity_status = "package_unknown", "EVE identity lookup skipped — player_profile_type not configured");
        let fw_profile = resolve_fw_profile_id(pool, &wallet).await?;
        let identity = EveIdentity {
            wallet,
            player_profile_object: None,
            character_id: None,
            character_object: None,
            tribe_id: None,
            tribe_name: None,
            character_name: None,
            tenant: None,
            item_id: None,
            frontierwarden_profile_id: fw_profile,
            identity_status: "package_unknown".into(),
            source: "sui_graphql".into(),
            synced_at: None,
        };
        return Ok(identity);
    }

    match fetch_player_profile(&eve_cfg.graphql_url, &wallet, &eve_cfg.player_profile_type).await {
        Ok(profile_result) => {
            let (player_profile_object, character_id, _tribe_id_from_profile, player_profile_raw) = profile_result;

            let identity_status = if character_id.is_some() || player_profile_object.is_some() {
                "resolved"
            } else {
                "not_found"
            };

            let mut tribe_id = None;
            let mut character_name = None;
            let mut tenant = None;
            let mut item_id = None;
            let mut character_object = None;
            let mut character_raw = None;

            if let Some(ref char_id) = character_id {
                match fetch_character_object(&eve_cfg.graphql_url, char_id).await {
                    Some(char_data) => {
                        tribe_id = char_data.tribe_id;
                        character_name = char_data.character_name;
                        tenant = char_data.tenant;
                        item_id = char_data.item_id;
                        character_object = Some(char_id.clone());
                        character_raw = Some(char_data.raw);
                    }
                    None => {
                        tracing::warn!(
                            wallet = %wallet,
                            character_id = %char_id,
                            "Character object lookup failed — tribe_id and enrichment fields will be null"
                        );
                    }
                }
            }

            let tribe_name = if let Some(ref tid) = tribe_id {
                match resolve_tribe_name(pool, tid).await {
                    Ok(name) => name,
                    Err(e) => {
                        tracing::debug!(tribe_id = %tid, error = %e, "tribe name lookup failed");
                        None
                    }
                }
            } else {
                None
            };

            let combined_raw = if let Some(char_data) = character_raw {
                serde_json::json!({
                    "player_profile": player_profile_raw,
                    "character": char_data
                })
            } else {
                player_profile_raw
            };

            tracing::info!(
                wallet = %wallet,
                identity_status = identity_status,
                player_profile_type = eve_cfg.player_profile_type,
                player_profile_object = ?player_profile_object,
                character_id = ?character_id,
                tribe_id = ?tribe_id,
                character_name = ?character_name,
                tenant = ?tenant,
                source = "sui_graphql",
                "EVE identity lookup complete"
            );

            let fw_profile = resolve_fw_profile_id(pool, &wallet).await?;
            let identity = EveIdentity {
                wallet: wallet.clone(),
                player_profile_object,
                character_id,
                character_object,
                tribe_id,
                tribe_name,
                character_name,
                tenant,
                item_id,
                frontierwarden_profile_id: fw_profile,
                identity_status: identity_status.into(),
                source: "sui_graphql".into(),
                synced_at: Some(chrono::Utc::now().to_rfc3339()),
            };

            upsert_identity(pool, &identity, Some(&combined_raw)).await?;

            Ok(identity)
        }
        Err(e) => {
            tracing::warn!(
                wallet = %wallet,
                error = %e,
                identity_status = "graphql_error",
                source = "sui_graphql",
                "EVE identity GraphQL lookup failed"
            );

            let fw_profile = resolve_fw_profile_id(pool, &wallet).await?;
            let identity = EveIdentity {
                wallet,
                player_profile_object: None,
                character_id: None,
                character_object: None,
                tribe_id: None,
                tribe_name: None,
                character_name: None,
                tenant: None,
                item_id: None,
                frontierwarden_profile_id: fw_profile,
                identity_status: "graphql_error".into(),
                source: "sui_graphql".into(),
                synced_at: None,
            };

            upsert_identity(pool, &identity, None).await?;

            Ok(identity)
        }
    }
}

/// Return a safe "unresolved" identity response.
/// Includes the FrontierWarden profile if found.
pub async fn unresolved_identity(pool: &PgPool, wallet: &str) -> Result<EveIdentity> {
    let fw_profile = resolve_fw_profile_id(pool, wallet).await?;
    Ok(EveIdentity {
        wallet: normalize_sui_address(wallet),
        player_profile_object: None,
        character_id: None,
        character_object: None,
        tribe_id: None,
        tribe_name: None,
        character_name: None,
        tenant: None,
        item_id: None,
        frontierwarden_profile_id: fw_profile,
        identity_status: "unresolved".into(),
        source: "unresolved".into(),
        synced_at: None,
    })
}
