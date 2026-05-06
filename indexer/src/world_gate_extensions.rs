use anyhow::{Context, Result};
use serde_json::Value;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, normalize_sui_address, SuiEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GateExtensionEvent {
    Authorized(GateExtensionAuthorized),
    Revoked(GateExtensionRevoked),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateExtensionAuthorized {
    pub world_gate_id: String,
    pub assembly_key: TenantItemId,
    pub extension_type: String,
    pub previous_extension: Option<String>,
    pub owner_cap_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateExtensionRevoked {
    pub world_gate_id: String,
    pub assembly_key: TenantItemId,
    pub revoked_extension: String,
    pub owner_cap_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantItemId {
    pub item_id: i64,
    pub tenant: String,
}

pub fn is_frontierwarden_typename(actual: &str, expected: &str) -> bool {
    !expected.trim().is_empty() && actual.trim() == expected.trim()
}

pub fn parse_gate_extension_event(ev: &SuiEvent) -> Result<Option<GateExtensionEvent>> {
    match event_name(&ev.type_) {
        "ExtensionAuthorizedEvent" => {
            let p = &ev.parsed_json;
            Ok(Some(GateExtensionEvent::Authorized(
                GateExtensionAuthorized {
                    world_gate_id: normalize_sui_address(&field_addr(p, "assembly_id")?),
                    assembly_key: parse_key(p)?,
                    extension_type: field_typename(p, "extension_type")?,
                    previous_extension: field_opt_typename(p, "previous_extension"),
                    owner_cap_id: normalize_sui_address(&field_addr(p, "owner_cap_id")?),
                },
            )))
        }
        "ExtensionRevokedEvent" => {
            let p = &ev.parsed_json;
            Ok(Some(GateExtensionEvent::Revoked(GateExtensionRevoked {
                world_gate_id: normalize_sui_address(&field_addr(p, "assembly_id")?),
                assembly_key: parse_key(p)?,
                revoked_extension: field_typename(p, "revoked_extension")?,
                owner_cap_id: normalize_sui_address(&field_addr(p, "owner_cap_id")?),
            })))
        }
        _ => Ok(None),
    }
}

pub async fn handle(pool: &PgPool, ev: &SuiEvent, expected_fw_typename: &str) -> Result<()> {
    let Some(parsed) = parse_gate_extension_event(ev)? else {
        return Ok(());
    };

    match parsed {
        GateExtensionEvent::Authorized(auth) => {
            upsert_authorized(pool, ev, &auth, expected_fw_typename).await
        }
        GateExtensionEvent::Revoked(revoked) => {
            mark_revoked(pool, ev, &revoked, expected_fw_typename).await
        }
    }
}

async fn upsert_authorized(
    pool: &PgPool,
    ev: &SuiEvent,
    auth: &GateExtensionAuthorized,
    expected_fw_typename: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_extensions (
            world_gate_id, item_id, tenant, extension_type, previous_extension,
            owner_cap_id, active, authorized_tx_digest, authorized_event_seq,
            authorized_checkpoint_seq, revoked_extension, revoked_tx_digest,
            revoked_event_seq, revoked_checkpoint_seq, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, NULL, NULL, NULL, NULL, NOW())
         ON CONFLICT (world_gate_id) DO UPDATE SET
            item_id = EXCLUDED.item_id,
            tenant = EXCLUDED.tenant,
            extension_type = EXCLUDED.extension_type,
            previous_extension = EXCLUDED.previous_extension,
            owner_cap_id = EXCLUDED.owner_cap_id,
            active = TRUE,
            authorized_tx_digest = EXCLUDED.authorized_tx_digest,
            authorized_event_seq = EXCLUDED.authorized_event_seq,
            authorized_checkpoint_seq = EXCLUDED.authorized_checkpoint_seq,
            revoked_extension = NULL,
            revoked_tx_digest = NULL,
            revoked_event_seq = NULL,
            revoked_checkpoint_seq = NULL,
            updated_at = NOW()",
    )
    .bind(&auth.world_gate_id)
    .bind(auth.assembly_key.item_id)
    .bind(&auth.assembly_key.tenant)
    .bind(&auth.extension_type)
    .bind(&auth.previous_extension)
    .bind(&auth.owner_cap_id)
    .bind(&ev.id.tx_digest)
    .bind(event_seq(ev))
    .bind(checkpoint_seq(ev))
    .execute(pool)
    .await?;

    update_fw_extension_flag(
        pool,
        &auth.world_gate_id,
        is_frontierwarden_typename(&auth.extension_type, expected_fw_typename),
    )
    .await
}

async fn mark_revoked(
    pool: &PgPool,
    ev: &SuiEvent,
    revoked: &GateExtensionRevoked,
    expected_fw_typename: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO world_gate_extensions (
            world_gate_id, item_id, tenant, extension_type, previous_extension,
            owner_cap_id, active, authorized_tx_digest, authorized_event_seq,
            authorized_checkpoint_seq, revoked_extension, revoked_tx_digest,
            revoked_event_seq, revoked_checkpoint_seq, updated_at
         )
         VALUES ($1, $2, $3, NULL, NULL, $4, FALSE, NULL, NULL, NULL, $5, $6, $7, $8, NOW())
         ON CONFLICT (world_gate_id) DO UPDATE SET
            item_id = EXCLUDED.item_id,
            tenant = EXCLUDED.tenant,
            owner_cap_id = EXCLUDED.owner_cap_id,
            active = FALSE,
            revoked_extension = EXCLUDED.revoked_extension,
            revoked_tx_digest = EXCLUDED.revoked_tx_digest,
            revoked_event_seq = EXCLUDED.revoked_event_seq,
            revoked_checkpoint_seq = EXCLUDED.revoked_checkpoint_seq,
            updated_at = NOW()",
    )
    .bind(&revoked.world_gate_id)
    .bind(revoked.assembly_key.item_id)
    .bind(&revoked.assembly_key.tenant)
    .bind(&revoked.owner_cap_id)
    .bind(&revoked.revoked_extension)
    .bind(&ev.id.tx_digest)
    .bind(event_seq(ev))
    .bind(checkpoint_seq(ev))
    .execute(pool)
    .await?;

    if is_frontierwarden_typename(&revoked.revoked_extension, expected_fw_typename) {
        update_fw_extension_flag(pool, &revoked.world_gate_id, false).await?;
    }

    Ok(())
}

async fn update_fw_extension_flag(pool: &PgPool, world_gate_id: &str, active: bool) -> Result<()> {
    sqlx::query(
        "UPDATE world_gates SET fw_extension_active = $1, updated_at = NOW() WHERE gate_id = $2",
    )
    .bind(active)
    .bind(world_gate_id)
    .execute(pool)
    .await?;
    Ok(())
}

fn parse_key(payload: &Value) -> Result<TenantItemId> {
    let key = payload
        .get("assembly_key")
        .context("missing field 'assembly_key'")?;
    parse_tenant_item_id(key)
}

fn parse_tenant_item_id(value: &Value) -> Result<TenantItemId> {
    let item_id = value
        .get("item_id")
        .or_else(|| value.get("itemId"))
        .map(parse_item_id)
        .transpose()?
        .context("TenantItemId missing item_id")?;
    let tenant = value
        .get("tenant")
        .and_then(Value::as_str)
        .context("TenantItemId missing tenant")?
        .to_string();
    Ok(TenantItemId { item_id, tenant })
}

fn parse_item_id(value: &Value) -> Result<i64> {
    match value {
        Value::String(s) => s
            .parse::<i64>()
            .with_context(|| format!("invalid item_id {s}")),
        Value::Number(n) => n.as_i64().context("item_id out of i64 range"),
        _ => anyhow::bail!("item_id must be string or number"),
    }
}

fn field_typename(payload: &Value, key: &'static str) -> Result<String> {
    let value = payload
        .get(key)
        .with_context(|| format!("missing field '{key}'"))?;
    parse_typename_value(value).with_context(|| format!("field '{key}': invalid TypeName"))
}

fn field_opt_typename(payload: &Value, key: &'static str) -> Option<String> {
    payload.get(key).and_then(|value| {
        if value.is_null() {
            None
        } else {
            parse_typename_value(value).ok()
        }
    })
}

fn parse_typename_value(value: &Value) -> Result<String> {
    if let Some(s) = value.as_str() {
        return Ok(s.to_owned());
    }
    for key in ["name", "type", "repr", "value"] {
        if let Some(s) = value.get(key).and_then(Value::as_str) {
            return Ok(s.to_owned());
        }
    }
    anyhow::bail!("expected string or TypeName object")
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
