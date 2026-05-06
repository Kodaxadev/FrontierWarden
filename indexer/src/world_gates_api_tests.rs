use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower::util::ServiceExt;

const WORLD_STILLNESS_A: &str =
    "0x00000000000000000000000000000000000000000000000000000000cafe0001";
const WORLD_STILLNESS_B: &str =
    "0x00000000000000000000000000000000000000000000000000000000cafe0002";
const WORLD_OTHER_TENANT: &str =
    "0x00000000000000000000000000000000000000000000000000000000cafe0003";

#[tokio::test]
async fn world_gates_route_is_registered() -> anyhow::Result<()> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://example.invalid/db")?;
    let app = crate::api::router(pool, crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/world/gates")
                .body(Body::empty())?,
        )
        .await?;

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
    Ok(())
}

#[tokio::test]
async fn world_gates_api_filters_tenant_and_excludes_gate_policy_fields() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping world gates API test: EFREP_DATABASE_URL is not set");
        return Ok(());
    };

    cleanup(&pool).await?;
    seed(&pool).await?;

    let default = get_world_gates(&pool, "/world/gates").await?;
    assert_eq!(default["tenant"], "stillness");
    assert_eq!(default["count"], 2);
    assert_eq!(default["gates"].as_array().unwrap().len(), 2);

    let first = &default["gates"][0];
    assert!(first.get("worldGateId").is_some());
    assert!(first.get("itemId").is_some());
    assert!(first.get("checkpointUpdated").is_some());
    assert!(first.get("fwExtensionActive").is_some());
    assert!(first.get("ally_threshold").is_none());
    assert!(first.get("base_toll_mist").is_none());
    assert!(first.get("passages_24h").is_none());

    let explicit = get_world_gates(&pool, "/world/gates?tenant=other").await?;
    assert_eq!(explicit["tenant"], "other");
    assert_eq!(explicit["count"], 1);
    assert_eq!(explicit["gates"][0]["worldGateId"], WORLD_OTHER_TENANT);

    let empty = get_world_gates(&pool, "/world/gates?tenant=empty").await?;
    assert_eq!(empty["tenant"], "empty");
    assert_eq!(empty["count"], 0);
    assert_eq!(empty["gates"], Value::Array(vec![]));

    cleanup(&pool).await?;
    Ok(())
}

async fn get_world_gates(pool: &PgPool, uri: &str) -> anyhow::Result<Value> {
    let app = crate::api::router(pool.clone(), crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .body(Body::empty())?,
        )
        .await?;

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

async fn test_pool() -> anyhow::Result<Option<PgPool>> {
    let Ok(url) = std::env::var("EFREP_DATABASE_URL") else {
        return Ok(None);
    };
    Ok(Some(PgPool::connect(&url).await?))
}

async fn seed(pool: &PgPool) -> anyhow::Result<()> {
    seed_world_gate(
        pool,
        SeedWorldGate {
            gate_id: WORLD_STILLNESS_A,
            item_id: 2,
            tenant: "stillness",
            status: "offline",
            linked_gate_id: None,
            fw_extension_active: false,
            checkpoint_updated: 20,
        },
    )
    .await?;
    seed_world_gate(
        pool,
        SeedWorldGate {
            gate_id: WORLD_STILLNESS_B,
            item_id: 1,
            tenant: "stillness",
            status: "online",
            linked_gate_id: Some(WORLD_STILLNESS_A),
            fw_extension_active: true,
            checkpoint_updated: 30,
        },
    )
    .await?;
    seed_world_gate(
        pool,
        SeedWorldGate {
            gate_id: WORLD_OTHER_TENANT,
            item_id: 3,
            tenant: "other",
            status: "online",
            linked_gate_id: None,
            fw_extension_active: false,
            checkpoint_updated: 10,
        },
    )
    .await?;
    Ok(())
}

struct SeedWorldGate<'a> {
    gate_id: &'a str,
    item_id: i64,
    tenant: &'a str,
    status: &'a str,
    linked_gate_id: Option<&'a str>,
    fw_extension_active: bool,
    checkpoint_updated: i64,
}

async fn seed_world_gate(pool: &PgPool, gate: SeedWorldGate<'_>) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gates
            (gate_id, item_id, tenant, linked_gate_id, status, fw_extension_active, checkpoint_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (gate_id) DO UPDATE SET
            item_id = EXCLUDED.item_id,
            tenant = EXCLUDED.tenant,
            linked_gate_id = EXCLUDED.linked_gate_id,
            status = EXCLUDED.status,
            fw_extension_active = EXCLUDED.fw_extension_active,
            checkpoint_updated = EXCLUDED.checkpoint_updated,
            updated_at = NOW()",
    )
    .bind(gate.gate_id)
    .bind(gate.item_id)
    .bind(gate.tenant)
    .bind(gate.linked_gate_id)
    .bind(gate.status)
    .bind(gate.fw_extension_active)
    .bind(gate.checkpoint_updated)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM world_gates WHERE gate_id IN ($1, $2, $3)")
        .bind(WORLD_STILLNESS_A)
        .bind(WORLD_STILLNESS_B)
        .bind(WORLD_OTHER_TENANT)
        .execute(pool)
        .await?;
    Ok(())
}
