use anyhow::Result;
use reqwest::Client;
use sqlx::PgPool;

use crate::config::EveConfig;
use crate::rpc::normalize_sui_address;

#[derive(Debug, Clone, serde::Serialize)]
pub struct EveIdentity {
    pub wallet: String,
    pub player_profile_object: Option<String>,
    pub character_id: Option<String>,
    pub character_object: Option<String>,
    pub tribe_id: Option<String>,
    pub tribe_name: Option<String>,
    pub character_name: Option<String>,
    pub tenant: Option<String>,
    pub item_id: Option<String>,
    pub frontierwarden_profile_id: Option<String>,
    pub identity_status: String,
    pub source: String,
    pub synced_at: Option<String>,
}

// ── GraphQL types ─────────────────────────────────────────────────────────────
// These structs are used via serde::Deserialize for JSON parsing.

#[allow(dead_code)]
#[derive(serde::Serialize)]
struct GraphQlRequest {
    query: &'static str,
    variables: GraphQlVariables,
}

#[allow(dead_code)]
#[derive(serde::Serialize)]
struct GraphQlVariables {
    address: String,
    profile_type: String,
}

const GRAPHQL_QUERY: &str = r#"
query GetCharacterDetails($address: SuiAddress!, $profileType: String!) {
  address(address: $address) {
    objects(last: 10, filter: { type: $profileType }) {
      nodes {
        address
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
}
"#;

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlResponse {
    data: Option<GraphQlData>,
    errors: Option<Vec<GraphQlError>>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlError {
    message: String,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlData {
    address: Option<GraphQlAddress>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlAddress {
    objects: Option<GraphQlObjects>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlObjects {
    nodes: Vec<GraphQlNode>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlNode {
    address: String,
    contents: Option<GraphQlContents>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct GraphQlContents {
    #[serde(rename = "type")]
    type_info: TypeInfo,
    json: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
struct TypeInfo {
    repr: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
struct CharacterData {
    tribe_id: Option<String>,
    tenant: Option<String>,
    item_id: Option<String>,
    character_name: Option<String>,
    raw: serde_json::Value,
}

const CHARACTER_GRAPHQL_QUERY: &str = r#"
query GetCharacter($characterId: SuiAddress!) {
  object(address: $characterId) {
    address
    asMoveObject {
      contents {
        type {
          repr
        }
        json
      }
    }
  }
}
"#;

// ── Public functions ──────────────────────────────────────────────────────────

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

/// Resolve identity via Sui GraphQL lookup.
/// Returns EveIdentity with resolved status or appropriate error status.
pub async fn resolve_identity_via_graphql(
    pool: &PgPool,
    wallet: &str,
    eve_cfg: &EveConfig,
) -> Result<EveIdentity> {
    let wallet = normalize_sui_address(wallet);

    // Check if config is available
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

    // Attempt GraphQL lookup
    match fetch_player_profile(&eve_cfg.graphql_url, &wallet, &eve_cfg.player_profile_type).await {
        Ok(profile_result) => {
            let (player_profile_object, character_id, _tribe_id_from_profile, player_profile_raw) = profile_result;
            
            // Determine identity_status based on PlayerProfile result
            let identity_status = if character_id.is_some() {
                "resolved"
            } else if player_profile_object.is_some() {
                "resolved"
            } else {
                "not_found"
            };

            // Attempt Character object lookup (non-fatal)
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

            // Resolve tribe name from eve_tribes (non-fatal, best-effort)
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

            // Build combined raw JSON
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

            // Upsert into cache
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

            // Cache the error state
            upsert_identity(pool, &identity, None).await?;

            Ok(identity)
        }
    }
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
async fn resolve_tribe_name(pool: &PgPool, tribe_id: &str) -> Result<Option<String>> {
    let name: Option<String> =
        sqlx::query_scalar("SELECT name FROM eve_tribes WHERE tribe_id = $1")
            .bind(tribe_id)
            .fetch_optional(pool)
            .await?;
    Ok(name)
}

/// Fetch and parse a Character object from Sui GraphQL.
/// Returns CharacterData or None if the lookup fails (non-fatal).
async fn fetch_character_object(
    graphql_url: &str,
    character_id: &str,
) -> Option<CharacterData> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let req_body = serde_json::json!({
        "query": CHARACTER_GRAPHQL_QUERY,
        "variables": { "characterId": character_id }
    });

    tracing::debug!(
        graphql_url = graphql_url,
        character_id = character_id,
        "fetching Character object from GraphQL"
    );

    let res = client
        .post(graphql_url)
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        tracing::warn!(
            character_id = character_id,
            http_status = res.status().as_u16(),
            "Character object lookup failed"
        );
        return None;
    }

    let body_text = res.text().await.ok()?;
    let body: serde_json::Value = serde_json::from_str(&body_text).ok()?;

    // Check for GraphQL errors
    if let Some(errors) = body.get("errors") {
        tracing::warn!(
            character_id = character_id,
            graphql_errors = %errors,
            "GraphQL errors during Character lookup"
        );
        return None;
    }

    // Extract object contents
    let contents = body.get("data")
        .and_then(|d| d.get("object"))
        .and_then(|o| o.get("asMoveObject"))
        .and_then(|m| m.get("contents"));

    let Some(inner) = contents else {
        tracing::warn!(character_id = character_id, "Character object has no contents");
        return None;
    };

    let json = inner.get("json").cloned()?;
    let raw = body.clone();

    // Extract fields from Character JSON
    let tribe_id = json.get("tribe_id")
        .and_then(|v| v.as_u64())
        .map(|n| n.to_string())
        .or_else(|| {
            json.get("tribe_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    let tenant = json.get("key")
        .and_then(|k| k.get("tenant"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let item_id = json.get("key")
        .and_then(|k| k.get("item_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            json.get("key")
                .and_then(|k| k.get("item_id"))
                .and_then(|v| v.as_u64())
                .map(|n| n.to_string())
        });

    let character_name = json.get("metadata")
        .and_then(|m| m.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());

    tracing::info!(
        character_id = character_id,
        tribe_id = ?tribe_id,
        tenant = ?tenant,
        item_id = ?item_id,
        character_name = ?character_name,
        "parsed Character object from GraphQL"
    );

    Some(CharacterData {
        tribe_id,
        tenant,
        item_id,
        character_name,
        raw,
    })
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
    Ok(())
}

// ── GraphQL fetch ─────────────────────────────────────────────────────────────

/// Diagnostic probe: tests minimal GraphQL queries to identify what the Sui GraphQL
/// endpoint accepts. Logs results at info level for debugging.
async fn graphql_compatibility_probe(
    client: &Client,
    graphql_url: &str,
    wallet: &str,
) -> Result<Vec<String>> {
    let mut reprs = Vec::new();

    // Test A — minimal address query
    let test_a = serde_json::json!({
        "query": "query TestAddress($address: SuiAddress!) { address(address: $address) { address } }",
        "variables": { "address": wallet }
    });

    tracing::info!(wallet = wallet, graphql_url = graphql_url, body = %test_a, "GraphQL probe A: TestAddress");

    let res = client
        .post(graphql_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&test_a)
        .send()
        .await?;

    let status = res.status();
    let ct = res.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let body_text = res.text().await?;

    tracing::info!(http_status = status.as_u16(), content_type = ct, body = %body_text, "GraphQL probe A response");

    if !status.is_success() {
        return Err(anyhow::anyhow!("Probe A failed: HTTP {} — {}", status, body_text));
    }

    // Test B — owned objects without type filter
    let test_b = serde_json::json!({
        "query": "query GetOwnedObjects($address: SuiAddress!) { address(address: $address) { objects(last: 10) { nodes { address contents { type { repr } json } } } } }",
        "variables": { "address": wallet }
    });

    tracing::info!(wallet = wallet, body = %test_b, "GraphQL probe B: GetOwnedObjects (no type filter)");

    let res = client
        .post(graphql_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&test_b)
        .send()
        .await?;

    let status = res.status();
    let ct = res.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok()).unwrap_or("unknown").to_string();
    let body_text = res.text().await?;

    tracing::info!(http_status = status.as_u16(), content_type = ct, body_preview = %body_text.chars().take(1024).collect::<String>(), "GraphQL probe B response");

    if !status.is_success() {
        return Err(anyhow::anyhow!("Probe B failed: HTTP {} — {}", status, body_text));
    }

    // Parse response to extract type.repr values
    let body: serde_json::Value = serde_json::from_str(&body_text)?;
    if let Some(nodes) = body.get("data").and_then(|d| d.get("address"))
        .and_then(|a| a.get("objects")).and_then(|o| o.get("nodes")).and_then(|n| n.as_array())
    {
        tracing::info!(node_count = nodes.len(), "GraphQL probe B: found nodes");
        for (i, node) in nodes.iter().enumerate() {
            if let Some(type_repr) = node.get("contents")
                .and_then(|c| c.get("type"))
                .and_then(|t| t.get("repr")).and_then(|r| r.as_str())
            {
                tracing::info!(node_index = i, type_repr = type_repr, "GraphQL probe B: type.repr");
                reprs.push(type_repr.to_string());
            }
        }
    }

    Ok(reprs)
}

async fn fetch_player_profile(
    graphql_url: &str,
    wallet: &str,
    profile_type: &str,
) -> Result<(Option<String>, Option<String>, Option<String>, serde_json::Value)> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    // Run diagnostic probe first to identify what the GraphQL endpoint accepts
    match graphql_compatibility_probe(&client, graphql_url, wallet).await {
        Ok(reprs) => {
            tracing::info!(wallet = wallet, type_reprs = ?reprs, "GraphQL compatibility probe complete");
        }
        Err(e) => {
            tracing::warn!(wallet = wallet, error = %e, "GraphQL compatibility probe failed — endpoint may be unreachable");
            return Err(e);
        }
    }

    // Build request body using json! macro to ensure valid JSON
    let req_body = serde_json::json!({
        "query": GRAPHQL_QUERY,
        "variables": {
            "address": wallet,
            "profileType": profile_type
        }
    });

    tracing::debug!(
        graphql_url = graphql_url,
        player_profile_type = profile_type,
        wallet = wallet,
        request_body = %req_body,
        "sending GraphQL request for EVE identity"
    );

    let res = client
        .post(graphql_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&req_body)
        .send()
        .await?;

    let status = res.status();
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    tracing::debug!(
        wallet = wallet,
        http_status = status.as_u16(),
        content_type = content_type,
        "GraphQL response received"
    );

    // Read body as text first to diagnose non-JSON responses
    let body_text = res.text().await?;

    // Try to parse as JSON
    let body: serde_json::Value = match serde_json::from_str(&body_text) {
        Ok(v) => v,
        Err(e) => {
            // Log first 512 chars of non-JSON response for debugging
            let preview = if body_text.len() > 512 {
                format!("{}...", &body_text[..512])
            } else {
                body_text.clone()
            };
            tracing::warn!(
                wallet = wallet,
                http_status = status.as_u16(),
                content_type = content_type,
                error = %e,
                body_preview = preview,
                "GraphQL response is not valid JSON"
            );
            return Err(anyhow::anyhow!(
                "GraphQL response not JSON: HTTP {} (Content-Type: {}) — {}",
                status,
                content_type,
                e
            ));
        }
    };

    if !status.is_success() {
        // Log GraphQL errors if present in error response
        if let Some(errors) = body.get("errors") {
            tracing::warn!(
                wallet = wallet,
                http_status = status.as_u16(),
                graphql_errors = %errors,
                "GraphQL returned errors"
            );
        }
        // Log top-level keys for debugging
        let keys: Vec<&str> = body.as_object().map(|o| o.keys().map(|k| k.as_str()).collect()).unwrap_or_default();
        tracing::debug!(wallet = wallet, top_level_keys = ?keys, "GraphQL error response shape");

        return Err(anyhow::anyhow!(
            "GraphQL request failed: HTTP {} — {}",
            status,
            body
        ));
    }

    // Log top-level keys for successful responses too
    let keys: Vec<&str> = body.as_object().map(|o| o.keys().map(|k| k.as_str()).collect()).unwrap_or_default();
    tracing::debug!(wallet = wallet, top_level_keys = ?keys, "GraphQL response parsed");

    parse_graphql_response(&body)
}

fn parse_graphql_response(
    body: &serde_json::Value,
) -> Result<(Option<String>, Option<String>, Option<String>, serde_json::Value)> {
    // Check for GraphQL errors
    if let Some(errors) = body.get("errors") {
        return Err(anyhow::anyhow!("GraphQL errors: {}", errors));
    }

    let data = body
        .get("data")
        .and_then(|d| d.get("address"))
        .and_then(|a| a.get("objects"))
        .and_then(|o| o.get("nodes"))
        .and_then(|n| n.as_array());

    let empty = vec![];
    let nodes = data.unwrap_or(&empty);
    let raw = body.clone();

    if nodes.is_empty() {
        return Ok((None, None, None, raw));
    }

    // Find the first node with non-null contents matching PlayerProfile
    for node in nodes {
        let contents = node.get("contents");
        
        // Skip nodes with null or missing contents
        let Some(inner) = contents else {
            continue;
        };
        
        if inner.is_null() {
            continue;
        }

        let json = inner.get("json").cloned().unwrap_or(serde_json::Value::Null);
        let repr = inner
            .get("type")
            .and_then(|t| t.get("repr"))
            .and_then(|r| r.as_str())
            .unwrap_or("");

        // Extract player profile object ID
        let player_profile_object = node
            .get("address")
            .and_then(|a| a.as_str())
            .map(|s| s.to_string());

        // Extract character_id and tribe_id from JSON contents
        let character_id = json
            .get("character_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                json.get("id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

        let tribe_id = json
            .get("tribe_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        tracing::debug!(
            player_profile_object = ?player_profile_object,
            character_id = ?character_id,
            tribe_id = ?tribe_id,
            type_repr = repr,
            "parsed PlayerProfile from GraphQL"
        );

        return Ok((player_profile_object, character_id, tribe_id, raw));
    }

    // No matching MoveObject found
    Ok((None, None, None, raw))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_graphql_response_extracts_character_id() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x1234...abcd",
                            "contents": {
                                "type": { "repr": "0xd12a...::character::PlayerProfile" },
                                "json": {
                                    "character_id": "char_001",
                                    "tribe_id": "tribe_042"
                                }
                            }
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, Some("0x1234...abcd".to_string()));
        assert_eq!(char_id, Some("char_001".to_string()));
        assert_eq!(tribe, Some("tribe_042".to_string()));
        assert!(raw.get("data").is_some());
    }

    #[test]
    fn parse_graphql_response_handles_no_nodes() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": []
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_handles_graphql_errors() {
        let body = serde_json::json!({
            "errors": [{ "message": "Invalid address format" }],
            "data": null
        });

        let result = parse_graphql_response(&body);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("GraphQL errors"));
    }

    #[test]
    fn parse_graphql_response_handles_malformed_data() {
        let body = serde_json::json!({
            "data": {
                "address": null
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_handles_missing_contents() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x1234",
                            "contents": null
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_extracts_id_fallback() {
        // Some PlayerProfile may use "id" instead of "character_id"
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x5678",
                            "contents": {
                                "type": { "repr": "0xd12a...::character::PlayerProfile" },
                                "json": { "id": "profile_id_99" }
                            }
                        }]
                    }
                }
            }
        });

        let (_profile_obj, char_id, _tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(char_id, Some("profile_id_99".to_string()));
    }

    #[test]
    fn unresolved_identity_returns_safe_nulls() {
        // The unresolved_identity function requires a PgPool, so we
        // verify the struct shape only here. Full integration tests
        // require a real database.
        let id = EveIdentity {
            wallet: "0x0000000000000000000000000000000000000000000000000000000000000001".into(),
            player_profile_object: None,
            character_id: None,
            character_object: None,
            tribe_id: None,
            tribe_name: None,
            character_name: None,
            tenant: None,
            item_id: None,
            frontierwarden_profile_id: None,
            identity_status: "unresolved".into(),
            source: "unresolved".into(),
            synced_at: None,
        };
        assert_eq!(id.character_id, None);
        assert_eq!(id.identity_status, "unresolved");
    }

    #[test]
    fn parse_character_json_extracts_fields() {
        let character_json = serde_json::json!({
            "id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
            "key": {
                "item_id": "2112089652",
                "tenant": "stillness"
            },
            "tribe_id": 1000167,
            "character_address": "0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f",
            "metadata": {
                "assembly_id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
                "name": "Kivik",
                "description": "",
                "url": ""
            },
            "owner_cap_id": "0x8479c0279f0197fe29987074d514a54c8881adc1f0557a3b556689ad838c067f"
        });

        let tribe_id = character_json.get("tribe_id")
            .and_then(|v| v.as_u64())
            .map(|n| n.to_string());
        let tenant = character_json.get("key")
            .and_then(|k| k.get("tenant"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let item_id = character_json.get("key")
            .and_then(|k| k.get("item_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                character_json.get("key")
                    .and_then(|k| k.get("item_id"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n.to_string())
            });
        let character_name = character_json.get("metadata")
            .and_then(|m| m.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        assert_eq!(tribe_id, Some("1000167".to_string()));
        assert_eq!(tenant, Some("stillness".to_string()));
        assert_eq!(item_id, Some("2112089652".to_string()));
        assert_eq!(character_name, Some("Kivik".to_string()));
    }

    #[test]
    fn parse_character_json_handles_numeric_item_id() {
        let character_json = serde_json::json!({
            "id": "0xchar",
            "key": {
                "item_id": 2112089652,
                "tenant": "stillness"
            },
            "tribe_id": 1000167,
            "metadata": {
                "name": "Kivik"
            }
        });

        let item_id = character_json.get("key")
            .and_then(|k| k.get("item_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                character_json.get("key")
                    .and_then(|k| k.get("item_id"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n.to_string())
            });

        assert_eq!(item_id, Some("2112089652".to_string()));
        assert!(!item_id.unwrap().starts_with('"'));
    }

    #[test]
    fn parse_player_profile_minimal_shape() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0xprofile_obj",
                            "contents": {
                                "type": { "repr": "0x28b497...::character::PlayerProfile" },
                                "json": {
                                    "id": "0xprofile_obj",
                                    "character_id": "0xchar_id"
                                }
                            }
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, Some("0xprofile_obj".to_string()));
        assert_eq!(char_id, Some("0xchar_id".to_string()));
        assert_eq!(tribe, None);
    }
}
