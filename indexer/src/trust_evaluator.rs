use anyhow::Result;
use sqlx::PgPool;

use crate::trust_eval_gate::evaluate_gate_access;
use crate::trust_eval_score::{evaluate_bounty_trust, evaluate_counterparty_risk};
// Private import for the dispatcher's unsupported-action arm (non-test only; test build
// gets this symbol via the pub(crate) re-export below to avoid a duplicate-import error).
#[cfg(not(test))]
use crate::trust_response::insufficient;
use crate::trust_types::{
    TrustEvaluationRequest, TrustEvaluationResponse, REASON_ERROR_UNSUPPORTED_ACTION,
};

// Re-exports for test compatibility — trust_evaluator_tests imports these paths.
#[cfg(test)]
pub(crate) use crate::trust_db::{GatePolicy, StandingAttestation};
#[cfg(test)]
pub(crate) use crate::trust_response::{classify_score, insufficient, proof};

/// Main entry point: dispatches to the appropriate evaluator based on action.
pub async fn evaluate(
    pool: &PgPool,
    req: TrustEvaluationRequest,
    default_gate_schema: &str,
    default_counterparty_schema: &str,
    default_bounty_schema: &str,
) -> Result<TrustEvaluationResponse> {
    let action = req.action.trim();
    match action {
        "gate_access" => evaluate_gate_access(pool, req, default_gate_schema).await,
        "counterparty_risk" => {
            evaluate_counterparty_risk(pool, req, default_counterparty_schema).await
        }
        "bounty_trust" => evaluate_bounty_trust(pool, req, default_bounty_schema).await,
        _ => {
            let subject = req.entity.trim().to_owned();
            let action_owned = action.to_owned();
            Ok(insufficient(
                subject.clone(),
                None,
                REASON_ERROR_UNSUPPORTED_ACTION,
                format!("Unsupported trust action '{action}'."),
                action_owned,
            ))
        }
    }
}
