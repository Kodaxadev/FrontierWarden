//! Unit and integration tests for the world gate traffic API.
//!
//! Unit tests (no DB): response shape, limit clamping.
//! DB tests (gated on EFREP_DATABASE_URL): end-to-end handler tests.

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::Value;
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower::util::ServiceExt;

use crate::api_world_gate_traffic::clamp_limit;

// ── Unit tests (no DB required) ───────────────────────────────────────────────

#[test]
fn limit_clamp_default() {
    assert_eq!(clamp_limit(None), 50);
}

#[test]
fn limit_clamp_under_max() {
    assert_eq!(clamp_limit(Some(100)), 100);
}

#[test]
fn limit_clamp_over_max_clamped_to_500() {
    assert_eq!(clamp_limit(Some(1000)), 500);
    assert_eq!(clamp_limit(Some(i64::MAX)), 500);
}

#[test]
fn limit_clamp_zero_returns_one() {
    // 0 would produce an invalid LIMIT; clamp floor is 1.
    assert_eq!(clamp_limit(Some(0)), 1);
}

#[test]
fn limit_clamp_negative_returns_one() {
    assert_eq!(clamp_limit(Some(-5)), 1);
}

#[test]
fn limit_clamp_exact_max() {
    assert_eq!(clamp_limit(Some(500)), 500);
}

/// Verify route registration without a real database (lazy pool).
#[tokio::test]
async fn traffic_routes_are_registered() -> anyhow::Result<()> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://example.invalid/db")?;
    let app = crate::api::router(pool, crate::api_trust::TrustConfig::default(), None);

    let paths: &[&str] = &[
        "/world/gates/0xabcd/links",
        "/world/gates/0xabcd/jumps",
        "/world/gates/0xabcd/activity",
        "/world/gates/0xabcd",
        "/world/characters/0xabcd/jumps",
    ];
    for path in paths {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(*path)
                    .body(Body::empty())?,
            )
            .await?;
        assert_ne!(
            response.status(),
            StatusCode::NOT_FOUND,
            "route not registered: {path}"
        );
    }
    Ok(())
}

/// Response shape for gate with 0 active links (no topology yet).
#[tokio::test]
async fn gate_links_response_shape_zero_links() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping: EFREP_DATABASE_URL not set");
        return Ok(());
    };

    let gate_id = "0x0000000000000000000000000000000000000000000000000000000000aa0001";
    seed_gate(&pool, gate_id, 1001, "stillness", "online").await?;

    let body = get_json(&pool, &format!("/world/gates/{gate_id}/links")).await?;

    assert_eq!(body["gate_id"], gate_id);
    assert_eq!(body["link_count"], 0);
    assert_eq!(body["active_links"], Value::Array(vec![]));

    cleanup_gate(&pool, gate_id).await?;
    Ok(())
}

/// Response shape for gate with active links.
#[tokio::test]
async fn gate_links_response_shape_with_links() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping: EFREP_DATABASE_URL not set");
        return Ok(());
    };

    let src = "0x0000000000000000000000000000000000000000000000000000000000aa0002";
    let dst = "0x0000000000000000000000000000000000000000000000000000000000aa0003";

    seed_gate(&pool, src, 1002, "stillness", "online").await?;
    seed_gate(&pool, dst, 1003, "stillness", "online").await?;
    seed_link(&pool, src, dst, 1002, 1003, 300_000_000).await?;

    let body = get_json(&pool, &format!("/world/gates/{src}/links")).await?;

    assert_eq!(body["gate_id"], src);
    assert_eq!(body["link_count"], 1);
    let links = body["active_links"].as_array().unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0]["destination_gate_id"], dst);
    assert_eq!(links[0]["destination_gate_item_id"], 1003);
    assert_eq!(links[0]["destination_gate_tenant"], "stillness");
    assert!(links[0]["linked_at_checkpoint"].is_number());

    cleanup_link(&pool, src, dst).await?;
    cleanup_gate(&pool, src).await?;
    cleanup_gate(&pool, dst).await?;
    Ok(())
}

/// Unknown gate_id → 404.
#[tokio::test]
async fn gate_links_unknown_gate_returns_404() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping: EFREP_DATABASE_URL not set");
        return Ok(());
    };

    let app = crate::api::router(pool, crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/world/gates/0x000000000000000000000000000000000000000000000000000000000000dead/links")
                .body(Body::empty())?,
        )
        .await?;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    Ok(())
}

/// End-to-end: seed a jump row, verify it appears in the gate jumps response.
#[tokio::test]
async fn gate_jumps_returns_seeded_row() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping: EFREP_DATABASE_URL not set");
        return Ok(());
    };

    let src = "0x0000000000000000000000000000000000000000000000000000000000aa0010";
    let dst = "0x0000000000000000000000000000000000000000000000000000000000aa0011";
    let char_id = "0x0000000000000000000000000000000000000000000000000000000000cc0001";
    let tx = "0x000000000000000000000000000000000000000000000000000000000000feed";

    seed_gate(&pool, src, 9010, "stillness", "online").await?;
    seed_gate(&pool, dst, 9011, "stillness", "online").await?;
    seed_jump(&pool, tx, 0, src, dst, char_id, 308_264_360).await?;

    let body = get_json(&pool, &format!("/world/gates/{src}/jumps")).await?;

    assert_eq!(body["gate_id"], src);
    assert!(body["total"].as_u64().unwrap() >= 1);
    let jumps = body["jumps"].as_array().unwrap();
    let found = jumps.iter().any(|j| j["tx_digest"] == tx);
    assert!(found, "seeded jump not in response");

    cleanup_jump(&pool, tx, 0).await?;
    cleanup_gate(&pool, src).await?;
    cleanup_gate(&pool, dst).await?;
    Ok(())
}

/// Limit clamping end-to-end: limit=1000 → at most 500 rows returned.
/// Uses a gate with zero jumps — just verifies the query doesn't blow up
/// and the response shape is well-formed.
#[tokio::test]
async fn gate_jumps_large_limit_is_clamped() -> anyhow::Result<()> {
    let Some(pool) = test_pool().await? else {
        eprintln!("skipping: EFREP_DATABASE_URL not set");
        return Ok(());
    };

    let gate_id = "0x0000000000000000000000000000000000000000000000000000000000aa0020";
    seed_gate(&pool, gate_id, 9020, "stillness", "online").await?;

    let body = get_json(
        &pool,
        &format!("/world/gates/{gate_id}/jumps?limit=1000"),
    )
    .await?;

    let jumps = body["jumps"].as_array().unwrap();
    assert!(
        jumps.len() <= 500,
        "response exceeded MAX_LIMIT: got {}",
        jumps.len()
    );

    cleanup_gate(&pool, gate_id).await?;
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn test_pool() -> anyhow::Result<Option<PgPool>> {
    let Ok(url) = std::env::var("EFREP_DATABASE_URL") else {
        return Ok(None);
    };
    Ok(Some(PgPool::connect(&url).await?))
}

async fn get_json(pool: &PgPool, uri: &str) -> anyhow::Result<Value> {
    let app = crate::api::router(pool.clone(), crate::api_trust::TrustConfig::default(), None);
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .body(Body::empty())?,
        )
        .await?;
    let bytes = to_bytes(response.into_body(), usize::MAX).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

async fn seed_gate(
    pool: &PgPool,
    gate_id: &str,
    item_id: i64,
    tenant: &str,
    status: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gates (gate_id, item_id, tenant, status, fw_extension_active, checkpoint_updated)
         VALUES ($1, $2, $3, $4, FALSE, 0)
         ON CONFLICT (gate_id) DO UPDATE SET
             item_id = EXCLUDED.item_id,
             tenant = EXCLUDED.tenant,
             status = EXCLUDED.status,
             updated_at = NOW()",
    )
    .bind(gate_id)
    .bind(item_id)
    .bind(tenant)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_link(
    pool: &PgPool,
    src: &str,
    dst: &str,
    src_item_id: i64,
    dst_item_id: i64,
    checkpoint: i64,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_links
            (source_gate_id, destination_gate_id,
             source_gate_item_id, source_gate_tenant,
             destination_gate_item_id, destination_gate_tenant,
             linked_at_checkpoint, is_active, updated_at)
         VALUES ($1, $2, $3, 'stillness', $4, 'stillness', $5, TRUE, NOW())
         ON CONFLICT (source_gate_id, destination_gate_id) DO UPDATE SET
             is_active = TRUE, updated_at = NOW()",
    )
    .bind(src)
    .bind(dst)
    .bind(src_item_id)
    .bind(dst_item_id)
    .bind(checkpoint)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_jump(
    pool: &PgPool,
    tx: &str,
    seq: i64,
    src: &str,
    dst: &str,
    char_id: &str,
    checkpoint: i64,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_jumps
            (tx_digest, event_seq, checkpoint,
             source_gate_id, source_gate_item_id, source_gate_tenant,
             destination_gate_id, destination_gate_item_id, destination_gate_tenant,
             character_id, character_item_id, character_tenant)
         VALUES ($1, $2, $3, $4, 0, 'stillness', $5, 0, 'stillness', $6, 0, 'stillness')
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(tx)
    .bind(seq)
    .bind(checkpoint)
    .bind(src)
    .bind(dst)
    .bind(char_id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup_gate(pool: &PgPool, gate_id: &str) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM world_gates WHERE gate_id = $1")
        .bind(gate_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn cleanup_link(pool: &PgPool, src: &str, dst: &str) -> anyhow::Result<()> {
    sqlx::query(
        "DELETE FROM world_gate_links WHERE source_gate_id = $1 AND destination_gate_id = $2",
    )
    .bind(src)
    .bind(dst)
    .execute(pool)
    .await?;
    Ok(())
}

async fn cleanup_jump(pool: &PgPool, tx: &str, seq: i64) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM world_gate_jumps WHERE tx_digest = $1 AND event_seq = $2")
        .bind(tx)
        .bind(seq)
        .execute(pool)
        .await?;
    Ok(())
}
