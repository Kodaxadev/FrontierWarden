use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, SuiEvent};

/// Appends a Sui event to the raw firehose once.
///
/// Returns false when the event has already been indexed. The caller should
/// skip projections in that case, because the original pass already handled it.
pub async fn insert(pool: &PgPool, ev: &SuiEvent) -> Result<bool> {
    let event_seq: i64 = ev.id.event_seq.parse().unwrap_or(0);
    let checkpoint_seq: i64 = ev
        .checkpoint
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let timestamp_ms: Option<i64> = ev.timestamp_ms.as_deref().and_then(|s| s.parse().ok());
    let mut tx = pool.begin().await?;

    let inserted: Option<(String,)> = sqlx::query_as(
        "INSERT INTO raw_event_dedup (tx_digest, event_seq)
         VALUES ($1, $2)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING
         RETURNING tx_digest",
    )
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .fetch_optional(&mut *tx)
    .await?;

    if inserted.is_none() {
        tx.commit().await?;
        return Ok(false);
    }

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
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(true)
}
