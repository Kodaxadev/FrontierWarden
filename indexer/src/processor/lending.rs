use anyhow::Result;
use sqlx::PgPool;

use crate::rpc::{SuiEvent, event_name, field_addr, field_u64};

pub async fn handle(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    match event_name(&ev.type_) {
        "LoanIssued"    => loan_issued(pool, ev).await,
        "LoanRepaid"    => loan_repaid(pool, ev).await,
        "LoanDefaulted" => loan_defaulted(pool, ev).await,
        _               => Ok(()),
    }
}

// LoanIssued → INSERT INTO loans
async fn loan_issued(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p        = &ev.parsed_json;
    let loan_id  = field_addr(p, "loan_id")?;
    let borrower = field_addr(p, "borrower")?;
    let lender   = field_addr(p, "lender")?;
    let amount   = field_u64(p, "amount")?;

    sqlx::query(
        "INSERT INTO loans (loan_id, borrower, lender, amount, issued_tx)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (loan_id) DO NOTHING",
    )
    .bind(&loan_id)
    .bind(&borrower)
    .bind(&lender)
    .bind(amount)
    .bind(&ev.id.tx_digest)
    .execute(pool)
    .await?;

    Ok(())
}

// LoanRepaid → UPDATE loans SET repaid fields
async fn loan_repaid(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p       = &ev.parsed_json;
    let loan_id = field_addr(p, "loan_id")?;

    sqlx::query(
        "UPDATE loans
         SET repaid    = TRUE,
             repaid_tx = $1,
             repaid_at = NOW()
         WHERE loan_id = $2",
    )
    .bind(&ev.id.tx_digest)
    .bind(&loan_id)
    .execute(pool)
    .await?;

    Ok(())
}

// LoanDefaulted → UPDATE loans SET defaulted fields + vouch_slashed
async fn loan_defaulted(pool: &PgPool, ev: &SuiEvent) -> Result<()> {
    let p             = &ev.parsed_json;
    let loan_id       = field_addr(p, "loan_id")?;
    let vouch_slashed = field_u64(p, "vouch_slashed")?;

    sqlx::query(
        "UPDATE loans
         SET defaulted     = TRUE,
             vouch_slashed = $1,
             defaulted_tx  = $2,
             defaulted_at  = NOW()
         WHERE loan_id = $3",
    )
    .bind(vouch_slashed)
    .bind(&ev.id.tx_digest)
    .bind(&loan_id)
    .execute(pool)
    .await?;

    Ok(())
}
