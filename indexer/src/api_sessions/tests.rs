use axum::http::StatusCode;
use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;
use std::time::{Duration, Instant};

use super::crypto::{
    bcs_vector, personal_message_digest, sui_address, uleb128,
    verify_personal_message_ed25519,
};
use super::types::*;

// ── Ed25519 path (existing behavior, unchanged) ────────────────────────────

#[test]
fn verifies_ed25519_personal_message() -> anyhow::Result<()> {
    let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let pubkey = signing_key.verifying_key().to_bytes();
    let address = sui_address(0, &pubkey);
    let message = "FrontierWarden operator session";
    let digest = personal_message_digest(message.as_bytes())?;
    let signature = signing_key.sign(&digest);

    let mut serialized = vec![0u8];
    serialized.extend_from_slice(&signature.to_bytes());
    serialized.extend_from_slice(&pubkey);
    let signature = general_purpose::STANDARD.encode(serialized);

    verify_personal_message_ed25519(message, &signature, &address)
}

#[test]
fn rejects_invalid_ed25519_signature() -> anyhow::Result<()> {
    let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let pubkey = signing_key.verifying_key().to_bytes();
    let address = sui_address(0, &pubkey);
    let message = "FrontierWarden operator session";

    let mut serialized = vec![0u8];
    serialized.extend_from_slice(&[0u8; 64]);
    serialized.extend_from_slice(&pubkey);
    let bad_sig = general_purpose::STANDARD.encode(serialized);

    assert!(verify_personal_message_ed25519(message, &bad_sig, &address).is_err());
    Ok(())
}

#[test]
fn rejects_wrong_address() -> anyhow::Result<()> {
    let signing_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let pubkey = signing_key.verifying_key().to_bytes();
    let message = "FrontierWarden operator session";
    let digest = personal_message_digest(message.as_bytes())?;
    let signature = signing_key.sign(&digest);

    let mut serialized = vec![0u8];
    serialized.extend_from_slice(&signature.to_bytes());
    serialized.extend_from_slice(&pubkey);
    let sig_b64 = general_purpose::STANDARD.encode(serialized);

    let wrong_address = format!("0x{}", "0".repeat(64));
    assert!(verify_personal_message_ed25519(message, &sig_b64, &wrong_address).is_err());
    Ok(())
}

#[test]
fn expired_nonce_is_rejected() {
    let state = SessionState::new();
    let nonce = "test_nonce_expired".to_string();
    let address = format!("0x{}", "a".repeat(64));
    let message = "test message".to_string();

    {
        let mut store = state.inner.lock().unwrap();
        store.nonces.insert(
            nonce.clone(),
            PendingNonce {
                address: address.clone(),
                message: message.clone(),
                expires_at: Instant::now() - Duration::from_secs(1),
            },
        );
    }

    let req = SessionRequest {
        address,
        nonce,
        message,
        signature: String::new(),
    };
    assert!(state.consume_nonce(&req).is_err());
}

#[test]
fn bcs_vector_uses_uleb_length_prefix() {
    assert_eq!(bcs_vector(b"abc"), vec![3, b'a', b'b', b'c']);
    assert_eq!(uleb128(128), vec![128, 1]);
}

// ── Scheme dispatch ────────────────────────────────────────────────────────

#[tokio::test]
async fn unsupported_scheme_returns_401() {
    let state = SessionState::new();
    let nonce_resp = state
        .insert_nonce(format!("0x{}", "a".repeat(64)))
        .unwrap();

    let mut bad_sig = vec![0x01u8];
    bad_sig.extend_from_slice(&[0u8; 96]);
    let sig_b64 = general_purpose::STANDARD.encode(&bad_sig);

    let req = SessionRequest {
        address: nonce_resp.address,
        nonce: nonce_resp.nonce,
        message: nonce_resp.message,
        signature: sig_b64,
    };
    let err = state.create_session(req).await.unwrap_err();
    assert_eq!(err.0, StatusCode::UNAUTHORIZED);
}

// ── zkLogin dispatch (mock verifier server) ────────────────────────────────

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

fn fake_zklogin_sig() -> String {
    let mut sig = vec![0x05u8];
    sig.extend_from_slice(&[0u8; 63]);
    general_purpose::STANDARD.encode(sig)
}

fn session_req_with_sig(nonce_resp: &NonceResponse, sig: String) -> SessionRequest {
    SessionRequest {
        address: nonce_resp.address.clone(),
        nonce: nonce_resp.nonce.clone(),
        message: nonce_resp.message.clone(),
        signature: sig,
    }
}

#[tokio::test]
async fn zklogin_success_issues_session_token() {
    let url = spawn_mock_graphql(json!({
        "data": { "verifySignature": { "success": true } }
    }))
    .await;
    let state = SessionState::with_verifier_url(url);
    let nonce = state
        .insert_nonce(format!("0x{}", "b".repeat(64)))
        .unwrap();
    let req = session_req_with_sig(&nonce, fake_zklogin_sig());
    let resp = state.create_session(req).await.unwrap();
    assert!(!resp.token.is_empty());
    assert_eq!(resp.address, nonce.address);
}

#[tokio::test]
async fn zklogin_auth_failure_returns_401() {
    let url = spawn_mock_graphql(json!({
        "data": { "verifySignature": { "success": false } }
    }))
    .await;
    let state = SessionState::with_verifier_url(url);
    let nonce = state
        .insert_nonce(format!("0x{}", "c".repeat(64)))
        .unwrap();
    let req = session_req_with_sig(&nonce, fake_zklogin_sig());
    let err = state.create_session(req).await.unwrap_err();
    assert_eq!(err.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn zklogin_graphql_errors_return_401() {
    let url = spawn_mock_graphql(json!({
        "errors": [{ "message": "Issuer not supported" }]
    }))
    .await;
    let state = SessionState::with_verifier_url(url);
    let nonce = state
        .insert_nonce(format!("0x{}", "d".repeat(64)))
        .unwrap();
    let req = session_req_with_sig(&nonce, fake_zklogin_sig());
    let err = state.create_session(req).await.unwrap_err();
    assert_eq!(err.0, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn zklogin_verifier_unavailable_returns_503() {
    let port = {
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        l.local_addr().unwrap().port()
    };
    let state = SessionState::with_verifier_url(format!("http://127.0.0.1:{port}"));
    let nonce = state
        .insert_nonce(format!("0x{}", "e".repeat(64)))
        .unwrap();
    let req = session_req_with_sig(&nonce, fake_zklogin_sig());
    let err = state.create_session(req).await.unwrap_err();
    assert_eq!(err.0, StatusCode::SERVICE_UNAVAILABLE);
}
