use serde::{Deserialize, Serialize};

pub const REASON_ALLOW_FREE: &str = "ALLOW_FREE";
pub const REASON_ALLOW_TAXED: &str = "ALLOW_TAXED";
pub const REASON_DENY_SCORE_BELOW_THRESHOLD: &str = "DENY_SCORE_BELOW_THRESHOLD";
pub const REASON_DENY_NO_STANDING_ATTESTATION: &str = "DENY_NO_STANDING_ATTESTATION";
pub const REASON_ERROR_GATE_NOT_FOUND: &str = "ERROR_GATE_NOT_FOUND";
pub const REASON_ERROR_UNSUPPORTED_ACTION: &str = "ERROR_UNSUPPORTED_ACTION";

// Counterparty risk reason codes
pub const REASON_COUNTERPARTY_REQUIREMENTS_MET: &str = "COUNTERPARTY_REQUIREMENTS_MET";
pub const REASON_DENY_COUNTERPARTY_NO_SCORE: &str = "DENY_COUNTERPARTY_NO_SCORE";
pub const REASON_DENY_COUNTERPARTY_SCORE_TOO_LOW: &str = "DENY_COUNTERPARTY_SCORE_TOO_LOW";

// Bounty trust reason codes
pub const REASON_BOUNTY_TRUST_REQUIREMENTS_MET: &str = "BOUNTY_TRUST_REQUIREMENTS_MET";
pub const REASON_BOUNTY_TRUST_SCORE_BELOW_THRESHOLD: &str = "BOUNTY_TRUST_SCORE_BELOW_THRESHOLD";
pub const REASON_BOUNTY_TRUST_INSUFFICIENT_DATA: &str = "BOUNTY_TRUST_INSUFFICIENT_DATA";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustEvaluationRequest {
    #[serde(alias = "subject")]
    pub entity: String,
    pub action: String,
    pub context: TrustEvaluationContext,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustEvaluationContext {
    #[serde(alias = "gate")]
    pub gate_id: Option<String>,
    pub schema_id: Option<String>,
    pub minimum_score: Option<i64>,
    /// Accepted for v1 request compatibility/provenance — not yet used as active score filters.
    pub bounty_id: Option<String>,
    pub target: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustEvaluationResponse {
    pub api_version: &'static str,
    pub action: String,
    pub decision: &'static str,
    pub allow: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gate_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toll_multiplier: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toll_mist: Option<i64>,
    pub confidence: f64,
    pub reason: &'static str,
    pub explanation: String,
    pub subject: String,
    pub score: Option<i64>,
    pub threshold: Option<i64>,
    pub requirements: TrustRequirements,
    pub observed: TrustObserved,
    pub proof: TrustProof,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustRequirements {
    pub schema: String,
    pub threshold: Option<i64>,
    pub minimum_pass_score: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustObserved {
    pub score: Option<i64>,
    pub attestation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score_source: Option<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustProof {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gate_id: Option<String>,
    pub subject: String,
    pub checkpoint: Option<i64>,
    pub source: &'static str,
    pub schemas: Vec<String>,
    pub attestation_ids: Vec<String>,
    pub tx_digests: Vec<String>,
    pub warnings: Vec<String>,
}
