use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_u64, normalize_sui_address, SuiEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BindingEvent {
    Bound(GatePolicyBound),
    Unbound(GatePolicyUnbound),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatePolicyBound {
    pub gate_policy_id: String,
    pub world_gate_id: String,
    pub owner: String,
    pub epoch: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatePolicyUnbound {
    pub gate_policy_id: String,
    pub world_gate_id: String,
    pub owner: String,
    pub epoch: i64,
}

pub fn parse_gate_policy_binding_event(ev: &SuiEvent) -> Result<Option<BindingEvent>> {
    match event_name(&ev.type_) {
        "GatePolicyBoundToWorldGate" => {
            let p = &ev.parsed_json;
            Ok(Some(BindingEvent::Bound(GatePolicyBound {
                gate_policy_id: normalize_sui_address(&field_addr(p, "gate_policy_id")?),
                world_gate_id: normalize_sui_address(&field_addr(p, "world_gate_id")?),
                owner: normalize_sui_address(&field_addr(p, "owner")?),
                epoch: field_u64(p, "epoch")?,
            })))
        }
        "GatePolicyUnboundFromWorldGate" => {
            let p = &ev.parsed_json;
            Ok(Some(BindingEvent::Unbound(GatePolicyUnbound {
                gate_policy_id: normalize_sui_address(&field_addr(p, "gate_policy_id")?),
                world_gate_id: normalize_sui_address(&field_addr(p, "world_gate_id")?),
                owner: normalize_sui_address(&field_addr(p, "owner")?),
                epoch: field_u64(p, "epoch")?,
            })))
        }
        _ => Ok(None),
    }
}

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let Some(parsed) = parse_gate_policy_binding_event(ev)? else {
        return Ok(());
    };

    match parsed {
        BindingEvent::Bound(bound) => upsert_bound(pool, ev, &bound).await,
        BindingEvent::Unbound(unbound) => mark_unbound(pool, ev, &unbound).await,
    }
}

async fn upsert_bound(pool: &PgPool, ev: &SuiEvent, bound: &GatePolicyBound) -> Result<()> {
    sqlx::query(
        "INSERT INTO gate_policy_world_bindings (
            gate_policy_id, world_gate_id, owner, active, bound_tx_digest,
            bound_event_seq, bound_checkpoint, unbound_tx_digest, unbound_event_seq,
            unbound_checkpoint, updated_at
         )
         VALUES ($1, $2, $3, TRUE, $4, $5, $6, NULL, NULL, NULL, NOW())
         ON CONFLICT (gate_policy_id) DO UPDATE SET
            world_gate_id = EXCLUDED.world_gate_id,
            owner = EXCLUDED.owner,
            active = TRUE,
            bound_tx_digest = EXCLUDED.bound_tx_digest,
            bound_event_seq = EXCLUDED.bound_event_seq,
            bound_checkpoint = EXCLUDED.bound_checkpoint,
            unbound_tx_digest = NULL,
            unbound_event_seq = NULL,
            unbound_checkpoint = NULL,
            updated_at = NOW()",
    )
    .bind(&bound.gate_policy_id)
    .bind(&bound.world_gate_id)
    .bind(&bound.owner)
    .bind(&ev.id.tx_digest)
    .bind(event_seq(ev))
    .bind(checkpoint_seq(ev))
    .execute(pool)
    .await?;
    Ok(())
}

async fn mark_unbound(pool: &PgPool, ev: &SuiEvent, unbound: &GatePolicyUnbound) -> Result<()> {
    sqlx::query(
        "INSERT INTO gate_policy_world_bindings (
            gate_policy_id, world_gate_id, owner, active, bound_tx_digest,
            bound_event_seq, bound_checkpoint, unbound_tx_digest, unbound_event_seq,
            unbound_checkpoint, updated_at
         )
         VALUES ($1, $2, $3, FALSE, NULL, NULL, NULL, $4, $5, $6, NOW())
         ON CONFLICT (gate_policy_id) DO UPDATE SET
            world_gate_id = EXCLUDED.world_gate_id,
            owner = EXCLUDED.owner,
            active = FALSE,
            unbound_tx_digest = EXCLUDED.unbound_tx_digest,
            unbound_event_seq = EXCLUDED.unbound_event_seq,
            unbound_checkpoint = EXCLUDED.unbound_checkpoint,
            updated_at = NOW()",
    )
    .bind(&unbound.gate_policy_id)
    .bind(&unbound.world_gate_id)
    .bind(&unbound.owner)
    .bind(&ev.id.tx_digest)
    .bind(event_seq(ev))
    .bind(checkpoint_seq(ev))
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
