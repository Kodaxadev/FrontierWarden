use anyhow::Result;
use reqwest::Client;

/// Diagnostic probe: tests minimal GraphQL queries to identify what the Sui GraphQL
/// endpoint accepts. Logs at debug/trace; enable with RUST_LOG=eve_identity=debug.
pub(super) async fn graphql_compatibility_probe(
    client: &Client,
    graphql_url: &str,
    wallet: &str,
) -> Result<Vec<String>> {
    let mut reprs = Vec::new();

    let test_a = serde_json::json!({
        "query": "query TestAddress($address: SuiAddress!) { address(address: $address) { address } }",
        "variables": { "address": wallet }
    });

    tracing::debug!(wallet = wallet, graphql_url = graphql_url, "GraphQL probe A: TestAddress");

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

    tracing::debug!(http_status = status.as_u16(), content_type = ct, "GraphQL probe A response");
    tracing::trace!(body = %body_text, "GraphQL probe A response body");

    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Probe A failed: HTTP {status} — {body_text}"
        ));
    }

    let test_b = serde_json::json!({
        "query": "query GetOwnedObjects($address: SuiAddress!) { address(address: $address) { objects(last: 10) { nodes { address contents { type { repr } json } } } } }",
        "variables": { "address": wallet }
    });

    tracing::debug!(wallet = wallet, "GraphQL probe B: GetOwnedObjects (no type filter)");

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

    tracing::debug!(http_status = status.as_u16(), content_type = ct, "GraphQL probe B response");
    tracing::trace!(body_preview = %body_text.chars().take(1024).collect::<String>(), "GraphQL probe B response body");

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
        tracing::debug!(node_count = nodes.len(), "GraphQL probe B: found nodes");
        for (i, node) in nodes.iter().enumerate() {
            if let Some(type_repr) = node
                .get("contents")
                .and_then(|c| c.get("type"))
                .and_then(|t| t.get("repr"))
                .and_then(|r| r.as_str())
            {
                tracing::debug!(
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
