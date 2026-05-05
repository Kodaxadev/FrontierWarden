use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_str, field_u64, normalize_sui_address, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "AttestationIssued" => attestation_issued(pool, ev).await,
        "AttestationRevoked" => attestation_revoked(pool, ev).await,
        _ => Ok(()),
    }
}

// AttestationIssued → INSERT INTO attestations
async fn attestation_issued(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let attestation_id = normalize_sui_address(&field_addr(p, "attestation_id")?);
    let schema_id = field_str(p, "schema_id")?;
    let issuer = normalize_sui_address(&field_addr(p, "issuer")?);
    let subject = normalize_sui_address(&field_addr(p, "subject")?);
    let value = field_u64(p, "value")?;

    sqlx::query(
        "INSERT INTO attestations
             (attestation_id, schema_id, issuer, subject, value, issued_tx)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (attestation_id) DO NOTHING",
    )
    .bind(&attestation_id)
    .bind(&schema_id)
    .bind(&issuer)
    .bind(&subject)
    .bind(value)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    tracing::info!(attestation_id, schema_id, subject, "pipeline:attestation_indexed");
    Ok(())
}

// AttestationRevoked → UPDATE attestations SET revoked = TRUE
async fn attestation_revoked(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let attestation_id = normalize_sui_address(&field_addr(p, "attestation_id")?);
    let revoker = normalize_sui_address(&field_addr(p, "revoker")?);


    sqlx::query(
        "UPDATE attestations
         SET revoked    = TRUE,
             revoker    = $1,
             revoked_tx = $2,
             revoked_at = NOW()
         WHERE attestation_id = $3",
    )
    .bind(&revoker)
    .bind(&ev.id.tx_digest)
    .bind(&attestation_id)
    .execute(pool)
    .await?;

    Ok(())
}
