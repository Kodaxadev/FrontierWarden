use anyhow::Result;
use sqlx::{PgPool, Row};

use crate::world_jump_parser::JumpEventRow;

// ── Write helpers ─────────────────────────────────────────────────────────────

/// Insert a single `JumpEvent` row into `world_gate_jumps`.
///
/// Uses `ON CONFLICT (tx_digest, event_seq) DO NOTHING` — events are immutable
/// so no update is needed; duplicates are silently dropped. This makes the
/// ingester idempotent across restarts and cursor replays.
pub async fn insert_jump_event(pool: &PgPool, row: &JumpEventRow) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_jumps (
            tx_digest, event_seq, checkpoint,
            source_gate_id, source_gate_item_id, source_gate_tenant,
            destination_gate_id, destination_gate_item_id, destination_gate_tenant,
            character_id, character_item_id, character_tenant
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tx_digest, event_seq) DO NOTHING",
    )
    .bind(&row.tx_digest)
    .bind(row.event_seq)
    .bind(row.checkpoint)
    .bind(&row.source_gate_id)
    .bind(row.source_gate_item_id)
    .bind(&row.source_gate_tenant)
    .bind(&row.destination_gate_id)
    .bind(row.destination_gate_item_id)
    .bind(&row.destination_gate_tenant)
    .bind(&row.character_id)
    .bind(row.character_item_id)
    .bind(&row.character_tenant)
    .execute(pool)
    .await?;
    Ok(())
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/// Return the most recent jumps involving `gate_id` as source or destination.
///
/// Results are ordered by `checkpoint DESC` so the caller gets the freshest
/// activity first. `limit` caps the result set to avoid unbounded scans.
pub async fn recent_jumps_for_gate(
    pool: &PgPool,
    gate_id: &str,
    limit: i64,
) -> Result<Vec<JumpEventRow>> {
    let rows = sqlx::query(
        "SELECT
            tx_digest, event_seq, checkpoint,
            source_gate_id, source_gate_item_id, source_gate_tenant,
            destination_gate_id, destination_gate_item_id, destination_gate_tenant,
            character_id, character_item_id, character_tenant
         FROM world_gate_jumps
         WHERE source_gate_id = $1 OR destination_gate_id = $1
         ORDER BY checkpoint DESC
         LIMIT $2",
    )
    .bind(gate_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(row_to_jump).collect())
}

/// Return the most recent jumps for `character_id`, ordered newest first.
pub async fn recent_jumps_for_character(
    pool: &PgPool,
    character_id: &str,
    limit: i64,
) -> Result<Vec<JumpEventRow>> {
    let rows = sqlx::query(
        "SELECT
            tx_digest, event_seq, checkpoint,
            source_gate_id, source_gate_item_id, source_gate_tenant,
            destination_gate_id, destination_gate_item_id, destination_gate_tenant,
            character_id, character_item_id, character_tenant
         FROM world_gate_jumps
         WHERE character_id = $1
         ORDER BY checkpoint DESC
         LIMIT $2",
    )
    .bind(character_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(row_to_jump).collect())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn row_to_jump(r: sqlx::postgres::PgRow) -> JumpEventRow {
    JumpEventRow {
        tx_digest: r.get("tx_digest"),
        event_seq: r.get("event_seq"),
        checkpoint: r.get("checkpoint"),
        source_gate_id: r.get("source_gate_id"),
        source_gate_item_id: r.get("source_gate_item_id"),
        source_gate_tenant: r.get("source_gate_tenant"),
        destination_gate_id: r.get("destination_gate_id"),
        destination_gate_item_id: r.get("destination_gate_item_id"),
        destination_gate_tenant: r.get("destination_gate_tenant"),
        character_id: r.get("character_id"),
        character_item_id: r.get("character_item_id"),
        character_tenant: r.get("character_tenant"),
    }
}
