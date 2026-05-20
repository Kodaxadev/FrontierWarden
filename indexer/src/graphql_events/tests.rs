use super::*;
use serde_json::json;

#[test]
fn accepts_https_url() {
    assert!(GraphQLEventClient::new("https://graphql.testnet.sui.io/graphql").is_ok());
}

#[test]
fn accepts_localhost() {
    assert!(GraphQLEventClient::new("http://127.0.0.1:9000/graphql").is_ok());
    assert!(GraphQLEventClient::new("http://localhost:9000/graphql").is_ok());
}

#[test]
fn rejects_http_external() {
    assert!(GraphQLEventClient::new("http://10.0.0.1/graphql").is_err());
}

#[test]
fn normalize_event_extracts_fields() {
    let node = GqlEventNode {
        sending_module: Some(GqlModule {
            package: Some(GqlAddress {
                address: Some("0xabc".into()),
            }),
            name: Some("attestation".into()),
        }),
        type_: Some(GqlTypeRepr {
            repr: Some("0xabc::attestation::AttestationIssued".into()),
        }),
        sender: Some(GqlAddress {
            address: Some("0xsender".into()),
        }),
        json: Some(json!({"value": "42"})),
        timestamp: Some("2026-05-20T12:00:00Z".into()),
        checkpoint: Some(GqlCheckpoint {
            sequence_number: Some(12345),
        }),
        transaction_block: Some(GqlTransactionBlock {
            digest: Some("DigestABC123".into()),
        }),
    };

    let event = normalize_event(node).unwrap();
    assert_eq!(event.id.tx_digest, "DigestABC123");
    assert_eq!(event.package_id, "0xabc");
    assert_eq!(event.transaction_module, "attestation");
    assert_eq!(event.type_, "0xabc::attestation::AttestationIssued");
    assert_eq!(event.sender, Some("0xsender".into()));
    assert_eq!(event.checkpoint, Some("12345".into()));
    assert_eq!(event.parsed_json["value"], "42");
    assert!(event.timestamp_ms.is_some());
}

#[test]
fn normalize_event_missing_digest_fails() {
    let node = GqlEventNode {
        sending_module: Some(GqlModule {
            package: Some(GqlAddress { address: Some("0x1".into()) }),
            name: Some("m".into()),
        }),
        type_: Some(GqlTypeRepr { repr: Some("0x1::m::E".into()) }),
        sender: None,
        json: None,
        timestamp: None,
        checkpoint: None,
        transaction_block: None,
    };
    assert!(normalize_event(node).is_err());
}

#[test]
fn normalize_event_null_timestamp_becomes_none() {
    let node = GqlEventNode {
        sending_module: Some(GqlModule {
            package: Some(GqlAddress { address: Some("0x1".into()) }),
            name: Some("m".into()),
        }),
        type_: Some(GqlTypeRepr { repr: Some("0x1::m::E".into()) }),
        sender: None,
        json: None,
        timestamp: None,
        checkpoint: None,
        transaction_block: Some(GqlTransactionBlock { digest: Some("Tx".into()) }),
    };
    let event = normalize_event(node).unwrap();
    assert!(event.timestamp_ms.is_none());
    assert!(event.checkpoint.is_none());
}

/// Starts a minimal Axum server that returns `body` for any POST.
async fn spawn_mock_graphql(body: serde_json::Value) -> String {
    use axum::{routing::post, Json, Router};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        let app = Router::new().route(
            "/",
            post(move || {
                let b = body.clone();
                async move { Json(b) }
            }),
        );
        axum::serve(listener, app).await.unwrap();
    });

    format!("http://127.0.0.1:{port}")
}

#[tokio::test]
async fn mock_graphql_returns_events() {
    let url = spawn_mock_graphql(json!({
        "data": {
            "events": {
                "nodes": [{
                    "sendingModule": {
                        "package": { "address": "0xpkg" },
                        "name": "attestation"
                    },
                    "type": { "repr": "0xpkg::attestation::Issued" },
                    "sender": { "address": "0xsender" },
                    "json": { "profile_id": "0xprofile" },
                    "timestamp": "2026-05-20T10:00:00Z",
                    "checkpoint": { "sequenceNumber": 100 },
                    "transactionBlock": { "digest": "Tx1" }
                }],
                "pageInfo": {
                    "hasNextPage": false,
                    "endCursor": null
                }
            }
        }
    }))
    .await;

    let client = GraphQLEventClient::new(url).unwrap();
    let page = client.query_events("0xpkg", "attestation", None, 10).await.unwrap();

    assert_eq!(page.data.len(), 1);
    assert_eq!(page.data[0].id.tx_digest, "Tx1");
    assert_eq!(page.data[0].transaction_module, "attestation");
    assert!(!page.has_next_page);
    assert!(page.next_cursor.is_none());
}

#[tokio::test]
async fn mock_graphql_pagination() {
    let url = spawn_mock_graphql(json!({
        "data": {
            "events": {
                "nodes": [{
                    "sendingModule": {
                        "package": { "address": "0xpkg" },
                        "name": "gate"
                    },
                    "type": { "repr": "0xpkg::gate::Passage" },
                    "sender": { "address": "0xs" },
                    "json": {},
                    "timestamp": null,
                    "checkpoint": { "sequenceNumber": 200 },
                    "transactionBlock": { "digest": "Tx2" }
                }],
                "pageInfo": {
                    "hasNextPage": true,
                    "endCursor": "opaque-cursor-abc"
                }
            }
        }
    }))
    .await;

    let client = GraphQLEventClient::new(url).unwrap();
    let page = client.query_events("0xpkg", "gate", None, 1).await.unwrap();

    assert!(page.has_next_page);
    assert!(page.next_cursor.is_some());
    assert_eq!(page.next_cursor.as_ref().unwrap().tx_digest, "Tx2");
}

#[tokio::test]
async fn mock_graphql_errors_propagate() {
    let url = spawn_mock_graphql(json!({
        "errors": [{ "message": "Invalid filter" }]
    }))
    .await;

    let client = GraphQLEventClient::new(url).unwrap();
    let result = client.query_events("0xpkg", "mod", None, 10).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("Invalid filter"));
}

#[tokio::test]
async fn query_events_by_type_uses_event_type_filter() {
    let url = spawn_mock_graphql(json!({
        "data": {
            "events": {
                "nodes": [{
                    "sendingModule": {
                        "package": { "address": "0xpkg" },
                        "name": "gate"
                    },
                    "type": { "repr": "0xpkg::gate::LinkEvent" },
                    "sender": { "address": "0xs" },
                    "json": { "gate_id": "0xgate" },
                    "timestamp": "2026-05-20T08:00:00Z",
                    "checkpoint": { "sequenceNumber": 50 },
                    "transactionBlock": { "digest": "TxType1" }
                }],
                "pageInfo": { "hasNextPage": false, "endCursor": null }
            }
        }
    }))
    .await;

    let client = GraphQLEventClient::new(url).unwrap();
    let page = client
        .query_events_by_type("0xpkg::gate::LinkEvent", None, 10)
        .await
        .unwrap();

    assert_eq!(page.data.len(), 1);
    assert_eq!(page.data[0].id.tx_digest, "TxType1");
}
