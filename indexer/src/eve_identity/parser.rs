use anyhow::Result;

/// (player_profile_object, character_id, tribe_id, raw_body)
type GraphqlResult = (
    Option<String>,
    Option<String>,
    Option<String>,
    serde_json::Value,
);

pub(crate) fn parse_graphql_response(body: &serde_json::Value) -> Result<GraphqlResult> {
    if let Some(errors) = body.get("errors") {
        return Err(anyhow::anyhow!("GraphQL errors: {errors}"));
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

    for node in nodes {
        let contents = node.get("contents");

        let Some(inner) = contents else {
            continue;
        };

        if inner.is_null() {
            continue;
        }

        let json = inner
            .get("json")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let repr = inner
            .get("type")
            .and_then(|t| t.get("repr"))
            .and_then(|r| r.as_str())
            .unwrap_or("");

        let player_profile_object = node
            .get("address")
            .and_then(|a| a.as_str())
            .map(|s| s.to_string());

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

    Ok((None, None, None, raw))
}
