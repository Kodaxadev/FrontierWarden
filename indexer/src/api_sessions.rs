use axum::{extract::Extension, http::StatusCode, routing::post, Json, Router};
use base64::{engine::general_purpose, Engine as _};
use blake2::digest::{Update, VariableOutput};
use blake2::Blake2bVar;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const NONCE_TTL: Duration = Duration::from_secs(300);
const SESSION_TTL: Duration = Duration::from_secs(3600);

pub fn router(session_state: SessionState) -> Router<PgPool> {
    Router::new()
        .route("/auth/nonce", post(create_nonce))
        .route("/auth/session", post(create_session))
        .layer(Extension(session_state))
}

#[derive(Clone, Default)]
pub struct SessionState {
    inner: Arc<Mutex<SessionStore>>,
}

#[derive(Default)]
struct SessionStore {
    nonces: HashMap<String, PendingNonce>,
    sessions: HashMap<String, OperatorSession>,
}

struct PendingNonce {
    address: String,
    message: String,
    expires_at: Instant,
}

struct OperatorSession {
    address: String,
    expires_at: Instant,
}

#[derive(Deserialize)]
struct NonceRequest {
    address: String,
}

#[derive(Serialize)]
struct NonceResponse {
    address: String,
    nonce: String,
    message: String,
    expires_at: u64,
}

#[derive(Deserialize)]
struct SessionRequest {
    address: String,
    nonce: String,
    message: String,
    signature: String,
}

#[derive(Serialize)]
struct SessionResponse {
    address: String,
    token: String,
    expires_at: u64,
}

impl SessionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn validate_token(&self, token: &str) -> Option<String> {
        let now = Instant::now();
        let Ok(mut store) = self.inner.lock() else {
            return None;
        };
        store.sessions.retain(|_, session| session.expires_at > now);
        store.sessions.get(token).map(|s| s.address.clone())
    }

    fn insert_nonce(&self, address: String) -> Result<NonceResponse, (StatusCode, &'static str)> {
        let nonce = random_token(16);
        let expires_at = unix_now() + NONCE_TTL.as_secs();
        let message = format!(
            "FrontierWarden operator session\nAddress: {address}\nNonce: {nonce}\nExpires: {expires_at}"
        );

        let mut store = self.inner.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "session store unavailable",
            )
        })?;
        store.nonces.insert(
            nonce.clone(),
            PendingNonce {
                address: address.clone(),
                message: message.clone(),
                expires_at: Instant::now() + NONCE_TTL,
            },
        );

        Ok(NonceResponse {
            address,
            nonce,
            message,
            expires_at,
        })
    }

    fn create_session(
        &self,
        req: SessionRequest,
    ) -> Result<SessionResponse, (StatusCode, &'static str)> {
        self.consume_nonce(&req)?;

        verify_personal_message(&req.message, &req.signature, &req.address).map_err(|err| {
            let sig_bytes = general_purpose::STANDARD.decode(&req.signature).unwrap_or_default();
            let scheme_byte = sig_bytes.first().copied();
            let derived_addr = if sig_bytes.len() == 97 {
                sui_address(sig_bytes[0], &sig_bytes[65..97])
            } else {
                format!("n/a (sig_len={})", sig_bytes.len())
            };
            tracing::warn!(
                scheme = signature_scheme_label(&req.signature),
                sig_len = sig_bytes.len(),
                scheme_byte = ?scheme_byte,
                derived_addr = %derived_addr,
                expected_addr = %req.address,
                error = %err,
                "operator session signature verification failed"
            );
            (StatusCode::UNAUTHORIZED, "wallet signature verification failed")
        })?;

        let token = random_token(32);
        let expires_at = unix_now() + SESSION_TTL.as_secs();
        let mut store = self.inner.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "session store unavailable",
            )
        })?;
        store.sessions.insert(
            token.clone(),
            OperatorSession {
                address: req.address.clone(),
                expires_at: Instant::now() + SESSION_TTL,
            },
        );

        Ok(SessionResponse {
            address: req.address,
            token,
            expires_at,
        })
    }

    fn consume_nonce(&self, req: &SessionRequest) -> Result<(), (StatusCode, &'static str)> {
        let mut store = self.inner.lock().map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "session store unavailable",
            )
        })?;
        let Some(pending) = store.nonces.remove(&req.nonce) else {
            return Err((StatusCode::UNAUTHORIZED, "unknown or expired nonce"));
        };
        if pending.expires_at <= Instant::now()
            || pending.address != req.address
            || pending.message != req.message
        {
            return Err((StatusCode::UNAUTHORIZED, "nonce mismatch"));
        }
        Ok(())
    }
}

async fn create_nonce(
    Extension(session_state): Extension<SessionState>,
    Json(req): Json<NonceRequest>,
) -> Result<Json<NonceResponse>, (StatusCode, &'static str)> {
    let address =
        normalize_sui_address(&req.address).ok_or((StatusCode::BAD_REQUEST, "invalid address"))?;
    Ok(Json(session_state.insert_nonce(address)?))
}

async fn create_session(
    Extension(session_state): Extension<SessionState>,
    Json(req): Json<SessionRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, &'static str)> {
    let address =
        normalize_sui_address(&req.address).ok_or((StatusCode::BAD_REQUEST, "invalid address"))?;
    Ok(Json(
        session_state.create_session(SessionRequest { address, ..req })?,
    ))
}

fn verify_personal_message_ed25519(
    message: &str,
    signature: &str,
    address: &str,
) -> anyhow::Result<()> {
    let bytes = general_purpose::STANDARD.decode(signature)?;
    anyhow::ensure!(bytes.len() == 97, "expected Ed25519 Sui signature");
    anyhow::ensure!(bytes[0] == 0, "unsupported Sui signature scheme");

    let sig = Signature::from_slice(&bytes[1..65])?;
    let pubkey: [u8; 32] = bytes[65..97].try_into()?;
    let verifying_key = VerifyingKey::from_bytes(&pubkey)?;
    anyhow::ensure!(sui_address(0, &pubkey) == address, "address mismatch");

    let digest = personal_message_digest(message.as_bytes())?;
    verifying_key.verify(&digest, &sig)?;
    Ok(())
}

/// Only Ed25519 (Sui flag byte 0x00) is supported for operator sessions.
/// secp256k1, secp256r1, zkLogin, and passkey schemes are not accepted.
fn verify_personal_message(message: &str, signature: &str, address: &str) -> anyhow::Result<()> {
    verify_personal_message_ed25519(message, signature, address)
}

fn personal_message_digest(message: &[u8]) -> anyhow::Result<[u8; 32]> {
    let bcs_message = bcs_vector(message);
    let mut intent_message = Vec::with_capacity(3 + bcs_message.len());
    intent_message.extend_from_slice(&[3, 0, 0]);
    intent_message.extend_from_slice(&bcs_message);

    let mut out = [0u8; 32];
    let mut hasher = Blake2bVar::new(32)?;
    hasher.update(&intent_message);
    hasher.finalize_variable(&mut out)?;
    Ok(out)
}

fn sui_address(flag: u8, pubkey: &[u8]) -> String {
    let mut bytes = Vec::with_capacity(1 + pubkey.len());
    bytes.push(flag);
    bytes.extend_from_slice(pubkey);

    let mut out = [0u8; 32];
    let mut hasher = Blake2bVar::new(32).expect("valid output length");
    hasher.update(&bytes);
    hasher.finalize_variable(&mut out).expect("fixed length");
    format!("0x{}", hex::encode(out))
}

fn bcs_vector(value: &[u8]) -> Vec<u8> {
    let mut out = uleb128(value.len() as u64);
    out.extend_from_slice(value);
    out
}

fn uleb128(mut value: u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            return out;
        }
    }
}

fn normalize_sui_address(address: &str) -> Option<String> {
    let trimmed = address.trim();
    let hex = trimmed.strip_prefix("0x")?;
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit()))
        .then(|| format!("0x{}", hex.to_ascii_lowercase()))
}

fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

fn signature_scheme_label(signature: &str) -> &'static str {
    let Ok(bytes) = general_purpose::STANDARD.decode(signature) else {
        return "invalid-base64";
    };
    match bytes.first().copied() {
        Some(0) => "ed25519",
        Some(1) => "secp256k1",
        Some(2) => "secp256r1",
        Some(3) => "multisig",
        Some(5) => "zklogin",
        Some(6) => "passkey",
        Some(_) => "unknown",
        None => "empty",
    }
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

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

        // All-zero signature bytes — not a valid signature for this key
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

        let req = SessionRequest { address, nonce, message, signature: String::new() };
        assert!(state.consume_nonce(&req).is_err());
    }

    #[test]
    fn bcs_vector_uses_uleb_length_prefix() {
        assert_eq!(bcs_vector(b"abc"), vec![3, b'a', b'b', b'c']);
        assert_eq!(uleb128(128), vec![128, 1]);
    }
}
