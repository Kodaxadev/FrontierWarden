use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{event_name, field_addr, field_u64, SuiEvent};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "VouchCreated" => vouch_created(pool, ev).await,
        "VouchRedeemed" => vouch_redeemed(pool, ev).await,
        _ => Ok(()),
    }
}

// VouchCreated → INSERT INTO vouches
// Event field is `stake` (not `stake_amount`) — matches the Move struct.
async fn vouch_created(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let vouch_id = field_addr(p, "vouch_id")?;
    let voucher = field_addr(p, "voucher")?;
    let vouchee = field_addr(p, "vouchee")?;
    let stake_amount = field_u64(p, "stake")?;

    sqlx::query(
        "INSERT INTO vouches (vouch_id, voucher, vouchee, stake_amount, created_tx)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (vouch_id) DO NOTHING",
    )
    .bind(&vouch_id)
    .bind(&voucher)
    .bind(&vouchee)
    .bind(stake_amount)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// VouchRedeemed → UPDATE vouches SET redeemed fields
async fn vouch_redeemed(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p = &ev.parsed_json;
    let vouch_id = field_addr(p, "vouch_id")?;
    let amount_returned = field_u64(p, "amount_returned")?;

    sqlx::query(
        "UPDATE vouches
         SET redeemed        = TRUE,
             amount_returned = $1,
             redeemed_tx     = $2,
             redeemed_at     = NOW()
         WHERE vouch_id = $3",
    )
    .bind(amount_returned)
    .bind(&ev.id.tx_digest)
    .bind(&vouch_id)
    .execute(pool)
    .await?;

    Ok(())
}
