use anyhow::Result;
use reqwest::Client;

use super::types::{CharacterData, CHARACTER_GRAPHQL_QUERY, GRAPHQL_QUERY};

// Dead-code typed structs preserved for documentation / future typed deserialization.
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

/// Diagnostic probe: tests minimal GraphQL queries to identify what the Sui GraphQL
/// endpoint accepts. Logs results at info level for debugging.
async fn graphql_compatibility_probe(
    client: &Client,
    graphql_url: &str,
    wallet: &str,
) -> Result<Vec<String>> {
    let mut reprs = Vec::new();

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
    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let body_text = res.text().await?;

    tracing::info!(http_status = status.as_u16(), content_type = ct, body = %body_text, "GraphQL probe A response");

    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Probe A failed: HTTP {status} — {body_text}"
        ));
    }

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
    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let body_text = res.text().await?;

    tracing::info!(http_status = status.as_u16(), content_type = ct, body_preview = %body_text.chars().take(1024).collect::<String>(), "GraphQL probe B response");

    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Probe B failed: HTTP {status} — {body_text}"
        ));
    }

    let body: serde_json::Value = serde_json::from_str(&body_text)?;
    if let Some(nodes) = body
        .get("data")
        .and_then(|d| d.get("address"))
        .and_then(|a| a.get("objects"))
        .and_then(|o| o.get("nodes"))
        .and_then(|n| n.as_array())
    {
        tracing::info!(node_count = nodes.len(), "GraphQL probe B: found nodes");
        for (i, node) in nodes.iter().enumerate() {
            if let Some(type_repr) = node
                .get("contents")
                .and_then(|c| c.get("type"))
                .and_then(|t| t.get("repr"))
                .and_then(|r| r.as_str())
            {
                tracing::info!(
                    node_index = i,
                    type_repr = type_repr,
                    "GraphQL probe B: type.repr"
                );
                reprs.push(type_repr.to_string());
            }
        }
    }

    Ok(reprs)
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
            tracing::info!(wallet = wallet, type_reprs = ?reprs, "GraphQL compatibility probe complete");
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
