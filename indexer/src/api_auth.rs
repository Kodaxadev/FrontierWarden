use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};

pub const API_KEY_ENV: &str = "EFREP_API_KEY";
const API_KEY_HEADER: &str = "x-api-key";
const BEARER_PREFIX: &str = "Bearer ";

#[derive(Clone)]
pub struct AccessState {
    pub api_key: Option<String>,
    pub sessions: crate::api_sessions::SessionState,
}

pub fn configured_api_key() -> Option<String> {
    std::env::var(API_KEY_ENV)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub async fn require_access(
    req: Request<Body>,
    next: Next,
    access: AccessState,
) -> Result<Response, StatusCode> {
    let headers = req.headers();
    if access
        .api_key
        .as_deref()
        .is_some_and(|expected_key| authorized_api_key(headers, expected_key))
        || authorized_session(headers, &access.sessions)
    {
        return Ok(next.run(req).await);
    }

    Err(StatusCode::UNAUTHORIZED)
}

fn authorized_api_key(headers: &HeaderMap, expected_key: &str) -> bool {
    headers
        .get(API_KEY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|candidate| token_matches(candidate, expected_key))
        || headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix(BEARER_PREFIX))
            .is_some_and(|candidate| token_matches(candidate, expected_key))
}

fn authorized_session(headers: &HeaderMap, sessions: &crate::api_sessions::SessionState) -> bool {
    bearer_token(headers)
        .and_then(|token| sessions.validate_token(token))
        .is_some()
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX))
}

fn token_matches(candidate: &str, expected: &str) -> bool {
    let candidate = candidate.as_bytes();
    let expected = expected.as_bytes();
    if candidate.len() != expected.len() {
        return false;
    }

    candidate
        .iter()
        .zip(expected.iter())
        .fold(0u8, |diff, (left, right)| diff | (left ^ right))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;
    use axum::{
        body::to_bytes,
        http::{Method, Request},
    };
    use sqlx::postgres::PgPoolOptions;
    use tower::util::ServiceExt;

    #[test]
    fn accepts_x_api_key_header() {
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("secret"));
        assert!(authorized_api_key(&headers, "secret"));
    }

    #[test]
    fn accepts_bearer_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer secret"),
        );
        assert!(authorized_api_key(&headers, "secret"));
    }

    #[test]
    fn rejects_wrong_or_missing_key() {
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("wrong"));
        assert!(!authorized_api_key(&headers, "secret"));
        assert!(!authorized_api_key(&HeaderMap::new(), "secret"));
    }

    #[tokio::test]
    async fn health_bypasses_api_key_gate() -> anyhow::Result<()> {
        let app = crate::api::router_with_security(
            dummy_pool()?,
            Some("secret".to_owned()),
            None,
            crate::api_sessions::SessionState::new(),
            crate::api_trust::TrustConfig::default(),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/health")
                    .body(Body::empty())?,
            )
            .await?;

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await?;
        let body: serde_json::Value = serde_json::from_slice(&bytes)?;
        assert_eq!(body["status"], "ok");
        Ok(())
    }

    #[tokio::test]
    async fn protected_routes_require_api_key_before_database_access() -> anyhow::Result<()> {
        let app = crate::api::router_with_security(
            dummy_pool()?,
            Some("secret".to_owned()),
            None,
            crate::api_sessions::SessionState::new(),
            crate::api_trust::TrustConfig::default(),
        );
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/gates")
                    .body(Body::empty())?,
            )
            .await?;

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        Ok(())
    }

    fn dummy_pool() -> anyhow::Result<sqlx::PgPool> {
        Ok(PgPoolOptions::new().connect_lazy("postgres://postgres:postgres@localhost/postgres")?)
    }
}
