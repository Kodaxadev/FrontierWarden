use axum::http::StatusCode;
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use crate::zklogin_verifier::ZkLoginVerifier;

use super::crypto::{random_token, unix_now};
use super::types::*;

impl SessionState {
    pub fn new() -> Self {
        let verifier = ZkLoginVerifier::from_env()
            .expect("EFREP_SUI_GRAPHQL_URL is invalid — must use https://");
        Self {
            inner: Arc::new(Mutex::new(SessionStore::default())),
            verifier: Arc::new(verifier),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_verifier_url(url: String) -> Self {
        let verifier = ZkLoginVerifier::new(url).expect("invalid test verifier URL");
        Self {
            inner: Arc::new(Mutex::new(SessionStore::default())),
            verifier: Arc::new(verifier),
        }
    }

    #[allow(dead_code)]
    pub fn validate_token(&self, token: &str) -> Option<String> {
        let now = Instant::now();
        let Ok(mut store) = self.inner.lock() else {
            return None;
        };
        store.sessions.retain(|_, session| session.expires_at > now);
        store.sessions.get(token).map(|s| s.address.clone())
    }

    pub(crate) fn insert_nonce(
        &self,
        address: String,
    ) -> Result<NonceResponse, (StatusCode, &'static str)> {
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

    pub(crate) async fn create_session(
        &self,
        req: SessionRequest,
    ) -> Result<SessionResponse, (StatusCode, &'static str)> {
        self.consume_nonce(&req)?;

        super::verify::verify_personal_message(
            &req.message,
            &req.signature,
            &req.address,
            &self.verifier,
        )
        .await?;

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

    pub(crate) fn consume_nonce(
        &self,
        req: &SessionRequest,
    ) -> Result<(), (StatusCode, &'static str)> {
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
