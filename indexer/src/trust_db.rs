use anyhow::Result;
use sqlx::PgPool;

use crate::trust_freshness;
use crate::trust_types::TrustProof;

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
    pub(crate) active_challenge_id: Option<String>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct CachedScore {
    pub(crate) value: i64,
}

#[derive(sqlx::FromRow)]
pub(crate) struct WorldGateProjection {
    pub(crate) status: String,
    pub(crate) linked_gate_id: Option<String>,
}

pub(crate) async fn latest_gate_policy(
    pool: &PgPool,
    gate_id: &str,
) -> Result<Option<GatePolicy>> {
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

pub(crate) async fn latest_standing_attestation(
    pool: &PgPool,
    subject: &str,
    schema: &str,
) -> Result<Option<StandingAttestation>> {
    sqlx::query_as::<_, StandingAttestation>(
        "WITH latest AS (
             SELECT attestation_id, value, issued_tx, issued_at
             FROM attestations
             WHERE subject = $1 AND schema_id = $2 AND NOT revoked
             ORDER BY issued_at DESC
             LIMIT 1
           ),
           active_challenge AS (
             SELECT fc.attestation_id, fc.challenge_id
             FROM fraud_challenges fc
             JOIN latest l ON l.attestation_id = fc.attestation_id
             WHERE NOT fc.resolved
             ORDER BY fc.created_at DESC
             LIMIT 1
           )
           SELECT l.attestation_id, l.value, l.issued_tx,
                  r.checkpoint_seq::BIGINT AS checkpoint_seq,
                  ac.challenge_id AS active_challenge_id
           FROM latest l
           LEFT JOIN raw_events r ON r.tx_digest = l.issued_tx
           LEFT JOIN active_challenge ac ON ac.attestation_id = l.attestation_id",
    )
    .bind(subject)
    .bind(schema)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

/// Fetch the latest cached score for a subject (profile owner) and schema.
/// Joins profiles by owner to score_cache, returning the oracle-aggregated score if available.
pub(crate) async fn score_from_cache(
    pool: &PgPool,
    subject: &str,
    schema: &str,
) -> Result<Option<CachedScore>> {
    sqlx::query_as::<_, CachedScore>(
        "SELECT sc.value
         FROM score_cache sc
         JOIN profiles p ON p.profile_id = sc.profile_id
         WHERE p.owner = $1 AND sc.schema_id = $2
         LIMIT 1",
    )
    .bind(subject)
    .bind(schema)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn world_gate_for_policy(
    pool: &PgPool,
    gate_id: &str,
) -> Result<Option<WorldGateProjection>> {
    sqlx::query_as::<_, WorldGateProjection>(
        "SELECT status, linked_gate_id
         FROM world_gates
         WHERE fw_gate_policy_id = $1 OR gate_id = $1
         ORDER BY fw_extension_active DESC, updated_at DESC
         LIMIT 1",
    )
    .bind(gate_id)
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

pub(crate) fn apply_world_gate_warnings(
    world_gate: Option<&WorldGateProjection>,
    proof: &mut TrustProof,
) {
    let Some(world_gate) = world_gate else {
        return;
    };

    if world_gate.status != "online" {
        proof
            .warnings
            .push(format!("WARN_WORLD_GATE_OFFLINE:World gate status is {}.", world_gate.status));
    }
    if world_gate.linked_gate_id.is_none() {
        proof
            .warnings
            .push("WARN_WORLD_GATE_NOT_LINKED:World gate has no linked gate.".to_owned());
    }
}

pub(crate) async fn add_freshness_warnings(pool: &PgPool, proof: &mut TrustProof) -> Result<()> {
    let freshness = trust_freshness::latest(pool).await?;
    proof
        .warnings
        .extend(trust_freshness::warnings(proof.checkpoint, &freshness));
    Ok(())
}
