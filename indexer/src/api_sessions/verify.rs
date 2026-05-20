use axum::http::StatusCode;
use base64::{engine::general_purpose, Engine as _};

use crate::zklogin_verifier::{ZkLoginError, ZkLoginVerifier};

use super::crypto::{signature_scheme_label, sui_address, verify_personal_message_ed25519};

/// Dispatch to Ed25519 (0x00) or zkLogin (0x05) verification.
/// Any other scheme byte → opaque 401 (same error text as a bad signature).
pub(crate) async fn verify_personal_message(
    message: &str,
    signature: &str,
    address: &str,
    verifier: &ZkLoginVerifier,
) -> Result<(), (StatusCode, &'static str)> {
    let sig_bytes = general_purpose::STANDARD
        .decode(signature)
        .unwrap_or_default();

    match sig_bytes.first().copied() {
        Some(0x00) => verify_personal_message_ed25519(message, signature, address).map_err(|err| {
            tracing::warn!(
                scheme = "ed25519",
                sig_len = sig_bytes.len(),
                derived_addr = %if sig_bytes.len() == 97 {
                    sui_address(0, &sig_bytes[65..97])
                } else {
                    format!("n/a (sig_len={})", sig_bytes.len())
                },
                expected_addr = %address,
                error = %err,
                "operator session signature verification failed"
            );
            (StatusCode::UNAUTHORIZED, "wallet signature verification failed")
        }),

        Some(0x05) => verify_personal_message_zklogin(message, signature, address, verifier).await,

        _ => {
            tracing::warn!(
                scheme = signature_scheme_label(signature),
                expected_addr = %address,
                "operator session: unsupported signature scheme"
            );
            Err((
                StatusCode::UNAUTHORIZED,
                "wallet signature verification failed",
            ))
        }
    }
}

async fn verify_personal_message_zklogin(
    message: &str,
    signature: &str,
    address: &str,
    verifier: &ZkLoginVerifier,
) -> Result<(), (StatusCode, &'static str)> {
    match verifier.verify(message, signature, address).await {
        Ok(()) => Ok(()),
        Err(ZkLoginError::AuthFailed(reason)) => {
            tracing::warn!(
                scheme = "zklogin",
                reason = %reason,
                address = %address,
                "operator session zkLogin verification failed"
            );
            Err((
                StatusCode::UNAUTHORIZED,
                "wallet signature verification failed",
            ))
        }
        Err(ZkLoginError::Unavailable(reason)) => {
            tracing::error!(
                scheme = "zklogin",
                reason = %reason,
                address = %address,
                "Sui GraphQL zkLogin verifier unavailable"
            );
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                "zkLogin verification service temporarily unavailable",
            ))
        }
    }
}
