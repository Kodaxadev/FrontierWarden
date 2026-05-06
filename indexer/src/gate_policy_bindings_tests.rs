use anyhow::Result;
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::gate_policy_bindings::{
    handle, parse_gate_policy_binding_event, BindingEvent, GatePolicyBound, GatePolicyUnbound,
};
use crate::rpc::{EventId, SuiEvent};
use crate::trust_db::world_gate_for_policy;

#[test]
fn parses_bound_event() {
    let ev = event(
        "GatePolicyBoundToWorldGate",
        json!({
            "gate_policy_id": "0xabc",
            "world_gate_id": { "bytes": "0xdef" },
            "owner": "0x123",
            "epoch": "1084"
        }),
    );

    let parsed = parse_gate_policy_binding_event(&ev).unwrap();

    assert_eq!(
        parsed,
        Some(BindingEvent::Bound(GatePolicyBound {
            gate_policy_id: padded("abc"),
            world_gate_id: padded("def"),
            owner: padded("123"),
            epoch: 1084,
        }))
    );
}

#[test]
fn parses_unbound_event() {
    let ev = event(
        "GatePolicyUnboundFromWorldGate",
        json!({
            "gate_policy_id": { "bytes": "0xabc" },
            "world_gate_id": "0xdef",
            "owner": "0x123",
            "epoch": 1085
        }),
    );

    let parsed = parse_gate_policy_binding_event(&ev).unwrap();

    assert_eq!(
        parsed,
        Some(BindingEvent::Unbound(GatePolicyUnbound {
            gate_policy_id: padded("abc"),
            world_gate_id: padded("def"),
            owner: padded("123"),
            epoch: 1085,
        }))
    );
}

#[tokio::test]
async fn bound_event_creates_active_row() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_policy_id = padded("a100");
    let world_gate_id = padded("b100");
    seed_world_gate(&pool, &world_gate_id, "offline", None).await?;

    let ev = binding_event(
        "GatePolicyBoundToWorldGate",
        &gate_policy_id,
        &world_gate_id,
    );
    handle(&pool, &ev).await?;

    let active: bool = sqlx::query_scalar(
        "SELECT active FROM gate_policy_world_bindings WHERE gate_policy_id = $1",
    )
    .bind(&gate_policy_id)
    .fetch_one(&pool)
    .await?;
    cleanup(&pool, &gate_policy_id, &world_gate_id).await?;
    assert!(active);
    Ok(())
}

#[tokio::test]
async fn unbound_event_marks_inactive() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_policy_id = padded("a101");
    let world_gate_id = padded("b101");
    seed_world_gate(&pool, &world_gate_id, "online", Some(&padded("b102"))).await?;

    handle(
        &pool,
        &binding_event(
            "GatePolicyBoundToWorldGate",
            &gate_policy_id,
            &world_gate_id,
        ),
    )
    .await?;
    handle(
        &pool,
        &binding_event(
            "GatePolicyUnboundFromWorldGate",
            &gate_policy_id,
            &world_gate_id,
        ),
    )
    .await?;

    let active: bool = sqlx::query_scalar(
        "SELECT active FROM gate_policy_world_bindings WHERE gate_policy_id = $1",
    )
    .bind(&gate_policy_id)
    .fetch_one(&pool)
    .await?;
    cleanup(&pool, &gate_policy_id, &world_gate_id).await?;
    assert!(!active);
    Ok(())
}

#[tokio::test]
async fn world_gate_for_policy_returns_only_active_binding() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_policy_id = padded("a102");
    let world_gate_id = padded("b103");
    let linked_gate_id = padded("b104");
    seed_world_gate(&pool, &world_gate_id, "offline", Some(&linked_gate_id)).await?;
    handle(
        &pool,
        &binding_event(
            "GatePolicyBoundToWorldGate",
            &gate_policy_id,
            &world_gate_id,
        ),
    )
    .await?;

    let projection = world_gate_for_policy(&pool, &gate_policy_id).await?;

    cleanup(&pool, &gate_policy_id, &world_gate_id).await?;
    assert_eq!(projection.unwrap().status, "offline");
    Ok(())
}

#[tokio::test]
async fn world_gate_for_policy_ignores_missing_and_inactive_bindings() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_policy_id = padded("a103");
    let world_gate_id = padded("b105");
    seed_world_gate(&pool, &world_gate_id, "online", None).await?;

    assert!(world_gate_for_policy(&pool, &gate_policy_id)
        .await?
        .is_none());
    handle(
        &pool,
        &binding_event(
            "GatePolicyBoundToWorldGate",
            &gate_policy_id,
            &world_gate_id,
        ),
    )
    .await?;
    handle(
        &pool,
        &binding_event(
            "GatePolicyUnboundFromWorldGate",
            &gate_policy_id,
            &world_gate_id,
        ),
    )
    .await?;

    let projection = world_gate_for_policy(&pool, &gate_policy_id).await?;

    cleanup(&pool, &gate_policy_id, &world_gate_id).await?;
    assert!(projection.is_none());
    Ok(())
}

fn event(name: &str, parsed_json: serde_json::Value) -> SuiEvent {
    SuiEvent {
        id: EventId {
            tx_digest: format!("test_{name}"),
            event_seq: "0".to_string(),
        },
        package_id: "0x5a2c".to_string(),
        transaction_module: "reputation_gate".to_string(),
        sender: None,
        type_: format!("0x5a2c::reputation_gate::{name}"),
        parsed_json,
        timestamp_ms: None,
        checkpoint: Some("331269067".to_string()),
    }
}

fn binding_event(name: &str, gate_policy_id: &str, world_gate_id: &str) -> SuiEvent {
    event(
        name,
        json!({
            "gate_policy_id": gate_policy_id,
            "world_gate_id": world_gate_id,
            "owner": padded("c001"),
            "epoch": "1084"
        }),
    )
}

fn padded(short: &str) -> String {
    format!("0x{:0>64}", short.trim_start_matches("0x"))
}

async fn test_pool() -> Result<Option<PgPool>> {
    let Ok(url) = std::env::var("EFREP_DATABASE_URL") else {
        return Ok(None);
    };
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await?;
    let exists: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public.gate_policy_world_bindings')::text")
            .fetch_one(&pool)
            .await?;
    Ok(exists.map(|_| pool))
}

async fn seed_world_gate(
    pool: &PgPool,
    gate_id: &str,
    status: &str,
    linked_gate_id: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gates
            (gate_id, item_id, tenant, linked_gate_id, status, checkpoint_updated)
         VALUES ($1, 9001, 'stillness', $2, $3, 42)
         ON CONFLICT (gate_id) DO UPDATE SET
            linked_gate_id = EXCLUDED.linked_gate_id,
            status = EXCLUDED.status",
    )
    .bind(gate_id)
    .bind(linked_gate_id)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup(pool: &PgPool, gate_policy_id: &str, world_gate_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM gate_policy_world_bindings WHERE gate_policy_id = $1")
        .bind(gate_policy_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM world_gates WHERE gate_id = $1")
        .bind(world_gate_id)
        .execute(pool)
        .await?;
    Ok(())
}
