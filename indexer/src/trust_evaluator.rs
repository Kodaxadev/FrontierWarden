use anyhow::{anyhow, Result};
use sqlx::PgPool;

use crate::trust_types::{
    TrustEvaluationRequest, TrustEvaluationResponse, TrustObserved, TrustProof, TrustRequirements,
    REASON_ALLOW_FREE, REASON_ALLOW_TAXED, REASON_DENY_NO_STANDING_ATTESTATION,
    REASON_DENY_SCORE_BELOW_THRESHOLD, REASON_ERROR_GATE_NOT_FOUND,
    REASON_ERROR_UNSUPPORTED_ACTION,
};

const DEFAULT_GATE_SCHEMA: &str = "TRIBE_STANDING";

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

pub async fn evaluate_gate_access(
    pool: &PgPool,
    req: TrustEvaluationRequest,
) -> Result<TrustEvaluationResponse> {
    let action = req.action.trim();
    let subject = req.entity.trim().to_owned();
    let gate_id = req.context.gate_id.trim().to_owned();
    let schema = req
        .context
        .schema_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_GATE_SCHEMA)
        .to_owned();

    if subject.is_empty() || gate_id.is_empty() {
        return Err(anyhow!("entity and context.gateId are required"));
    }

    if action != "gate_access" {
        return Ok(insufficient(
            subject,
            gate_id,
            schema,
            REASON_ERROR_UNSUPPORTED_ACTION,
            format!("Unsupported trust action '{action}'."),
        ));
    }

    let policy = latest_gate_policy(pool, &gate_id).await?;
    let Some(policy) = policy else {
        return Ok(insufficient(
            subject,
            gate_id,
            schema,
            REASON_ERROR_GATE_NOT_FOUND,
            "No indexed gate policy exists for this gate.".to_owned(),
        ));
    };

    let attestation = latest_standing_attestation(pool, &subject, &schema).await?;
    let Some(attestation) = attestation else {
        let proof_bundle = proof(&schema, &subject, &gate_id, Some(&policy), None);
        return Ok(response(
            "DENY",
            false,
            None,
            None,
            0.0,
            REASON_DENY_NO_STANDING_ATTESTATION,
            format!("No active {schema} attestation is indexed for this subject."),
            subject,
            gate_id,
            schema,
            None,
            Some(policy.ally_threshold),
            proof_bundle,
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
    let proof_bundle = proof(
        &schema,
        &subject,
        &gate_id,
        Some(&policy),
        Some(&attestation),
    );
    Ok(response(
        decision,
        allow,
        toll_multiplier,
        toll_mist,
        1.0,
        reason,
        explanation,
        subject,
        gate_id,
        schema,
        Some(score),
        Some(policy.ally_threshold),
        proof_bundle,
    ))
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
    gate_id: String,
    schema: String,
    reason: &'static str,
    explanation: String,
) -> TrustEvaluationResponse {
    let proof_bundle = TrustProof {
        gate_id: gate_id.clone(),
        subject: subject.clone(),
        checkpoint: None,
        source: "indexed_protocol_state",
        schemas: vec![schema.clone()],
        attestation_ids: Vec::new(),
        tx_digests: Vec::new(),
        warnings: vec!["Decision could not be proven from indexed data.".to_owned()],
    };

    response(
        "INSUFFICIENT_DATA",
        false,
        None,
        None,
        0.0,
        reason,
        explanation,
        subject,
        gate_id,
        schema.clone(),
        None,
        None,
        proof_bundle,
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
    gate_id: String,
    schema: String,
    score: Option<i64>,
    threshold: Option<i64>,
    proof: TrustProof,
) -> TrustEvaluationResponse {
    TrustEvaluationResponse {
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
        gate_id: gate_id.to_owned(),
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
