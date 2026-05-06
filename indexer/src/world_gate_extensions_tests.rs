use anyhow::Result;
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::rpc::{EventId, SuiEvent};
use crate::world_gate_extensions::{
    handle, is_frontierwarden_typename, parse_gate_extension_event, GateExtensionEvent,
};

const FW_TYPE: &str = "0xfd1b::reputation_gate::FrontierWardenAuth";
const OTHER_TYPE: &str = "0x1111::other_gate::OtherAuth";

#[test]
fn parses_authorized_event() {
    let ev = event(
        "ExtensionAuthorizedEvent",
        json!({
            "assembly_id": "0xabc",
            "assembly_key": { "item_id": "1000001", "tenant": "stillness" },
            "extension_type": FW_TYPE,
            "previous_extension": null,
            "owner_cap_id": "0xdef"
        }),
    );
    let parsed = parse_gate_extension_event(&ev).unwrap();

    match parsed {
        Some(GateExtensionEvent::Authorized(auth)) => {
            assert_eq!(auth.world_gate_id, padded("abc"));
            assert_eq!(auth.assembly_key.item_id, 1_000_001);
            assert_eq!(auth.assembly_key.tenant, "stillness");
            assert_eq!(auth.extension_type, FW_TYPE);
            assert_eq!(auth.previous_extension, None);
            assert_eq!(auth.owner_cap_id, padded("def"));
        }
        other => panic!("unexpected parse result: {other:?}"),
    }
}

#[test]
fn parses_revoked_event() {
    let ev = event(
        "ExtensionRevokedEvent",
        json!({
            "assembly_id": "0xabc",
            "assembly_key": { "item_id": 1000001, "tenant": "stillness" },
            "revoked_extension": { "name": FW_TYPE },
            "owner_cap_id": "0xdef"
        }),
    );
    let parsed = parse_gate_extension_event(&ev).unwrap();

    match parsed {
        Some(GateExtensionEvent::Revoked(revoked)) => {
            assert_eq!(revoked.world_gate_id, padded("abc"));
            assert_eq!(revoked.revoked_extension, FW_TYPE);
            assert_eq!(revoked.owner_cap_id, padded("def"));
        }
        other => panic!("unexpected parse result: {other:?}"),
    }
}

#[test]
fn typename_exact_match_true() {
    assert!(is_frontierwarden_typename(FW_TYPE, FW_TYPE));
}

#[test]
fn typename_mismatch_false() {
    assert!(!is_frontierwarden_typename(OTHER_TYPE, FW_TYPE));
    assert!(!is_frontierwarden_typename(FW_TYPE, ""));
}

#[tokio::test]
async fn authorization_updates_extension_active_state() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_id = padded("57a150");
    seed_world_gate(&pool, &gate_id).await?;

    let ev = event(
        "ExtensionAuthorizedEvent",
        json!({
            "assembly_id": gate_id,
            "assembly_key": { "item_id": "9001", "tenant": "stillness" },
            "extension_type": FW_TYPE,
            "previous_extension": null,
            "owner_cap_id": padded("57a151")
        }),
    );
    handle(&pool, &ev, FW_TYPE).await?;

    let active: bool =
        sqlx::query_scalar("SELECT fw_extension_active FROM world_gates WHERE gate_id = $1")
            .bind(&gate_id)
            .fetch_one(&pool)
            .await?;
    cleanup(&pool, &gate_id).await?;
    assert!(active);
    Ok(())
}

#[tokio::test]
async fn revocation_clears_active_state() -> Result<()> {
    let Some(pool) = test_pool().await? else {
        return Ok(());
    };
    let gate_id = padded("57a152");
    seed_world_gate(&pool, &gate_id).await?;

    let auth = event(
        "ExtensionAuthorizedEvent",
        json!({
            "assembly_id": gate_id,
            "assembly_key": { "item_id": "9002", "tenant": "stillness" },
            "extension_type": FW_TYPE,
            "previous_extension": null,
            "owner_cap_id": padded("57a153")
        }),
    );
    handle(&pool, &auth, FW_TYPE).await?;

    let revoked = event(
        "ExtensionRevokedEvent",
        json!({
            "assembly_id": gate_id,
            "assembly_key": { "item_id": "9002", "tenant": "stillness" },
            "revoked_extension": FW_TYPE,
            "owner_cap_id": padded("57a153")
        }),
    );
    handle(&pool, &revoked, FW_TYPE).await?;

    let active: bool =
        sqlx::query_scalar("SELECT fw_extension_active FROM world_gates WHERE gate_id = $1")
            .bind(&gate_id)
            .fetch_one(&pool)
            .await?;
    cleanup(&pool, &gate_id).await?;
    assert!(!active);
    Ok(())
}

fn event(name: &str, parsed_json: serde_json::Value) -> SuiEvent {
    SuiEvent {
        id: EventId {
            tx_digest: format!("test_{name}"),
            event_seq: "0".to_string(),
        },
        package_id: "0x28b497".to_string(),
        transaction_module: "gate".to_string(),
        sender: None,
        type_: format!("0x28b497::gate::{name}"),
        parsed_json,
        timestamp_ms: None,
        checkpoint: Some("42".to_string()),
    }
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
        sqlx::query_scalar("SELECT to_regclass('public.world_gate_extensions')::text")
            .fetch_one(&pool)
            .await?;
    Ok(exists.map(|_| pool))
}

async fn seed_world_gate(pool: &PgPool, gate_id: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gates
            (gate_id, item_id, tenant, status, fw_extension_active, checkpoint_updated)
         VALUES ($1, 9001, 'stillness', 'online', FALSE, 42)
         ON CONFLICT (gate_id) DO UPDATE SET fw_extension_active = FALSE",
    )
    .bind(gate_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup(pool: &PgPool, gate_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM world_gate_extensions WHERE world_gate_id = $1")
        .bind(gate_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM world_gates WHERE gate_id = $1")
        .bind(gate_id)
        .execute(pool)
        .await?;
    Ok(())
}
