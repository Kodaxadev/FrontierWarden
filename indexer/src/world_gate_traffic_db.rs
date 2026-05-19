//! Database helpers for world gate traffic queries.
//!
//! Extracted from api_world_gate_traffic to keep each module under 400 lines.

use sqlx::PgPool;

use crate::api_common::ApiError;

// ── DB row types ─────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
pub(crate) struct WorldGateRow {
    pub gate_id: String,
    pub item_id: i64,
    pub tenant: String,
    pub status: String,
    pub fw_extension_active: bool,
    pub fw_gate_policy_id: Option<String>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct JumpWindowCounts {
    pub jump_count_1h: i64,
    pub jump_count_24h: i64,
    pub jump_count_7d: i64,
}

// ── Query helpers ────────────────────────────────────────────────────────────

pub(crate) async fn gate_exists(pool: &PgPool, gate_id: &str) -> Result<bool, ApiError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM world_gates WHERE gate_id = $1)",
    )
    .bind(gate_id)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

pub(crate) async fn jump_count_24h(pool: &PgPool, gate_id: &str) -> anyhow::Result<i64> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM world_gate_jumps
         WHERE (source_gate_id = $1 OR destination_gate_id = $1)
           AND created_at >= NOW() - INTERVAL '24 hours'",
    )
    .bind(gate_id)
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub(crate) fn jump_item_from_row(
    r: crate::world_jump_parser::JumpEventRow,
) -> crate::api_world_gate_traffic::JumpItem {
    crate::api_world_gate_traffic::JumpItem {
        tx_digest: r.tx_digest,
        checkpoint: r.checkpoint,
        source_gate_id: r.source_gate_id,
        destination_gate_id: r.destination_gate_id,
        character_id: r.character_id,
        character_item_id: r.character_item_id,
        character_tenant: r.character_tenant,
    }
}
