use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_str, field_u64, normalize_sui_address, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    if event_name(&ev.type_) == "SystemAttestationEvent" {
        system_attestation(pool, ev).await
    } else {
        Ok(())
    }
}

// SystemAttestationEvent → INSERT INTO system_attestations
// Note: `timestamp` in the Move event is the Sui epoch number, stored as sui_timestamp.
// The UNIQUE constraint on (tx_digest, schema_id, subject) prevents double-inserts.
async fn system_attestation(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let schema_id = field_str(p, "schema_id")?;
    let subject = normalize_sui_address(&field_addr(p, "subject")?);
    let value = field_u64(p, "value")?;
    let system_oracle = normalize_sui_address(&field_addr(p, "system_oracle")?);

    let sui_timestamp = field_u64(p, "timestamp")?;

    sqlx::query(
        "INSERT INTO system_attestations
             (schema_id, subject, value, system_oracle, sui_timestamp, tx_digest)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_digest, schema_id, subject) DO NOTHING",
    )
    .bind(&schema_id)
    .bind(&subject)
    .bind(value)
    .bind(&system_oracle)
    .bind(sui_timestamp)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}
