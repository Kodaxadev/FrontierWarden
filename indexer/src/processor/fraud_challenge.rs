use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_bool, field_u64, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "FraudChallengeCreated" => challenge_created(pool, ev).await,
        "FraudChallengeResolved" => challenge_resolved(pool, ev).await,
        _ => {
            tracing::debug!(
                event = event_name(&ev.type_),
                tx = %ev.id.tx_digest,
                "fraud_challenge event stored raw-only",
            );
            Ok(())
        }
    }
}

async fn challenge_created(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let challenge_id = field_addr(p, "challenge_id")?;
    let attestation_id = field_addr(p, "attestation_id")?;
    let challenger = field_addr(p, "challenger")?;
    let oracle = field_addr(p, "oracle")?;

    sqlx::query(
        "INSERT INTO fraud_challenges
            (challenge_id, attestation_id, challenger, oracle, created_tx)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (challenge_id) DO NOTHING",
    )
    .bind(challenge_id)
    .bind(attestation_id)
    .bind(challenger)
    .bind(oracle)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

async fn challenge_resolved(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let challenge_id = field_addr(p, "challenge_id")?;
    let guilty = field_bool(p, "guilty")?;
    let slash_amount = field_u64(p, "slash_amount")?;

    sqlx::query(
        "UPDATE fraud_challenges
         SET resolved = TRUE,
             guilty = $2,
             slash_amount = $3,
             resolved_tx = $4,
             resolved_at = NOW()
         WHERE challenge_id = $1",
    )
    .bind(challenge_id)
    .bind(guilty)
    .bind(slash_amount)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}
