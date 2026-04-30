use crate::{
    trust_evaluator::{classify_score, insufficient, proof, GatePolicy, StandingAttestation},
    trust_types::{
        REASON_ALLOW_FREE, REASON_ALLOW_TAXED, REASON_DENY_NO_STANDING_ATTESTATION,
        REASON_DENY_SCORE_BELOW_THRESHOLD, REASON_ERROR_GATE_NOT_FOUND,
    },
};

fn sample_policy() -> GatePolicy {
    GatePolicy {
        ally_threshold: 500,
        base_toll_mist: 100_000_000,
        tx_digest: "policy_tx".to_owned(),
        checkpoint_seq: 10,
    }
}

fn sample_attestation(value: i64) -> StandingAttestation {
    StandingAttestation {
        attestation_id: "0xattestation".to_owned(),
        value,
        issued_tx: "attestation_tx".to_owned(),
        checkpoint_seq: Some(11),
    }
}

#[test]
fn proof_uses_latest_checkpoint_and_distinct_txs() {
    let policy = sample_policy();
    let attestation = sample_attestation(750);
    let bundle = proof(
        "TRIBE_STANDING",
        "0xsubject",
        "0xgate",
        Some(&policy),
        Some(&attestation),
    );

    assert_eq!(bundle.checkpoint, Some(11));
    assert_eq!(bundle.gate_id, Some("0xgate".to_owned()));
    assert_eq!(bundle.subject, "0xsubject");
    assert_eq!(bundle.source, "indexed_protocol_state");
    assert_eq!(bundle.schemas, vec!["TRIBE_STANDING"]);
    assert_eq!(bundle.attestation_ids, vec!["0xattestation"]);
    assert_eq!(bundle.tx_digests, vec!["policy_tx", "attestation_tx"]);
}

#[test]
fn proof_deduplicates_matching_policy_and_attestation_txs() {
    let policy = sample_policy();
    let mut attestation = sample_attestation(750);
    attestation.issued_tx = policy.tx_digest.clone();

    let bundle = proof(
        "TRIBE_STANDING",
        "0xsubject",
        "0xgate",
        Some(&policy),
        Some(&attestation),
    );

    assert_eq!(bundle.tx_digests, vec!["policy_tx"]);
}

#[test]
fn valid_standing_allows_free_passage() {
    let result = classify_score(750, 500, 100_000_000);

    assert_eq!(
        result,
        ("ALLOW_FREE", true, Some(0), Some(0), REASON_ALLOW_FREE)
    );
}

#[test]
fn positive_below_ally_threshold_allows_taxed_passage() {
    let result = classify_score(250, 500, 100_000_000);

    assert_eq!(
        result,
        (
            "ALLOW_TAXED",
            true,
            Some(1),
            Some(100_000_000),
            REASON_ALLOW_TAXED
        )
    );
}

#[test]
fn non_positive_score_is_denied() {
    let result = classify_score(0, 500, 100_000_000);

    assert_eq!(
        result,
        ("DENY", false, None, None, REASON_DENY_SCORE_BELOW_THRESHOLD)
    );
}

#[test]
fn missing_standing_reason_is_stable() {
    let response = insufficient(
        "0xsubject".to_owned(),
        Some("0xgate".to_owned()),
        REASON_DENY_NO_STANDING_ATTESTATION,
        "No active standing attestation was found.".to_owned(),
        "gate_access".to_owned(),
    );

    assert_eq!(response.reason, REASON_DENY_NO_STANDING_ATTESTATION);
    assert_eq!(response.decision, "INSUFFICIENT_DATA");
    assert_eq!(response.proof.source, "indexed_protocol_state");
}

#[test]
fn gate_not_found_reason_is_stable() {
    let response = insufficient(
        "0xsubject".to_owned(),
        Some("0xmissing".to_owned()),
        REASON_ERROR_GATE_NOT_FOUND,
        "No indexed gate policy exists for this gate.".to_owned(),
        "gate_access".to_owned(),
    );

    assert_eq!(response.reason, REASON_ERROR_GATE_NOT_FOUND);
    assert_eq!(response.proof.gate_id, Some("0xmissing".to_owned()));
    assert_eq!(response.proof.warnings.len(), 1);
}
