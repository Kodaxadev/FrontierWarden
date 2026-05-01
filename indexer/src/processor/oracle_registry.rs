use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_bool, field_str, normalize_sui_address, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "OracleRegistered" => oracle_registered(pool, ev).await,
        // FraudChallengeCreated / FraudChallengeResolved are emitted via the oracle_registry
        // bridge but projected by fraud_challenge.rs — skip here to avoid double-processing.
        _ => Ok(()),
    }
}

// OracleRegistered → INSERT INTO oracles
// name is vector<u8> in Move (the oracle's human-readable label)
async fn oracle_registered(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let oracle_address = normalize_sui_address(&field_addr(p, "oracle_address")?);
    let name = field_str(p, "name")?;
    let tee_verified = field_bool(p, "tee_verified")?;
    let is_system_oracle = field_bool(p, "is_system_oracle")?;

    sqlx::query(
        "INSERT INTO oracles
             (oracle_address, name, tee_verified, is_system_oracle, registered_tx)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (oracle_address) DO NOTHING",
    )
    .bind(&oracle_address)
    .bind(&name)
    .bind(tee_verified)
    .bind(is_system_oracle)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}
