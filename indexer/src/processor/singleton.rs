use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{SuiEvent, event_name, field_addr, field_str, field_u64};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "SingletonAttestationIssued"  => singleton_issued(pool, ev).await,
        "SingletonAttestationRevoked" => singleton_revoked(pool, ev).await,
        _                             => Ok(()),
    }
}

// SingletonAttestationIssued → INSERT INTO singleton_attestations
async fn singleton_issued(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p              = &ev.parsed_json;
    let attestation_id = field_addr(p, "attestation_id")?;
    let schema_id      = field_str(p, "schema_id")?;
    let item_id        = field_addr(p, "item_id")?;
    let issuer         = field_addr(p, "issuer")?;
    let value          = field_u64(p, "value")?;

    sqlx::query(
        "INSERT INTO singleton_attestations
             (attestation_id, schema_id, item_id, issuer, value, issued_tx)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (attestation_id) DO NOTHING",
    )
    .bind(&attestation_id)
    .bind(&schema_id)
    .bind(&item_id)
    .bind(&issuer)
    .bind(value)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// SingletonAttestationRevoked → UPDATE singleton_attestations SET revoked = TRUE
async fn singleton_revoked(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p              = &ev.parsed_json;
    let attestation_id = field_addr(p, "attestation_id")?;
    let revoker        = field_addr(p, "revoker")?;

    sqlx::query(
        "UPDATE singleton_attestations
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
