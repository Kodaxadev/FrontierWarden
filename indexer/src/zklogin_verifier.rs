/// zkLogin personal-message verification via Sui GraphQL `verifySignature`.
///
/// Delegates verification to the Sui fullnode rather than performing Groth16
/// proof verification locally, which would require native crypto dependencies.
///
/// Config:
///   EFREP_SUI_GRAPHQL_URL — override the Sui GraphQL endpoint.
///   Default: https://graphql.testnet.sui.io/
///
/// SSRF guard: only https:// URLs are accepted (plus http://localhost /
/// http://127.0.0.1 for local dev and tests).
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use std::time::Duration;

const DEFAULT_GRAPHQL_URL: &str = "https://graphql.testnet.sui.io/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

// Single-line query; avoids multiline string indentation noise in the JSON body.
const VERIFY_QUERY: &str =
    "query VerifySignature($message:Base64!,$signature:Base64!,$intentScope:IntentScope!,$author:SuiAddress!)\
     {verifySignature(message:$message signature:$signature intentScope:$intentScope author:$author){success}}";

#[derive(Debug)]
pub enum ZkLoginError {
    /// `verifySignature` returned `success: false`, or the response contained
    /// GraphQL errors (e.g. issuer rejected, proof expired, bad encoding).
    AuthFailed(String),
    /// Network timeout, connection refused, or malformed JSON response.
    /// Caller should map this to 503, not 401.
    Unavailable(String),
}

pub struct ZkLoginVerifier {
    client: reqwest::Client,
    url: String,
}

impl ZkLoginVerifier {
    /// Build from `EFREP_SUI_GRAPHQL_URL` env var, defaulting to testnet.
    pub fn from_env() -> anyhow::Result<Self> {
        let url = std::env::var("EFREP_SUI_GRAPHQL_URL")
            .unwrap_or_else(|_| DEFAULT_GRAPHQL_URL.to_owned());
        Self::new(url)
    }

    /// Build with an explicit URL. Validates URL scheme (SSRF guard).
    pub fn new(url: String) -> anyhow::Result<Self> {
        validate_graphql_url(&url)?;
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { client, url })
    }

    /// Verify a personal-message zkLogin signature via `verifySignature`.
    ///
    /// `message`   — raw UTF-8 session challenge bytes (NOT BCS-encoded).
    ///               The fullnode applies BCS vector prefix + intent bytes internally.
    /// `signature` — Base64-encoded Sui zkLogin signature (flag byte 0x05 + proof).
    /// `author`    — Sui address (0x-prefixed 64-hex-char string).
    pub async fn verify(
        &self,
        message: &str,
        signature: &str,
        author: &str,
    ) -> Result<(), ZkLoginError> {
        // message must be raw UTF-8 bytes, Base64-encoded, not pre-BCS-wrapped.
        let message_b64 = general_purpose::STANDARD.encode(message.as_bytes());

        let body = json!({
            "query": VERIFY_QUERY,
            "variables": {
                "message":     message_b64,
                "signature":   signature,
                "intentScope": "PERSONAL_MESSAGE",
                "author":      author,
            }
        });

        let resp = self
            .client
            .post(&self.url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    ZkLoginError::Unavailable(format!("Sui GraphQL timeout: {e}"))
                } else if e.is_connect() {
                    ZkLoginError::Unavailable(format!("Sui GraphQL connection refused: {e}"))
                } else {
                    ZkLoginError::Unavailable(format!("Sui GraphQL request error: {e}"))
                }
            })?;

        let http_status = resp.status();
        let parsed: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| ZkLoginError::Unavailable(format!("Sui GraphQL malformed response: {e}")))?;

        // Top-level GraphQL errors array takes precedence.
        if let Some(errors) = parsed.get("errors") {
            if errors.as_array().is_some_and(|a| !a.is_empty()) {
                return Err(ZkLoginError::AuthFailed(errors.to_string()));
            }
        }

        match parsed["data"]["verifySignature"]["success"].as_bool() {
            Some(true) => Ok(()),
            Some(false) => Err(ZkLoginError::AuthFailed("verifySignature returned success=false".into())),
            None => Err(ZkLoginError::Unavailable(format!(
                "verifySignature field missing from Sui GraphQL response (HTTP {http_status})"
            ))),
        }
    }
}

/// SSRF guard: only `https://` URLs allowed; `http://127.0.0.1` and
/// `http://localhost` are permitted for local dev and test servers only.
fn validate_graphql_url(url: &str) -> anyhow::Result<()> {
    let is_https = url.starts_with("https://");
    let is_local = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
    anyhow::ensure!(
        is_https || is_local,
        "EFREP_SUI_GRAPHQL_URL must use https:// (rejecting: {url})"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── URL validation ─────────────────────────────────────────────────────────

    #[test]
    fn accepts_https_testnet_url() {
        assert!(ZkLoginVerifier::new("https://graphql.testnet.sui.io/".into()).is_ok());
    }

    #[test]
    fn accepts_localhost_for_dev() {
        assert!(ZkLoginVerifier::new("http://127.0.0.1:9125/".into()).is_ok());
        assert!(ZkLoginVerifier::new("http://localhost:9125/".into()).is_ok());
    }

    #[test]
    fn rejects_http_external_url() {
        assert!(ZkLoginVerifier::new("http://internal.corp/graphql".into()).is_err());
        assert!(ZkLoginVerifier::new("http://10.0.0.1/graphql".into()).is_err());
    }

    // ── Live verifier responses (mock server) ──────────────────────────────────

    /// Starts a minimal Axum server that always returns `body` for any POST.
    /// Returns the base URL (http://127.0.0.1:<port>).
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
    async fn success_true_returns_ok() {
        let url = spawn_mock_graphql(json!({
            "data": { "verifySignature": { "success": true } }
        }))
        .await;
        let v = ZkLoginVerifier::new(url).unwrap();
        assert!(v.verify("msg", "sig", "0xaddr").await.is_ok());
    }

    #[tokio::test]
    async fn success_false_is_auth_failed() {
        let url = spawn_mock_graphql(json!({
            "data": { "verifySignature": { "success": false } }
        }))
        .await;
        let v = ZkLoginVerifier::new(url).unwrap();
        assert!(matches!(
            v.verify("msg", "sig", "0xaddr").await,
            Err(ZkLoginError::AuthFailed(_))
        ));
    }

    #[tokio::test]
    async fn graphql_errors_are_auth_failed() {
        let url = spawn_mock_graphql(json!({
            "errors": [{ "message": "Issuer not supported" }]
        }))
        .await;
        let v = ZkLoginVerifier::new(url).unwrap();
        assert!(matches!(
            v.verify("msg", "sig", "0xaddr").await,
            Err(ZkLoginError::AuthFailed(_))
        ));
    }

    #[tokio::test]
    async fn missing_success_field_is_unavailable() {
        let url = spawn_mock_graphql(json!({ "data": {} })).await;
        let v = ZkLoginVerifier::new(url).unwrap();
        assert!(matches!(
            v.verify("msg", "sig", "0xaddr").await,
            Err(ZkLoginError::Unavailable(_))
        ));
    }

    #[tokio::test]
    async fn connection_refused_is_unavailable() {
        // Bind to get a free port, then drop so nothing listens.
        let port = {
            let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            l.local_addr().unwrap().port()
        };
        let url = format!("http://127.0.0.1:{port}");
        let v = ZkLoginVerifier::new(url).unwrap();
        assert!(matches!(
            v.verify("msg", "sig", "0xaddr").await,
            Err(ZkLoginError::Unavailable(_))
        ));
    }
}
