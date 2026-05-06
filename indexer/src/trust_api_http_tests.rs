use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tower::util::ServiceExt;

const SCHEMA_ID: &str = "HTTP_TRUST";
const GATE_ID: &str = "0x0000000000000000000000000000000000000000000000000000000000f00d01";
const GATE_OFFLINE_ID: &str = "0x0000000000000000000000000000000000000000000000000000000000f00d02";
const MISSING_GATE_ID: &str = "0x0000000000000000000000000000000000000000000000000000000000bad001";
const SUBJECT_FREE: &str = "0x0000000000000000000000000000000000000000000000000000000000aa0001";
const SUBJECT_TAXED: &str = "0x0000000000000000000000000000000000000000000000000000000000aa0002";
const SUBJECT_ZERO: &str = "0x0000000000000000000000000000000000000000000000000000000000aa0003";
const SUBJECT_NONE: &str = "0x0000000000000000000000000000000000000000000000000000000000aa0004";

#[tokio::test]
async fn trust_http_routes_return_stable_reason_codes() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping trust HTTP test: EFREP_DATABASE_URL is not set");
        return Ok(());
    };

    cleanup(&pool).await?;
    seed(&pool).await?;

    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        GATE_ID,
        "gate_access",
        "ALLOW_FREE",
        "ALLOW_FREE",
    )
    .await?;
    let free = post_eval(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        GATE_ID,
        "gate_access",
    )
    .await?;
    assert_eq!(free["apiVersion"], "trust.v1");
    assert_eq!(free["action"], "gate_access");
    assert_warning_prefix(&free, "PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:");
    assert_no_warning_prefix(&free, "WARN_WORLD_GATE_");
    let offline = post_eval(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        GATE_OFFLINE_ID,
        "gate_access",
    )
    .await?;
    assert_eq!(offline["decision"], "ALLOW_FREE");
    assert_warning_prefix(&offline, "WARN_WORLD_GATE_OFFLINE:");
    assert_warning_prefix(&offline, "WARN_WORLD_GATE_NOT_LINKED:");
    assert_reason(
        &pool,
        "/v1/cradleos/gate/evaluate",
        SUBJECT_TAXED,
        GATE_ID,
        "gate_access",
        "ALLOW_TAXED",
        "ALLOW_TAXED",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/explain",
        SUBJECT_NONE,
        GATE_ID,
        "gate_access",
        "DENY",
        "DENY_NO_STANDING_ATTESTATION",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_ZERO,
        GATE_ID,
        "gate_access",
        "DENY",
        "DENY_SCORE_BELOW_THRESHOLD",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        MISSING_GATE_ID,
        "gate_access",
        "INSUFFICIENT_DATA",
        "ERROR_GATE_NOT_FOUND",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        "",
        "counterparty_risk",
        "ALLOW",
        "COUNTERPARTY_REQUIREMENTS_MET",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        "",
        "bounty_trust",
        "ALLOW",
        "BOUNTY_TRUST_REQUIREMENTS_MET",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_TAXED,
        "",
        "bounty_trust",
        "DENY",
        "BOUNTY_TRUST_SCORE_BELOW_THRESHOLD",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_NONE,
        "",
        "bounty_trust",
        "INSUFFICIENT_DATA",
        "BOUNTY_TRUST_INSUFFICIENT_DATA",
    )
    .await?;
    assert_reason(
        &pool,
        "/v1/trust/evaluate",
        SUBJECT_FREE,
        "",
        "bounty_evaluation",
        "INSUFFICIENT_DATA",
        "ERROR_UNSUPPORTED_ACTION",
    )
    .await?;

    cleanup(&pool).await?;
    Ok(())
}

async fn test_pool() -> anyhow::Result<Option<PgPool>> {
    let Ok(url) = std::env::var("EFREP_DATABASE_URL") else {
        return Ok(None);
    };
    Ok(Some(PgPool::connect(&url).await?))
}

async fn assert_reason(
    pool: &PgPool,
    route: &str,
    subject: &str,
    gate_id: &str,
    action: &str,
    decision: &str,
    reason: &str,
) -> anyhow::Result<()> {
    let value = post_eval(pool, route, subject, gate_id, action).await?;
    assert_eq!(value["apiVersion"], "trust.v1");
    assert_eq!(value["action"], action);
    assert_eq!(value["decision"], decision);
    assert_eq!(value["reason"], reason);
    if value["requirements"]["schema"] != "" {
        assert_eq!(value["requirements"]["schema"], SCHEMA_ID);
    }
    assert_eq!(value["proof"]["source"], "indexed_protocol_state");
    if action == "gate_access" && !gate_id.is_empty() {
        assert_eq!(value["gateId"], gate_id);
    } else {
        assert!(value.get("gateId").is_none());
    }
    Ok(())
}

fn assert_warning_prefix(value: &Value, prefix: &str) {
    let warnings = value["proof"]["warnings"]
        .as_array()
        .expect("proof warnings should be an array");
    assert!(
        warnings
            .iter()
            .any(|item| item.as_str().is_some_and(|s| s.starts_with(prefix))),
        "expected warning prefix {prefix}, got {warnings:?}",
    );
}

fn assert_no_warning_prefix(value: &Value, prefix: &str) {
    let warnings = value["proof"]["warnings"]
        .as_array()
        .expect("proof warnings should be an array");
    assert!(
        !warnings
            .iter()
            .any(|item| item.as_str().is_some_and(|s| s.starts_with(prefix))),
        "unexpected warning prefix {prefix}, got {warnings:?}",
    );
}

async fn post_eval(
    pool: &PgPool,
    route: &str,
    subject: &str,
    gate_id: &str,
    action: &str,
) -> anyhow::Result<Value> {
    let app = crate::api::router(pool.clone(), crate::api_trust::TrustConfig::default(), None);
    let mut context = serde_json::Map::new();
    context.insert("schemaId".to_owned(), json!(SCHEMA_ID));
    if !gate_id.is_empty() {
        context.insert("gateId".to_owned(), json!(gate_id));
    }
    let body = json!({
        "entity": subject,
        "action": action,
        "context": context
    });
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(route)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))?,
        )
        .await?;

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

async fn seed(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO schemas (schema_id, version, registered_tx)
         VALUES ($1, 1, 'http_schema_tx')
         ON CONFLICT (schema_id) DO NOTHING",
    )
    .bind(SCHEMA_ID)
    .execute(pool)
    .await?;

    seed_gate_policy(pool, GATE_ID, "http_policy_tx", 100).await?;
    seed_gate_policy(pool, GATE_OFFLINE_ID, "http_policy_offline_tx", 100).await?;
    seed_world_gate(
        pool,
        GATE_ID,
        "online",
        Some(MISSING_GATE_ID),
        "http_world_gate_online",
    )
    .await?;
    seed_world_gate(
        pool,
        GATE_OFFLINE_ID,
        "offline",
        None,
        "http_world_gate_offline",
    )
    .await?;

    seed_attestation(
        pool,
        SUBJECT_FREE,
        "0xhttp_attestation_free",
        750,
        "http_free_tx",
        101,
    )
    .await?;
    seed_attestation(
        pool,
        SUBJECT_TAXED,
        "0xhttp_attestation_taxed",
        250,
        "http_taxed_tx",
        102,
    )
    .await?;
    seed_attestation(
        pool,
        SUBJECT_ZERO,
        "0xhttp_attestation_zero",
        0,
        "http_zero_tx",
        103,
    )
    .await?;
    Ok(())
}

async fn seed_gate_policy(
    pool: &PgPool,
    gate_id: &str,
    tx_digest: &str,
    checkpoint: i64,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO gate_config_updates
            (gate_id, ally_threshold, base_toll_mist, tx_digest, event_seq, checkpoint_seq)
         VALUES ($1, 500, 100000000, $2, 1, $3)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(gate_id)
    .bind(tx_digest)
    .bind(checkpoint)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_world_gate(
    pool: &PgPool,
    gate_policy_id: &str,
    status: &str,
    linked_gate_id: Option<&str>,
    gate_id: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gates
            (gate_id, item_id, tenant, linked_gate_id, status, fw_extension_active, fw_gate_policy_id, checkpoint_updated)
         VALUES ($1, 1, 'stillness', $2, $3, TRUE, $4, 100)
         ON CONFLICT (gate_id) DO UPDATE SET
            linked_gate_id = EXCLUDED.linked_gate_id,
            status = EXCLUDED.status,
            fw_extension_active = EXCLUDED.fw_extension_active,
            fw_gate_policy_id = EXCLUDED.fw_gate_policy_id,
            updated_at = NOW()",
    )
    .bind(gate_id)
    .bind(linked_gate_id)
    .bind(status)
    .bind(gate_policy_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_attestation(
    pool: &PgPool,
    subject: &str,
    attestation_id: &str,
    value: i64,
    tx_digest: &str,
    checkpoint: i64,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO attestations
            (attestation_id, schema_id, issuer, subject, value, issued_tx)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (attestation_id) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(attestation_id)
    .bind(SCHEMA_ID)
    .bind("0x0000000000000000000000000000000000000000000000000000000000b0b001")
    .bind(subject)
    .bind(value)
    .bind(tx_digest)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO raw_events
            (chain, package_id, module_name, event_type, tx_digest, event_seq,
             checkpoint_seq, payload)
         VALUES ('sui', $1, 'attestation', 'AttestationIssued', $2, 1, $3, '{}'::JSONB)",
    )
    .bind("0x0000000000000000000000000000000000000000000000000000000000c0de01")
    .bind(tx_digest)
    .bind(checkpoint)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM raw_events WHERE tx_digest LIKE 'http_%'")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM world_gates WHERE gate_id IN ($1, $2)")
        .bind("http_world_gate_online")
        .bind("http_world_gate_offline")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM gate_config_updates WHERE gate_id IN ($1, $2, $3)")
        .bind(GATE_ID)
        .bind(GATE_OFFLINE_ID)
        .bind(MISSING_GATE_ID)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM attestations WHERE schema_id = $1")
        .bind(SCHEMA_ID)
        .execute(pool)
        .await?;
    let refs = sqlx::query("SELECT COUNT(*) AS count FROM attestations WHERE schema_id = $1")
        .bind(SCHEMA_ID)
        .fetch_one(pool)
        .await?
        .get::<i64, _>("count");
    if refs == 0 {
        sqlx::query("DELETE FROM schemas WHERE schema_id = $1")
            .bind(SCHEMA_ID)
            .execute(pool)
            .await?;
    }
    Ok(())
}
