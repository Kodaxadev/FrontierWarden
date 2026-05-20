use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::zklogin_verifier::ZkLoginVerifier;

pub(crate) const NONCE_TTL: Duration = Duration::from_secs(300);
pub(crate) const SESSION_TTL: Duration = Duration::from_secs(3600);

#[derive(Clone)]
pub struct SessionState {
    pub(crate) inner: Arc<Mutex<SessionStore>>,
    pub(crate) verifier: Arc<ZkLoginVerifier>,
}

#[derive(Default)]
pub(crate) struct SessionStore {
    pub(crate) nonces: HashMap<String, PendingNonce>,
    pub(crate) sessions: HashMap<String, OperatorSession>,
}

pub(crate) struct PendingNonce {
    pub(crate) address: String,
    pub(crate) message: String,
    pub(crate) expires_at: Instant,
}

#[allow(dead_code)]
pub(crate) struct OperatorSession {
    pub(crate) address: String,
    pub(crate) expires_at: Instant,
}

#[derive(Deserialize)]
pub(crate) struct NonceRequest {
    pub(crate) address: String,
}

#[derive(Serialize)]
pub(crate) struct NonceResponse {
    pub(crate) address: String,
    pub(crate) nonce: String,
    pub(crate) message: String,
    pub(crate) expires_at: u64,
}

#[derive(Deserialize)]
pub(crate) struct SessionRequest {
    pub(crate) address: String,
    pub(crate) nonce: String,
    pub(crate) message: String,
    pub(crate) signature: String,
}

#[derive(Serialize, Debug)]
pub(crate) struct SessionResponse {
    pub(crate) address: String,
    pub(crate) token: String,
    pub(crate) expires_at: u64,
}
