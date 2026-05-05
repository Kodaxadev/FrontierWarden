use anyhow::{anyhow, Result};
use sqlx::PgPool;

use crate::trust_db::{
    add_freshness_warnings, apply_world_gate_warnings, latest_gate_policy,
    latest_standing_attestation, score_from_cache, world_gate_for_policy,
};
use crate::trust_response::{classify_score, compute_confidence, insufficient, proof, response};
use crate::trust_types::{
    TrustEvaluationRequest, TrustEvaluationResponse, REASON_ALLOW_FREE, REASON_ALLOW_TAXED,
    REASON_DENY_NO_STANDING_ATTESTATION, REASON_ERROR_GATE_NOT_FOUND,
};

pub(crate) async fn evaluate_gate_access(
    pool: &PgPool,
    req: TrustEvaluationRequest,
    default_gate_schema: &str,
) -> Result<TrustEvaluationResponse> {
    let req_start = std::time::Instant::now();
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
        .unwrap_or(default_gate_schema)
        .to_owned();

    // Run independent queries concurrently
    let t0 = std::time::Instant::now();
    let (maybe_policy, attestation, cached, world_gate) = tokio::try_join!(
        latest_gate_policy(pool, &gate_id),
        latest_standing_attestation(pool, &subject, &schema),
        score_from_cache(pool, &subject, &schema),
        world_gate_for_policy(pool, &gate_id)
    )?;
    let parallel_ms = t0.elapsed().as_millis();

    let Some(policy) = maybe_policy else {
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            parallel_ms,
            action = "gate_access",
            decision = "INSUFFICIENT",
            reason = "gate_not_found"
        );
        return Ok(insufficient(
            subject,
            Some(gate_id),
            REASON_ERROR_GATE_NOT_FOUND,
            "No indexed gate policy exists for this gate.".to_owned(),
            "gate_access".to_owned(),
        ));
    };

    let Some(attestation) = attestation else {
        let mut proof_bundle = proof(&schema, &subject, &gate_id, Some(&policy), None);
        apply_world_gate_warnings(world_gate.as_ref(), &mut proof_bundle);
        let t0 = std::time::Instant::now();
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        let freshness_ms = t0.elapsed().as_millis();
        let confidence = compute_confidence(&proof_bundle, 0.8);
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            parallel_ms,
            freshness_ms,
            action = "gate_access",
            decision = "DENY",
            reason = "no_attestation",
            confidence
        );
        return Ok(response(
            "DENY",
            false,
            None,
            None,
            confidence,
            REASON_DENY_NO_STANDING_ATTESTATION,
            format!("No active {schema} attestation is indexed for this subject."),
            subject,
            Some(gate_id),
            schema,
            None,
            Some(policy.ally_threshold),
            proof_bundle,
            "gate_access",
            None,
        ));
    };

    // Prefer cached score (oracle-aggregated), fall back to raw attestation value
    let (score, score_source) = if let Some(cached) = cached {
        (cached.value, Some("score_cache"))
    } else {
        (attestation.value, Some("attestation_raw"))
    };
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
    apply_world_gate_warnings(world_gate.as_ref(), &mut proof_bundle);
    let t0 = std::time::Instant::now();
    add_freshness_warnings(pool, &mut proof_bundle).await?;
    let freshness_ms = t0.elapsed().as_millis();
    if let Some(challenge_id) = &attestation.active_challenge_id {
        proof_bundle
            .warnings
            .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
    }
    let confidence = compute_confidence(&proof_bundle, 1.0);
    let total_ms = req_start.elapsed().as_millis();
    tracing::info!(
        total_ms,
        parallel_ms,
        freshness_ms,
        action = "gate_access",
        decision,
        score,
        threshold = policy.ally_threshold,
        score_source
    );
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
        score_source,
    ))
}
