use anyhow::{anyhow, Result};
use sqlx::PgPool;

use crate::trust_freshness;
use crate::trust_types::{
    TrustEvaluationRequest, TrustEvaluationResponse, TrustObserved, TrustProof, TrustRequirements,
    REASON_ALLOW_FREE, REASON_ALLOW_TAXED, REASON_COUNTERPARTY_REQUIREMENTS_MET,
    REASON_DENY_COUNTERPARTY_NO_SCORE, REASON_DENY_COUNTERPARTY_SCORE_TOO_LOW,
    REASON_DENY_NO_STANDING_ATTESTATION, REASON_DENY_SCORE_BELOW_THRESHOLD,
    REASON_ERROR_GATE_NOT_FOUND, REASON_ERROR_UNSUPPORTED_ACTION,
};

const DEFAULT_GATE_SCHEMA: &str = "TRIBE_STANDING";
const DEFAULT_COUNTERPARTY_SCHEMA: &str = "TRIBE_STANDING";
const DEFAULT_MINIMUM_SCORE: i64 = 500;

#[derive(sqlx::FromRow)]
pub(crate) struct GatePolicy {
    pub(crate) ally_threshold: i64,
    pub(crate) base_toll_mist: i64,
    pub(crate) tx_digest: String,
    pub(crate) checkpoint_seq: i64,
}

#[derive(sqlx::FromRow)]
pub(crate) struct StandingAttestation {
    pub(crate) attestation_id: String,
    pub(crate) value: i64,
    pub(crate) issued_tx: String,
    pub(crate) checkpoint_seq: Option<i64>,
}

/// Main entry point: dispatches to the appropriate evaluator based on action.
pub async fn evaluate(pool: &PgPool, req: TrustEvaluationRequest) -> Result<TrustEvaluationResponse> {
    let action = req.action.trim();
    match action {
        "gate_access" => evaluate_gate_access(pool, req).await,
        "counterparty_risk" => evaluate_counterparty_risk(pool, req).await,
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

pub async fn evaluate_gate_access(
    pool: &PgPool,
    req: TrustEvaluationRequest,
) -> Result<TrustEvaluationResponse> {
    let subject = req.entity.trim().to_owned();
    let gate_id = req
        .context
        .gate_id
        .as_deref()
        .map(str::trim)
        .ok_or_else(|| anyhow!("context.gateId is required for gate_access"))?
        .to_owned();
    let schema = req
        .context
        .schema_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_GATE_SCHEMA)
        .to_owned();

    let policy = latest_gate_policy(pool, &gate_id).await?;
    let Some(policy) = policy else {
        return Ok(insufficient(
            subject,
            Some(gate_id),
            REASON_ERROR_GATE_NOT_FOUND,
            "No indexed gate policy exists for this gate.".to_owned(),
            "gate_access".to_owned(),
        ));
    };

    let attestation = latest_standing_attestation(pool, &subject, &schema).await?;
    let Some(attestation) = attestation else {
        let mut proof_bundle = proof(&schema, &subject, &gate_id, Some(&policy), None);
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        return Ok(response(
            "DENY",
            false,
            None,
            None,
            0.0,
            REASON_DENY_NO_STANDING_ATTESTATION,
            format!("No active {schema} attestation is indexed for this subject."),
            subject,
            Some(gate_id),
            schema,
            None,
            Some(policy.ally_threshold),
            proof_bundle,
            "gate_access",
        ));
    };

    let score = attestation.value;
    let (decision, allow, toll_multiplier, toll_mist, reason) =
        classify_score(score, policy.ally_threshold, policy.base_toll_mist);
    let explanation = match reason {
        REASON_ALLOW_FREE => format!("{schema} score meets or exceeds this gate's ally threshold."),
        REASON_ALLOW_TAXED => {
            format!("{schema} score is positive but below this gate's ally threshold.")
        }
        _ => "Score is non-positive, matching the gate contract's blocked tier.".to_owned(),
    };
    let mut proof_bundle = proof(
        &schema,
        &subject,
        &gate_id,
        Some(&policy),
        Some(&attestation),
    );
    add_freshness_warnings(pool, &mut proof_bundle).await?;
    add_challenge_warning(pool, &mut proof_bundle, &attestation.attestation_id).await?;
    let confidence = compute_confidence(&proof_bundle, 1.0);
    Ok(response(
        decision,
        allow,
        toll_multiplier,
        toll_mist,
        confidence,
        reason,
        explanation,
        subject,
        Some(gate_id),
        schema,
        Some(score),
        Some(policy.ally_threshold),
        proof_bundle,
        "gate_access",
    ))
}

pub async fn evaluate_counterparty_risk(
    pool: &PgPool,
    req: TrustEvaluationRequest,
) -> Result<TrustEvaluationResponse> {
    let subject = req.entity.trim().to_owned();
    let schema = req
        .context
        .schema_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_COUNTERPARTY_SCHEMA)
        .to_owned();
    let minimum_score = req
        .context
        .minimum_score
        .filter(|&s| s > 0)
        .unwrap_or(DEFAULT_MINIMUM_SCORE);

    let attestation = latest_standing_attestation(pool, &subject, &schema).await?;
    let Some(attestation) = attestation else {
        let mut proof_bundle = proof_counterparty(&schema, &subject, None);
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        return Ok(response_counterparty(
            "DENY",
            false,
            REASON_DENY_COUNTERPARTY_NO_SCORE,
            format!("No active {schema} attestation is indexed for this entity."),
            subject,
            schema,
            None,
            minimum_score,
            proof_bundle,
            "counterparty_risk",
        ));
    };

    let score = attestation.value;
    if score < minimum_score {
        let mut proof_bundle =
            proof_counterparty(&schema, &subject, Some(&attestation));
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        add_challenge_warning(pool, &mut proof_bundle, &attestation.attestation_id).await?;
        let _confidence = compute_confidence(&proof_bundle, 0.9);
        return Ok(response_counterparty(
            "DENY",
            false,
            REASON_DENY_COUNTERPARTY_SCORE_TOO_LOW,
            format!(
                "{schema} score {} is below the required minimum of {}.",
                score, minimum_score
            ),
            subject,
            schema,
            Some(score),
            minimum_score,
            proof_bundle,
            "counterparty_risk",
        ));
    }

    let mut proof_bundle = proof_counterparty(&schema, &subject, Some(&attestation));
    add_freshness_warnings(pool, &mut proof_bundle).await?;
    add_challenge_warning(pool, &mut proof_bundle, &attestation.attestation_id).await?;
    let _confidence = compute_confidence(&proof_bundle, 0.95);
    Ok(response_counterparty(
        "ALLOW",
        true,
        REASON_COUNTERPARTY_REQUIREMENTS_MET,
        format!(
            "{schema} score {} meets or exceeds the minimum threshold of {}.",
            score, minimum_score
        ),
        subject,
        schema,
        Some(score),
        minimum_score,
        proof_bundle,
        "counterparty_risk",
    ))
}

/// If the attestation used in this decision has an unresolved fraud challenge,
/// add a warning and reduce confidence.
async fn add_challenge_warning(
    pool: &PgPool,
    proof: &mut TrustProof,
    attestation_id: &str,
) -> Result<()> {
    let active_challenge: Option<(String, String)> = sqlx::query_as(
        "SELECT challenge_id, attestation_id
         FROM fraud_challenges
         WHERE attestation_id = $1 AND NOT resolved
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(attestation_id)
    .fetch_optional(pool)
    .await?;

    if let Some((challenge_id, _att_id)) = active_challenge {
        proof
            .warnings
            .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
    }

    Ok(())
}

/// Reduce confidence when proof warnings indicate data quality issues.
fn compute_confidence(proof: &TrustProof, base: f64) -> f64 {
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

async fn latest_gate_policy(pool: &PgPool, gate_id: &str) -> Result<Option<GatePolicy>> {
    sqlx::query_as::<_, GatePolicy>(
        "SELECT ally_threshold, base_toll_mist, tx_digest, checkpoint_seq
         FROM gate_config_updates
         WHERE gate_id = $1
         ORDER BY checkpoint_seq DESC, indexed_at DESC
         LIMIT 1",
    )
    .bind(gate_id)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

async fn latest_standing_attestation(
    pool: &PgPool,
    subject: &str,
    schema: &str,
) -> Result<Option<StandingAttestation>> {
    sqlx::query_as::<_, StandingAttestation>(
        "SELECT a.attestation_id, a.value, a.issued_tx,
                NULLIF(MAX(r.checkpoint_seq), 0)::BIGINT AS checkpoint_seq
         FROM attestations a
         LEFT JOIN raw_events r ON r.tx_digest = a.issued_tx
         WHERE a.subject = $1 AND a.schema_id = $2 AND NOT a.revoked
         GROUP BY a.attestation_id, a.value, a.issued_tx, a.issued_at
         ORDER BY a.issued_at DESC
         LIMIT 1",
    )
    .bind(subject)
    .bind(schema)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
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
    )
}

#[allow(clippy::too_many_arguments)]
fn response(
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
        },
        proof,
    }
}

/// Response helper for counterparty_risk — no gate-specific fields.
#[allow(clippy::too_many_arguments)]
fn response_counterparty(
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
) -> TrustEvaluationResponse {
    TrustEvaluationResponse {
        api_version: "trust.v1",
        action: action.to_owned(),
        decision,
        allow,
        toll_multiplier: None,
        toll_mist: None,
        confidence: if allow { 0.95 } else { 0.0 },
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

async fn add_freshness_warnings(pool: &PgPool, proof: &mut TrustProof) -> Result<()> {
    let freshness = trust_freshness::latest(pool).await?;
    proof
        .warnings
        .extend(trust_freshness::warnings(proof.checkpoint, &freshness));
    Ok(())
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

/// Proof builder for counterparty_risk — no gate policy involved.
fn proof_counterparty(
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
