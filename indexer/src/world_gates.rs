use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;
use sqlx::{PgPool, QueryBuilder};

pub use crate::world_gates_parser::{
    is_frontierwarden_extension, parse_gate_node, parse_item_id, parse_tenant_item_id,
    TenantItemId, WorldGateExtension, WorldGateRow,
};

const GATE_OBJECTS_QUERY: &str = r#"
query WorldGates($gateType: String!, $cursor: String) {
  objects(first: 50, after: $cursor, filter: { type: $gateType }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      address
      version
      digest
      asMoveObject { contents { json type { repr } } }
    }
  }
}
"#;

pub struct WorldGateSyncConfig<'a> {
    pub graphql_url: &'a str,
    pub world_pkg_original_id: &'a str,
    pub world_pkg_published_at: &'a str,
    pub tenant: &'a str,
    pub efrep_package_id: &'a str,
    pub fw_module_name: &'a str,
    pub fw_auth_witness: &'a str,
}

#[derive(Deserialize)]
struct GraphQlResponse {
    data: Option<GraphQlData>,
    errors: Option<Value>,
}

#[derive(Deserialize)]
struct GraphQlData {
    objects: GraphQlObjects,
}

#[derive(Deserialize)]
struct GraphQlObjects {
    nodes: Vec<Value>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
}

#[derive(Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

pub async fn sync_world_gates(pool: &PgPool, cfg: &WorldGateSyncConfig<'_>) -> Result<usize> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    let gate_type = format!("{}::gate::Gate", cfg.world_pkg_original_id);
    let mut cursor: Option<String> = None;
    let mut total = 0usize;

    loop {
        let body = serde_json::json!({
            "query": GATE_OBJECTS_QUERY,
            "variables": { "gateType": gate_type, "cursor": cursor }
        });
        let res = client
            .post(cfg.graphql_url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("world gate GraphQL request failed")?;
        let status = res.status();
        let text = res.text().await?;
        if !status.is_success() {
            anyhow::bail!("world gate GraphQL HTTP {status}: {text}");
        }

        let parsed: GraphQlResponse =
            serde_json::from_str(&text).context("world gate GraphQL response decode failed")?;
        if let Some(errors) = parsed.errors {
            anyhow::bail!("world gate GraphQL errors: {errors}");
        }
        let data = parsed.data.context("world gate GraphQL missing data")?;

        let mut rows = Vec::new();
        for node in data.objects.nodes {
            let row = parse_gate_node(
                &node,
                cfg.efrep_package_id,
                cfg.fw_module_name,
                cfg.fw_auth_witness,
            )?;
            if row.tenant.eq_ignore_ascii_case(cfg.tenant) {
                rows.push(row);
            }
        }
        let count = rows.len();
        upsert_world_gates(pool, rows).await?;
        total += count;

        if !data.objects.page_info.has_next_page {
            break;
        }
        cursor = data.objects.page_info.end_cursor;
        if cursor.is_none() {
            break;
        }
    }

    record_sync_state(
        pool,
        "world_gates_last_sync",
        &chrono::Utc::now().to_rfc3339(),
    )
    .await?;
    Ok(total)
}

pub async fn upsert_world_gates(pool: &PgPool, rows: Vec<WorldGateRow>) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }

    let mut qb = QueryBuilder::new(
        "INSERT INTO world_gates (
            gate_id, item_id, tenant, owner_character_id, owner_address,
            solar_system_id, linked_gate_id, status, fw_extension_active,
            fw_gate_policy_id, checkpoint_updated, updated_at
        ) VALUES",
    );
    for (i, row) in rows.iter().enumerate() {
        if i > 0 {
            qb.push(",");
        }
        qb.push(" (")
            .push_bind(&row.gate_id)
            .push(",")
            .push_bind(row.item_id)
            .push(",")
            .push_bind(&row.tenant)
            .push(",")
            .push_bind(&row.owner_character_id)
            .push(",")
            .push_bind(&row.owner_address)
            .push(",")
            .push_bind(&row.solar_system_id)
            .push(",")
            .push_bind(&row.linked_gate_id)
            .push(",")
            .push_bind(&row.status)
            .push(",")
            .push_bind(row.fw_extension_active)
            .push(",")
            .push_bind(&row.fw_gate_policy_id)
            .push(",")
            .push_bind(row.checkpoint_updated)
            .push(", NOW())");
    }
    qb.push(
        " ON CONFLICT (gate_id) DO UPDATE SET
          item_id = EXCLUDED.item_id,
          tenant = EXCLUDED.tenant,
          owner_character_id = EXCLUDED.owner_character_id,
          owner_address = EXCLUDED.owner_address,
          solar_system_id = EXCLUDED.solar_system_id,
          linked_gate_id = EXCLUDED.linked_gate_id,
          status = EXCLUDED.status,
          fw_extension_active = EXCLUDED.fw_extension_active,
          fw_gate_policy_id = EXCLUDED.fw_gate_policy_id,
          checkpoint_updated = EXCLUDED.checkpoint_updated,
          updated_at = NOW()",
    );
    qb.build().execute(pool).await?;
    Ok(())
}

async fn record_sync_state(pool: &PgPool, key: &str, value: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO eve_world_sync_state (key, value, synced_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, synced_at = NOW()",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
