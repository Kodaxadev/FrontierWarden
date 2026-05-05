use anyhow::Result;
use sqlx::PgPool;

use crate::trust_db::{add_freshness_warnings, latest_standing_attestation, score_from_cache};
use crate::trust_response::{compute_confidence, proof_counterparty, response_counterparty};
use crate::trust_types::{
    TrustEvaluationRequest, TrustEvaluationResponse, REASON_BOUNTY_TRUST_INSUFFICIENT_DATA,
    REASON_BOUNTY_TRUST_REQUIREMENTS_MET, REASON_BOUNTY_TRUST_SCORE_BELOW_THRESHOLD,
    REASON_COUNTERPARTY_REQUIREMENTS_MET, REASON_DENY_COUNTERPARTY_NO_SCORE,
    REASON_DENY_COUNTERPARTY_SCORE_TOO_LOW,
};

const DEFAULT_MINIMUM_SCORE: i64 = 500;

pub(crate) async fn evaluate_counterparty_risk(
    pool: &PgPool,
    req: TrustEvaluationRequest,
    default_counterparty_schema: &str,
) -> Result<TrustEvaluationResponse> {
    let req_start = std::time::Instant::now();
    let subject = req.entity.trim().to_owned();
    let schema = req
        .context
        .schema_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(default_counterparty_schema)
        .to_owned();
    let minimum_score = req
        .context
        .minimum_score
        .filter(|&s| s > 0)
        .unwrap_or(DEFAULT_MINIMUM_SCORE);

    let t0 = std::time::Instant::now();
    let (attestation, cached) = tokio::try_join!(
        latest_standing_attestation(pool, &subject, &schema),
        score_from_cache(pool, &subject, &schema)
    )?;
    let attestation_ms = t0.elapsed().as_millis();
    let Some(attestation) = attestation else {
        let mut proof_bundle = proof_counterparty(&schema, &subject, None);
        let t0 = std::time::Instant::now();
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        let freshness_ms = t0.elapsed().as_millis();
        let confidence = compute_confidence(&proof_bundle, 0.8);
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            attestation_ms,
            freshness_ms,
            action = "counterparty_risk",
            decision = "DENY",
            reason = "no_attestation",
            confidence
        );
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
            None,
            confidence,
        ));
    };

    // Prefer cached score (oracle-aggregated), fall back to raw attestation value
    let (score, score_source) = if let Some(cached) = cached {
        (cached.value, Some("score_cache"))
    } else {
        (attestation.value, Some("attestation_raw"))
    };
    if score < minimum_score {
        let mut proof_bundle = proof_counterparty(&schema, &subject, Some(&attestation));
        let t0 = std::time::Instant::now();
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        let freshness_ms = t0.elapsed().as_millis();
        if let Some(challenge_id) = &attestation.active_challenge_id {
            proof_bundle
                .warnings
                .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
        }
        let confidence = compute_confidence(&proof_bundle, 0.8);
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            attestation_ms,
            freshness_ms,
            action = "counterparty_risk",
            decision = "DENY",
            score,
            minimum_score,
            score_source,
            confidence
        );
        return Ok(response_counterparty(
            "DENY",
            false,
            REASON_DENY_COUNTERPARTY_SCORE_TOO_LOW,
            format!(
                "{schema} score {score} is below the required minimum of {minimum_score}."
            ),
            subject,
            schema,
            Some(score),
            minimum_score,
            proof_bundle,
            "counterparty_risk",
            score_source,
            confidence,
        ));
    }

    let mut proof_bundle = proof_counterparty(&schema, &subject, Some(&attestation));
    let t0 = std::time::Instant::now();
    add_freshness_warnings(pool, &mut proof_bundle).await?;
    let freshness_ms = t0.elapsed().as_millis();
    if let Some(challenge_id) = &attestation.active_challenge_id {
        proof_bundle
            .warnings
            .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
    }
    let confidence = compute_confidence(&proof_bundle, 0.95);
    let total_ms = req_start.elapsed().as_millis();
    tracing::info!(
        total_ms,
        attestation_ms,
        freshness_ms,
        action = "counterparty_risk",
        decision = "ALLOW",
        score,
        confidence,
        score_source
    );
    Ok(response_counterparty(
        "ALLOW",
        true,
        REASON_COUNTERPARTY_REQUIREMENTS_MET,
        format!(
            "{schema} score {score} meets or exceeds the minimum threshold of {minimum_score}."
        ),
        subject,
        schema,
        Some(score),
        minimum_score,
        proof_bundle,
        "counterparty_risk",
        score_source,
        confidence,
    ))
}

pub(crate) async fn evaluate_bounty_trust(
    pool: &PgPool,
    req: TrustEvaluationRequest,
    default_bounty_schema: &str,
) -> Result<TrustEvaluationResponse> {
    let req_start = std::time::Instant::now();
    let subject = req.entity.trim().to_owned();
    let schema = req
        .context
        .schema_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(default_bounty_schema)
        .to_owned();
    let minimum_score = req
        .context
        .minimum_score
        .filter(|&s| s > 0)
        .unwrap_or(DEFAULT_MINIMUM_SCORE);

    let t0 = std::time::Instant::now();
    let (attestation, cached) = tokio::try_join!(
        latest_standing_attestation(pool, &subject, &schema),
        score_from_cache(pool, &subject, &schema)
    )?;
    let attestation_ms = t0.elapsed().as_millis();

    let Some(attestation) = attestation else {
        let mut proof_bundle = proof_counterparty(&schema, &subject, None);
        let t0 = std::time::Instant::now();
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        let freshness_ms = t0.elapsed().as_millis();
        let confidence = compute_confidence(&proof_bundle, 0.5);
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            attestation_ms,
            freshness_ms,
            action = "bounty_trust",
            decision = "INSUFFICIENT_DATA",
            reason = "no_attestation",
            confidence
        );
        return Ok(response_counterparty(
            "INSUFFICIENT_DATA",
            false,
            REASON_BOUNTY_TRUST_INSUFFICIENT_DATA,
            format!("No active {schema} attestation indexed for this entity; bounty eligibility cannot be determined."),
            subject,
            schema,
            None,
            minimum_score,
            proof_bundle,
            "bounty_trust",
            None,
            confidence,
        ));
    };

    let (score, score_source) = if let Some(cached) = cached {
        (cached.value, Some("score_cache"))
    } else {
        (attestation.value, Some("attestation_raw"))
    };

    if score < minimum_score {
        let mut proof_bundle = proof_counterparty(&schema, &subject, Some(&attestation));
        let t0 = std::time::Instant::now();
        add_freshness_warnings(pool, &mut proof_bundle).await?;
        let freshness_ms = t0.elapsed().as_millis();
        if let Some(challenge_id) = &attestation.active_challenge_id {
            proof_bundle
                .warnings
                .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
        }
        let confidence = compute_confidence(&proof_bundle, 0.8);
        let total_ms = req_start.elapsed().as_millis();
        tracing::info!(
            total_ms,
            attestation_ms,
            freshness_ms,
            action = "bounty_trust",
            decision = "DENY",
            score,
            minimum_score,
            score_source,
            confidence
        );
        return Ok(response_counterparty(
            "DENY",
            false,
            REASON_BOUNTY_TRUST_SCORE_BELOW_THRESHOLD,
            format!(
                "{schema} score {score} is below the bounty trust threshold of {minimum_score}."
            ),
            subject,
            schema,
            Some(score),
            minimum_score,
            proof_bundle,
            "bounty_trust",
            score_source,
            confidence,
        ));
    }

    let mut proof_bundle = proof_counterparty(&schema, &subject, Some(&attestation));
    let t0 = std::time::Instant::now();
    add_freshness_warnings(pool, &mut proof_bundle).await?;
    let freshness_ms = t0.elapsed().as_millis();
    if let Some(challenge_id) = &attestation.active_challenge_id {
        proof_bundle
            .warnings
            .push(format!("ATTESTATION_UNDER_CHALLENGE:{challenge_id}"));
    }
    let confidence = compute_confidence(&proof_bundle, 0.95);
    let total_ms = req_start.elapsed().as_millis();
    tracing::info!(
        total_ms,
        attestation_ms,
        freshness_ms,
        action = "bounty_trust",
        decision = "ALLOW",
        score,
        confidence,
        score_source
    );
    Ok(response_counterparty(
        "ALLOW",
        true,
        REASON_BOUNTY_TRUST_REQUIREMENTS_MET,
        format!(
            "{schema} score {score} meets or exceeds the bounty trust threshold of {minimum_score}."
        ),
        subject,
        schema,
        Some(score),
        minimum_score,
        proof_bundle,
        "bounty_trust",
        score_source,
        confidence,
    ))
}
