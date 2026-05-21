use crate::api_health::{build_response, FreshnessRow};

#[test]
fn health_freshness_response_explains_raw_event_quietness() {
    let response = build_response(
        Some(FreshnessRow {
            checkpoint_seq: 120,
            event_type: "pkg::module::Event".to_owned(),
            tx_digest: "tx1".to_owned(),
            age_seconds: Some(600),
        }),
        Some(125),
    );

    assert_eq!(response.status, "ok");
    assert_eq!(response.latest_raw_event_checkpoint, Some(120));
    assert_eq!(response.latest_raw_event_age_seconds, Some(600));
    assert_eq!(response.latest_sui_checkpoint, Some(125));
    assert_eq!(response.chain_checkpoint_lag, Some(5));
    assert!(response
        .interpretation
        .contains("latest tracked raw event is older"));
}
