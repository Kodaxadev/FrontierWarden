use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{SuiEvent, event_name, field_addr, field_bool, field_str, field_u64};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "OracleRegistered"       => oracle_registered(pool, ev).await,
        "FraudChallengeCreated"  => challenge_created(pool, ev).await,
        "FraudChallengeResolved" => challenge_resolved(pool, ev).await,
        _                        => Ok(()),
    }
}

// OracleRegistered → INSERT INTO oracles
// name is vector<u8> in Move (the oracle's human-readable label)
async fn oracle_registered(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p                = &ev.parsed_json;
    let oracle_address   = field_addr(p, "oracle_address")?;
    let name             = field_str(p, "name")?;
    let tee_verified     = field_bool(p, "tee_verified")?;
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

// FraudChallengeCreated → INSERT INTO fraud_challenges
async fn challenge_created(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p              = &ev.parsed_json;
    let challenge_id   = field_addr(p, "challenge_id")?;
    let attestation_id = field_addr(p, "attestation_id")?;
    let challenger     = field_addr(p, "challenger")?;
    let oracle         = field_addr(p, "oracle")?;

    sqlx::query(
        "INSERT INTO fraud_challenges
             (challenge_id, attestation_id, challenger, oracle, created_tx)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (challenge_id) DO NOTHING",
    )
    .bind(&challenge_id)
    .bind(&attestation_id)
    .bind(&challenger)
    .bind(&oracle)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// FraudChallengeResolved → UPDATE fraud_challenges SET resolved fields
async fn challenge_resolved(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p            = &ev.parsed_json;
    let challenge_id = field_addr(p, "challenge_id")?;
    let guilty       = field_bool(p, "guilty")?;
    let slash_amount = field_u64(p, "slash_amount")?;

    sqlx::query(
        "UPDATE fraud_challenges
         SET resolved    = TRUE,
             guilty      = $1,
             slash_amount= $2,
             resolved_tx = $3,
             resolved_at = NOW()
         WHERE challenge_id = $4",
    )
    .bind(guilty)
    .bind(slash_amount)
    .bind(&ev.id.tx_digest)
    .bind(&challenge_id)
    .execute(pool)
    .await?;

    Ok(())
}
