use anyhow::Result;
use sqlx::PgPool;

use crate::{
    rpc::{event_name, SuiEvent},
    world_jump::insert_jump_event,
    world_jump_parser::parse_jump_event,
};

/// Dispatch a `gate` module event to the jump processor.
///
/// Handles `JumpEvent` only. Returns `Ok(true)` when the event was handled,
/// `Ok(false)` for all other event names so the caller can try the next handler.
pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<bool> {
    if event_name(&ev.type_) != "JumpEvent" {
        return Ok(false);
    }

    let checkpoint: i64 = ev
        .checkpoint
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let row = parse_jump_event(ev, checkpoint)?;
    insert_jump_event(pool, &row).await?;
    Ok(true)
}
