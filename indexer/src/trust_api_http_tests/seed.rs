use sqlx::{PgPool, Row};

use super::{GATE_ID, GATE_OFFLINE_ID, MISSING_GATE_ID, SCHEMA_ID};

pub(super) async fn test_pool() -> anyhow::Result<Option<PgPool>> {
    let Ok(url) = std::env::var("EFREP_DATABASE_URL") else {
        return Ok(None);
    };
    Ok(Some(PgPool::connect(&url).await?))
}

pub(super) async fn seed(pool: &PgPool) -> anyhow::Result<()> {
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
        super::SUBJECT_FREE,
        "0xhttp_attestation_free",
        750,
        "http_free_tx",
        101,
    )
    .await?;
    seed_attestation(
        pool,
        super::SUBJECT_TAXED,
        "0xhttp_attestation_taxed",
        250,
        "http_taxed_tx",
        102,
    )
    .await?;
    seed_attestation(
        pool,
        super::SUBJECT_ZERO,
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

pub(super) async fn cleanup(pool: &PgPool) -> anyhow::Result<()> {
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
