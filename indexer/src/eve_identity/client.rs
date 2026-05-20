use anyhow::Result;
use reqwest::Client;

use super::probe::graphql_compatibility_probe;
use super::types::{CharacterData, CHARACTER_GRAPHQL_QUERY, GRAPHQL_QUERY};

/// Fetch and parse a Character object from Sui GraphQL.
/// Returns CharacterData or None if the lookup fails (non-fatal).
pub(crate) async fn fetch_character_object(
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

    if let Some(errors) = body.get("errors") {
        tracing::warn!(
            character_id = character_id,
            graphql_errors = %errors,
            "GraphQL errors during Character lookup"
        );
        return None;
    }

    let contents = body
        .get("data")
        .and_then(|d| d.get("object"))
        .and_then(|o| o.get("asMoveObject"))
        .and_then(|m| m.get("contents"));

    let Some(inner) = contents else {
        tracing::warn!(
            character_id = character_id,
            "Character object has no contents"
        );
        return None;
    };

    let json = inner.get("json").cloned()?;
    let raw = body.clone();

    let tribe_id = json
        .get("tribe_id")
        .and_then(|v| v.as_u64())
        .map(|n| n.to_string())
        .or_else(|| {
            json.get("tribe_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        });

    let tenant = json
        .get("key")
        .and_then(|k| k.get("tenant"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let item_id = json
        .get("key")
        .and_then(|k| k.get("item_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            json.get("key")
                .and_then(|k| k.get("item_id"))
                .and_then(|v| v.as_u64())
                .map(|n| n.to_string())
        });

    let character_name = json
        .get("metadata")
        .and_then(|m| m.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());

    tracing::debug!(
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

pub(crate) async fn fetch_player_profile(
    graphql_url: &str,
    wallet: &str,
    profile_type: &str,
) -> Result<(
    Option<String>,
    Option<String>,
    Option<String>,
    serde_json::Value,
)> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    match graphql_compatibility_probe(&client, graphql_url, wallet).await {
        Ok(reprs) => {
            tracing::debug!(wallet = wallet, type_reprs = ?reprs, "GraphQL compatibility probe complete");
        }
        Err(e) => {
            tracing::warn!(wallet = wallet, error = %e, "GraphQL compatibility probe failed — endpoint may be unreachable");
            return Err(e);
        }
    }

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

    let body_text = res.text().await?;

    let body: serde_json::Value = match serde_json::from_str(&body_text) {
        Ok(v) => v,
        Err(e) => {
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
                "GraphQL response not JSON: HTTP {status} (Content-Type: {content_type}) — {e}"
            ));
        }
    };

    if !status.is_success() {
        if let Some(errors) = body.get("errors") {
            tracing::warn!(
                wallet = wallet,
                http_status = status.as_u16(),
                graphql_errors = %errors,
                "GraphQL returned errors"
            );
        }
        let keys: Vec<&str> = body
            .as_object()
            .map(|o| o.keys().map(|k| k.as_str()).collect())
            .unwrap_or_default();
        tracing::debug!(wallet = wallet, top_level_keys = ?keys, "GraphQL error response shape");

        return Err(anyhow::anyhow!(
            "GraphQL request failed: HTTP {status} — {body}"
        ));
    }

    let keys: Vec<&str> = body
        .as_object()
        .map(|o| o.keys().map(|k| k.as_str()).collect())
        .unwrap_or_default();
    tracing::debug!(wallet = wallet, top_level_keys = ?keys, "GraphQL response parsed");

    super::parser::parse_graphql_response(&body)
}
