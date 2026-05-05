use crate::trust_db::{GatePolicy, StandingAttestation};
use crate::trust_types::{
    TrustEvaluationResponse, TrustObserved, TrustProof, TrustRequirements,
    REASON_ALLOW_FREE, REASON_ALLOW_TAXED, REASON_DENY_SCORE_BELOW_THRESHOLD,
};

pub(crate) fn compute_confidence(proof: &TrustProof, base: f64) -> f64 {
    let has_challenge = proof
        .warnings
        .iter()
        .any(|w| w.starts_with("ATTESTATION_UNDER_CHALLENGE:"));
    if has_challenge {
        return 0.5;
    }
    let has_staleness = proof
        .warnings
        .iter()
        .any(|w| w.starts_with("INDEXER_LAST_EVENT_STALE_SECONDS:"));
    if has_staleness {
        return (base * 0.7).max(0.3);
    }
    base
}

pub(crate) fn insufficient(
    subject: String,
    gate_id: Option<String>,
    reason: &'static str,
    explanation: String,
    action: String,
) -> TrustEvaluationResponse {
    let proof_bundle = TrustProof {
        gate_id: gate_id.clone(),
        subject: subject.clone(),
        checkpoint: None,
        source: "indexed_protocol_state",
        schemas: Vec::new(),
        attestation_ids: Vec::new(),
        tx_digests: Vec::new(),
        warnings: vec!["Decision could not be proven from indexed data.".to_owned()],
    };

    response_raw(
        "INSUFFICIENT_DATA",
        false,
        None,
        None,
        0.0,
        reason,
        explanation,
        subject,
        gate_id,
        proof_bundle,
        action,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn response(
    decision: &'static str,
    allow: bool,
    toll_multiplier: Option<i64>,
    toll_mist: Option<i64>,
    confidence: f64,
    reason: &'static str,
    explanation: String,
    subject: String,
    gate_id: Option<String>,
    schema: String,
    score: Option<i64>,
    threshold: Option<i64>,
    proof: TrustProof,
    action: &'static str,
    score_source: Option<&'static str>,
) -> TrustEvaluationResponse {
    TrustEvaluationResponse {
        api_version: "trust.v1",
        action: action.to_owned(),
        decision,
        allow,
        toll_multiplier,
        toll_mist,
        confidence,
        reason,
        explanation,
        subject,
        gate_id,
        score,
        threshold,
        requirements: TrustRequirements {
            schema,
            threshold,
            minimum_pass_score: 1,
        },
        observed: TrustObserved {
            score,
            attestation_id: proof.attestation_ids.first().cloned(),
            score_source,
        },
        proof,
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn response_counterparty(
    decision: &'static str,
    allow: bool,
    reason: &'static str,
    explanation: String,
    subject: String,
    schema: String,
    score: Option<i64>,
    minimum_score: i64,
    proof: TrustProof,
    action: &'static str,
    score_source: Option<&'static str>,
    confidence: f64,
) -> TrustEvaluationResponse {
    TrustEvaluationResponse {
        api_version: "trust.v1",
        action: action.to_owned(),
        decision,
        allow,
        toll_multiplier: None,
        toll_mist: None,
        confidence,
        reason,
        explanation,
        subject,
        gate_id: None,
        score,
        threshold: Some(minimum_score),
        requirements: TrustRequirements {
            schema,
            threshold: Some(minimum_score),
            minimum_pass_score: minimum_score,
        },
        observed: TrustObserved {
            score,
            attestation_id: proof.attestation_ids.first().cloned(),
            score_source,
        },
        proof,
    }
}

fn response_raw(
    decision: &'static str,
    allow: bool,
    toll_multiplier: Option<i64>,
    toll_mist: Option<i64>,
    confidence: f64,
    reason: &'static str,
    explanation: String,
    subject: String,
    gate_id: Option<String>,
    proof: TrustProof,
    action: String,
    score_source: Option<&'static str>,
) -> TrustEvaluationResponse {
    TrustEvaluationResponse {
        api_version: "trust.v1",
        action,
        decision,
        allow,
        toll_multiplier,
        toll_mist,
        confidence,
        reason,
        explanation,
        subject,
        gate_id,
        score: None,
        threshold: None,
        requirements: TrustRequirements {
            schema: String::new(),
            threshold: None,
            minimum_pass_score: 0,
        },
        observed: TrustObserved {
            score: None,
            attestation_id: None,
            score_source,
        },
        proof,
    }
}

pub(crate) fn classify_score(
    score: i64,
    ally_threshold: i64,
    base_toll_mist: i64,
) -> (&'static str, bool, Option<i64>, Option<i64>, &'static str) {
    if score <= 0 {
        return ("DENY", false, None, None, REASON_DENY_SCORE_BELOW_THRESHOLD);
    }
    if score >= ally_threshold {
        return ("ALLOW_FREE", true, Some(0), Some(0), REASON_ALLOW_FREE);
    }
    (
        "ALLOW_TAXED",
        true,
        Some(1),
        Some(base_toll_mist),
        REASON_ALLOW_TAXED,
    )
}

pub(crate) fn proof(
    schema: &str,
    subject: &str,
    gate_id: &str,
    policy: Option<&GatePolicy>,
    attestation: Option<&StandingAttestation>,
) -> TrustProof {
    let checkpoint = [
        policy.map(|p| p.checkpoint_seq),
        attestation.and_then(|a| a.checkpoint_seq),
    ]
    .into_iter()
    .flatten()
    .max();
    let mut tx_digests = Vec::new();
    if let Some(policy) = policy {
        tx_digests.push(policy.tx_digest.clone());
    }
    if let Some(attestation) = attestation {
        if !tx_digests.contains(&attestation.issued_tx) {
            tx_digests.push(attestation.issued_tx.clone());
        }
    }

    TrustProof {
        gate_id: Some(gate_id.to_owned()),
        subject: subject.to_owned(),
        checkpoint,
        source: "indexed_protocol_state",
        schemas: vec![schema.to_owned()],
        attestation_ids: attestation
            .map(|a| vec![a.attestation_id.clone()])
            .unwrap_or_default(),
        tx_digests,
        warnings: Vec::new(),
    }
}

/// Proof builder for counterparty_risk and bounty_trust — no gate policy involved.
pub(crate) fn proof_counterparty(
    schema: &str,
    subject: &str,
    attestation: Option<&StandingAttestation>,
) -> TrustProof {
    let checkpoint = attestation.and_then(|a| a.checkpoint_seq);
    let tx_digests = attestation
        .map(|a| vec![a.issued_tx.clone()])
        .unwrap_or_default();

    TrustProof {
        gate_id: None,
        subject: subject.to_owned(),
        checkpoint,
        source: "indexed_protocol_state",
        schemas: vec![schema.to_owned()],
        attestation_ids: attestation
            .map(|a| vec![a.attestation_id.clone()])
            .unwrap_or_default(),
        tx_digests,
        warnings: Vec::new(),
    }
}
