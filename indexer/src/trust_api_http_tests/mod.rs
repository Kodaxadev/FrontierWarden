mod seed;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::util::ServiceExt;

use seed::{cleanup, seed, test_pool};

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
