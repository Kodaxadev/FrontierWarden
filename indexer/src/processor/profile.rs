use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_str, field_u64, normalize_sui_address, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "ProfileCreated" => profile_created(pool, ev).await,
        "ScoreUpdated" => score_updated(pool, ev).await,
        _ => Ok(()),
    }
}

// ProfileCreated → INSERT INTO profiles
async fn profile_created(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let profile_id = normalize_sui_address(&field_addr(p, "profile_id")?);
    let owner = normalize_sui_address(&field_addr(p, "owner")?);

    sqlx::query(
        "INSERT INTO profiles (profile_id, owner, created_tx)
         VALUES ($1, $2, $3)
         ON CONFLICT (owner) DO UPDATE SET
             profile_id = EXCLUDED.profile_id,
             created_tx = EXCLUDED.created_tx,
             created_at = EXCLUDED.created_at",
    )
    .bind(&profile_id)
    .bind(&owner)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// ScoreUpdated → UPSERT score_cache
// new_value wins; old_value is only used for analytics via raw_events.
async fn score_updated(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let profile_id = normalize_sui_address(&field_addr(p, "profile_id")?);
    let schema_id = field_str(p, "schema_id")?;
    let new_value = field_u64(p, "new_value")?;
    let issuer = normalize_sui_address(&field_addr(p, "issuer")?);
    let checkpoint: i64 = ev
        .checkpoint
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // score_cache.schema_id has a FK → schemas(schema_id).
    // update_score on-chain does NOT require the schema to be in SchemaRegistry
    // (it only checks OracleCapability.authorized_schemas). Guard: synthesise a
    // schemas row so the FK never blocks a legitimate score write.
    sqlx::query(
        "INSERT INTO schemas (schema_id, version, registered_tx)
         VALUES ($1, 1, 'synthetic-score-update')
         ON CONFLICT (schema_id) DO NOTHING",
    )
    .bind(&schema_id)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO score_cache
             (profile_id, schema_id, value, issuer, last_tx_digest, last_checkpoint)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (profile_id, schema_id) DO UPDATE SET
             value           = EXCLUDED.value,
             issuer          = EXCLUDED.issuer,
             last_tx_digest  = EXCLUDED.last_tx_digest,
             last_checkpoint = EXCLUDED.last_checkpoint,
             updated_at      = NOW()",
    )
    .bind(&profile_id)
    .bind(&schema_id)
    .bind(new_value)
    .bind(&issuer)
    .bind(&ev.id.tx_digest)
    .bind(checkpoint)
    .execute(pool)
    .await?;

    tracing::info!(
        profile_id,
        schema_id,
        new_value,
        "pipeline:score_cache_updated"
    );
    Ok(())
}
