use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower::util::ServiceExt;

const POLICY_UNBOUND: &str = "0x0000000000000000000000000000000000000000000000000000000000beef01";
const POLICY_BOUND: &str = "0x0000000000000000000000000000000000000000000000000000000000beef02";
const POLICY_VERIFIED: &str = "0x0000000000000000000000000000000000000000000000000000000000beef03";
const POLICY_INACTIVE: &str = "0x0000000000000000000000000000000000000000000000000000000000beef04";
const POLICY_MISSING_WORLD: &str =
    "0x0000000000000000000000000000000000000000000000000000000000beef05";

const WORLD_BOUND: &str = "0x0000000000000000000000000000000000000000000000000000000000fade02";
const WORLD_VERIFIED: &str = "0x0000000000000000000000000000000000000000000000000000000000fade03";
const WORLD_INACTIVE: &str = "0x0000000000000000000000000000000000000000000000000000000000fade04";
const WORLD_MISSING: &str = "0x0000000000000000000000000000000000000000000000000000000000fade05";

#[tokio::test]
async fn binding_status_route_is_registered() -> anyhow::Result<()> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://example.invalid/db")?;
    let app = crate::api::router(pool, crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/gates/{POLICY_UNBOUND}/binding-status"))
                .body(Body::empty())?,
        )
        .await?;

    assert_ne!(response.status(), StatusCode::NOT_FOUND);
    Ok(())
}

#[tokio::test]
async fn gate_binding_status_reports_strict_states() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping binding status API test: EFREP_DATABASE_URL is not set");
        return Ok(());
    };

    cleanup(&pool).await?;
    seed(&pool).await?;

    assert_status(&pool, POLICY_UNBOUND, "unbound", false, None).await?;
    assert_status(&pool, POLICY_BOUND, "bound", true, Some(WORLD_BOUND)).await?;
    assert_status(&pool, POLICY_VERIFIED, "verified", true, Some(WORLD_VERIFIED)).await?;
    assert_status(&pool, POLICY_INACTIVE, "unbound", false, None).await?;
    assert_status(&pool, POLICY_MISSING_WORLD, "bound", true, Some(WORLD_MISSING)).await?;

    let missing_world = get_status(&pool, POLICY_MISSING_WORLD).await?;
    assert_eq!(missing_world["worldGateStatus"], Value::Null);
    assert_eq!(missing_world["linkedGateId"], Value::Null);

    cleanup(&pool).await?;
    Ok(())
}

async fn assert_status(
    pool: &PgPool,
    policy_id: &str,
    status: &str,
    active: bool,
    world_gate_id: Option<&str>,
) -> anyhow::Result<()> {
    let value = get_status(pool, policy_id).await?;
    assert_eq!(value["gatePolicyId"], policy_id);
    assert_eq!(value["bindingStatus"], status);
    assert_eq!(value["active"], active);
    match world_gate_id {
        Some(id) => assert_eq!(value["worldGateId"], id),
        None => assert_eq!(value["worldGateId"], Value::Null),
    }
    Ok(())
}

async fn get_status(pool: &PgPool, policy_id: &str) -> anyhow::Result<Value> {
    let app = crate::api::router(pool.clone(), crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/gates/{policy_id}/binding-status"))
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
    seed_world_gate(pool, WORLD_BOUND, "online", Some(WORLD_VERIFIED), false).await?;
    seed_world_gate(pool, WORLD_VERIFIED, "online", Some(WORLD_BOUND), true).await?;
    seed_world_gate(pool, WORLD_INACTIVE, "offline", None, true).await?;

    seed_binding(pool, POLICY_BOUND, WORLD_BOUND, true).await?;
    seed_binding(pool, POLICY_VERIFIED, WORLD_VERIFIED, true).await?;
    seed_binding(pool, POLICY_INACTIVE, WORLD_INACTIVE, false).await?;
    seed_binding(pool, POLICY_MISSING_WORLD, WORLD_MISSING, true).await?;

    seed_extension(pool, WORLD_VERIFIED, true).await?;
    Ok(())
}

async fn seed_world_gate(
    pool: &PgPool,
    gate_id: &str,
    status: &str,
    linked_gate_id: Option<&str>,
    fw_extension_active: bool,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gates
            (gate_id, item_id, tenant, linked_gate_id, status, fw_extension_active, checkpoint_updated)
         VALUES ($1, 1, 'stillness', $2, $3, $4, 100)
         ON CONFLICT (gate_id) DO UPDATE SET
            linked_gate_id = EXCLUDED.linked_gate_id,
            status = EXCLUDED.status,
            fw_extension_active = EXCLUDED.fw_extension_active",
    )
    .bind(gate_id)
    .bind(linked_gate_id)
    .bind(status)
    .bind(fw_extension_active)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_binding(
    pool: &PgPool,
    policy_id: &str,
    world_gate_id: &str,
    active: bool,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO gate_policy_world_bindings
            (gate_policy_id, world_gate_id, owner, active, bound_tx_digest, bound_event_seq, bound_checkpoint)
         VALUES ($1, $2, $3, $4, 'binding_status_test_tx', 1, 100)
         ON CONFLICT (gate_policy_id) DO UPDATE SET
            world_gate_id = EXCLUDED.world_gate_id,
            active = EXCLUDED.active,
            updated_at = NOW()",
    )
    .bind(policy_id)
    .bind(world_gate_id)
    .bind(POLICY_UNBOUND)
    .bind(active)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_extension(pool: &PgPool, world_gate_id: &str, active: bool) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_extensions
            (world_gate_id, item_id, tenant, extension_type, owner_cap_id, active)
         VALUES ($1, 1, 'stillness', '0xfeed::reputation_gate::FrontierWardenAuth', $2, $3)
         ON CONFLICT (world_gate_id) DO UPDATE SET
            extension_type = EXCLUDED.extension_type,
            active = EXCLUDED.active",
    )
    .bind(world_gate_id)
    .bind(POLICY_UNBOUND)
    .bind(active)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "DELETE FROM gate_policy_world_bindings
         WHERE gate_policy_id IN ($1, $2, $3, $4, $5)",
    )
    .bind(POLICY_UNBOUND)
    .bind(POLICY_BOUND)
    .bind(POLICY_VERIFIED)
    .bind(POLICY_INACTIVE)
    .bind(POLICY_MISSING_WORLD)
    .execute(pool)
    .await?;
    sqlx::query(
        "DELETE FROM world_gate_extensions
         WHERE world_gate_id IN ($1, $2, $3, $4)",
    )
    .bind(WORLD_BOUND)
    .bind(WORLD_VERIFIED)
    .bind(WORLD_INACTIVE)
    .bind(WORLD_MISSING)
    .execute(pool)
    .await?;
    sqlx::query("DELETE FROM world_gates WHERE gate_id IN ($1, $2, $3)")
        .bind(WORLD_BOUND)
        .bind(WORLD_VERIFIED)
        .bind(WORLD_INACTIVE)
        .execute(pool)
        .await?;
    Ok(())
}
