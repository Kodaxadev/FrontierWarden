use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_u64, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "PassageGranted" => passage_granted(pool, ev).await,
        "PassageDenied" => passage_denied(pool, ev).await,
        "GateConfigUpdated" => gate_config_updated(pool, ev).await,
        "TollsWithdrawn" => tolls_withdrawn(pool, ev).await,
        _ => {
            tracing::debug!(
                event = event_name(&ev.type_),
                tx = %ev.id.tx_digest,
                "reputation_gate event stored raw-only",
            );
            Ok(())
        }
    }
}

async fn passage_granted(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let gate_id = field_addr(p, "gate_id")?;
    let traveler = field_addr(p, "traveler")?;
    let score = field_u64(p, "score")?;
    let toll_paid = field_u64(p, "toll_paid")?;
    let tier = field_u64(p, "tier")?;
    let epoch = field_u64(p, "epoch")?;
    let event_seq = event_seq(ev);
    let checkpoint_seq = checkpoint_seq(ev);

    sqlx::query(
        "INSERT INTO gate_passages
            (gate_id, traveler, allowed, score, toll_paid, tier, reason, epoch,
             tx_digest, event_seq, checkpoint_seq)
         VALUES ($1, $2, TRUE, $3, $4, $5, NULL, $6, $7, $8, $9)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(gate_id)
    .bind(traveler)
    .bind(score)
    .bind(toll_paid)
    .bind(tier as i16)
    .bind(epoch)
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .bind(checkpoint_seq)
    .execute(pool)
    .await?;

    Ok(())
}

async fn passage_denied(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let gate_id = field_addr(p, "gate_id")?;
    let traveler = field_addr(p, "traveler")?;
    let reason = field_u64(p, "reason")?;
    let epoch = field_u64(p, "epoch")?;
    let event_seq = event_seq(ev);
    let checkpoint_seq = checkpoint_seq(ev);

    sqlx::query(
        "INSERT INTO gate_passages
            (gate_id, traveler, allowed, score, toll_paid, tier, reason, epoch,
             tx_digest, event_seq, checkpoint_seq)
         VALUES ($1, $2, FALSE, NULL, NULL, NULL, $3, $4, $5, $6, $7)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(gate_id)
    .bind(traveler)
    .bind(reason as i16)
    .bind(epoch)
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .bind(checkpoint_seq)
    .execute(pool)
    .await?;

    Ok(())
}

async fn gate_config_updated(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let gate_id = field_addr(p, "gate_id")?;
    let ally_threshold = field_u64(p, "ally_threshold")?;
    let base_toll_mist = field_u64(p, "base_toll_mist")?;
    let event_seq = event_seq(ev);
    let checkpoint_seq = checkpoint_seq(ev);

    sqlx::query(
        "INSERT INTO gate_config_updates
            (gate_id, ally_threshold, base_toll_mist, tx_digest, event_seq, checkpoint_seq)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(gate_id)
    .bind(ally_threshold)
    .bind(base_toll_mist)
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .bind(checkpoint_seq)
    .execute(pool)
    .await?;

    Ok(())
}

async fn tolls_withdrawn(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let gate_id = field_addr(p, "gate_id")?;
    let owner = field_addr(p, "owner")?;
    let amount = field_u64(p, "amount")?;
    let event_seq = event_seq(ev);
    let checkpoint_seq = checkpoint_seq(ev);

    sqlx::query(
        "INSERT INTO toll_withdrawals
            (gate_id, owner, amount_mist, tx_digest, event_seq, checkpoint_seq)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(gate_id)
    .bind(owner)
    .bind(amount)
    .bind(&ev.id.tx_digest)
    .bind(event_seq)
    .bind(checkpoint_seq)
    .execute(pool)
    .await?;

    Ok(())
}

fn event_seq(ev: &SuiEvent) -> i64 {
    ev.id.event_seq.parse().unwrap_or(0)
}

fn checkpoint_seq(ev: &SuiEvent) -> i64 {
    ev.checkpoint
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}
