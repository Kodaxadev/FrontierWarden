use anyhow::Result;
use sqlx::{PgPool, Row};

use crate::world_topology_parser::{GateLinkRow, GateUnlinkRow};

// ── Write helpers ─────────────────────────────────────────────────────────────

/// Upsert a single directed gate link row.
///
/// On conflict (same source→dest pair), the row is refreshed as active with
/// the new checkpoint and tx_digest; `unlinked_at_checkpoint` is reset to NULL.
async fn upsert_directed_link(pool: &PgPool, row: &GateLinkRow) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_links (
            source_gate_id, destination_gate_id,
            source_gate_item_id, source_gate_tenant,
            destination_gate_item_id, destination_gate_tenant,
            linked_at_checkpoint, unlinked_at_checkpoint, is_active,
            tx_digest, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, TRUE, $8, NOW())
        ON CONFLICT (source_gate_id, destination_gate_id) DO UPDATE SET
            source_gate_item_id       = EXCLUDED.source_gate_item_id,
            source_gate_tenant        = EXCLUDED.source_gate_tenant,
            destination_gate_item_id  = EXCLUDED.destination_gate_item_id,
            destination_gate_tenant   = EXCLUDED.destination_gate_tenant,
            linked_at_checkpoint      = EXCLUDED.linked_at_checkpoint,
            unlinked_at_checkpoint    = NULL,
            is_active                 = TRUE,
            tx_digest                 = EXCLUDED.tx_digest,
            updated_at                = NOW()",
    )
    .bind(&row.source_gate_id)
    .bind(&row.destination_gate_id)
    .bind(row.source_gate_item_id)
    .bind(&row.source_gate_tenant)
    .bind(row.destination_gate_item_id)
    .bind(&row.destination_gate_tenant)
    .bind(row.linked_at_checkpoint)
    .bind(&row.tx_digest)
    .execute(pool)
    .await?;
    Ok(())
}

/// Insert both directed rows for a `GateLinkedEvent`.
///
/// `GateLinkedEvent` is directional (source→destination) but gates are
/// bidirectionally linked in the game. We insert both directions so that
/// `active_links_for_gate(gate_id)` is a simple `WHERE source_gate_id = $1`.
pub async fn upsert_gate_link(pool: &PgPool, row: &GateLinkRow) -> Result<()> {
    // source → destination
    upsert_directed_link(pool, row).await?;

    // destination → source (swap fields)
    let reverse = GateLinkRow {
        source_gate_id: row.destination_gate_id.clone(),
        destination_gate_id: row.source_gate_id.clone(),
        source_gate_item_id: row.destination_gate_item_id,
        source_gate_tenant: row.destination_gate_tenant.clone(),
        destination_gate_item_id: row.source_gate_item_id,
        destination_gate_tenant: row.source_gate_tenant.clone(),
        linked_at_checkpoint: row.linked_at_checkpoint,
        tx_digest: row.tx_digest.clone(),
    };
    upsert_directed_link(pool, &reverse).await?;

    Ok(())
}

/// Mark both directed rows inactive on a `GateUnlinkedEvent`.
///
/// Both directions are set `is_active = FALSE`; `unlinked_at_checkpoint` is
/// stored for audit purposes. The rows are kept in place so history is
/// preserved and re-link events can upsert over them.
pub async fn mark_gate_unlinked(pool: &PgPool, row: &GateUnlinkRow) -> Result<()> {
    // Mark source → destination
    sqlx::query(
        "UPDATE world_gate_links
         SET is_active              = FALSE,
             unlinked_at_checkpoint = $1,
             updated_at             = NOW()
         WHERE source_gate_id = $2 AND destination_gate_id = $3",
    )
    .bind(row.unlinked_at_checkpoint)
    .bind(&row.source_gate_id)
    .bind(&row.destination_gate_id)
    .execute(pool)
    .await?;

    // Mark destination → source
    sqlx::query(
        "UPDATE world_gate_links
         SET is_active              = FALSE,
             unlinked_at_checkpoint = $1,
             updated_at             = NOW()
         WHERE source_gate_id = $2 AND destination_gate_id = $3",
    )
    .bind(row.unlinked_at_checkpoint)
    .bind(&row.destination_gate_id)
    .bind(&row.source_gate_id)
    .execute(pool)
    .await?;

    Ok(())
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/// Return all currently active outbound links from `gate_id`.
///
/// Returns `Vec<GateLinkRow>` where `source_gate_id == gate_id` and
/// `is_active = TRUE`. The reverse rows (dest→src) are also present in the DB
/// and are queryable by calling this function with the partner gate's ID.
pub async fn active_links_for_gate(pool: &PgPool, gate_id: &str) -> Result<Vec<GateLinkRow>> {
    let rows = sqlx::query(
        "SELECT
            source_gate_id,
            destination_gate_id,
            source_gate_item_id,
            source_gate_tenant,
            destination_gate_item_id,
            destination_gate_tenant,
            linked_at_checkpoint,
            tx_digest
         FROM world_gate_links
         WHERE source_gate_id = $1 AND is_active = TRUE",
    )
    .bind(gate_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| GateLinkRow {
            source_gate_id: r.get("source_gate_id"),
            destination_gate_id: r.get("destination_gate_id"),
            source_gate_item_id: r.get("source_gate_item_id"),
            source_gate_tenant: r.get("source_gate_tenant"),
            destination_gate_item_id: r.get("destination_gate_item_id"),
            destination_gate_tenant: r.get("destination_gate_tenant"),
            linked_at_checkpoint: r.get("linked_at_checkpoint"),
            tx_digest: r.get("tx_digest"),
        })
        .collect())
}
