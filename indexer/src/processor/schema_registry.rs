use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_opt_addr, field_str, field_u64, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "SchemaRegistered" => schema_registered(pool, ev).await,
        "SchemaDeprecated" => schema_deprecated(pool, ev).await,
        "GovernanceTransferred" => governance_transferred(pool, ev).await,
        _ => Ok(()),
    }
}

// SchemaRegistered → INSERT INTO schemas
async fn schema_registered(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let schema_id = field_str(p, "schema_id")?;
    let version = field_u64(p, "version")?;
    let resolver = field_opt_addr(p, "resolver");

    sqlx::query(
        "INSERT INTO schemas (schema_id, version, resolver, registered_tx)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (schema_id) DO NOTHING",
    )
    .bind(&schema_id)
    .bind(version)
    .bind(resolver.as_deref())
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// SchemaDeprecated → UPDATE schemas SET deprecated_by / deprecated_tx / deprecated_at
async fn schema_deprecated(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let old_id = field_str(p, "old_schema_id")?;
    let new_id = field_str(p, "new_schema_id")?;

    sqlx::query(
        "UPDATE schemas
         SET deprecated_by  = $1,
             deprecated_tx  = $2,
             deprecated_at  = NOW()
         WHERE schema_id = $3",
    )
    .bind(&new_id)
    .bind(&ev.id.tx_digest)
    .bind(&old_id)
    .execute(pool)
    .await?;

    Ok(())
}

// GovernanceTransferred → INSERT INTO governance_history
async fn governance_transferred(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let old_admin = field_opt_addr(p, "old_admin");
    let new_governance = field_addr(p, "new_governance")?;

    sqlx::query(
        "INSERT INTO governance_history (old_admin, new_governance, tx_digest)
         VALUES ($1, $2, $3)",
    )
    .bind(old_admin.as_deref())
    .bind(&new_governance)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}
