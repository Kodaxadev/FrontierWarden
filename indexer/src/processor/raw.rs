use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{SuiEvent, event_name};

/// Appends every incoming Sui event to the raw_events firehose.
///
/// This runs before the type-specific projection handler so the audit log
/// is always complete — even if a projection insert fails, the raw record
/// exists for replay.
pub async fn insert(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let event_seq: i64 = ev.id.event_seq.parse().unwrap_or(0);
    let checkpoint_seq: i64 = ev.checkpoint.as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let timestamp_ms: Option<i64> = ev.timestamp_ms.as_deref()
        .and_then(|s| s.parse().ok());

    sqlx::query(
        "INSERT INTO raw_events
             (chain, package_id, module_name, event_type,
              tx_digest, event_seq, checkpoint_seq, sender, timestamp_ms, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind("sui")
    .bind(&ev.package_id)
    .bind(&ev.transaction_module)
    .bind(event_name(&ev.type_))
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .bind(checkpoint_seq)
    .bind(ev.sender.as_deref())
    .bind(timestamp_ms)
    .bind(&ev.parsed_json)
    .execute(pool)
    .await?;

    Ok(())
}
