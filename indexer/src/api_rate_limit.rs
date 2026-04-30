use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    hash::{Hash, Hasher},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const RATE_LIMIT_ENV: &str = "EFREP_RATE_LIMIT_PER_MINUTE";
const API_KEY_HEADER: &str = "x-api-key";
const WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct RateLimitState {
    limit: u32,
    windows: Arc<Mutex<HashMap<String, ClientWindow>>>,
}

struct ClientWindow {
    started: Instant,
    count: u32,
}

impl RateLimitState {
    pub fn from_env() -> Option<Self> {
        let limit = std::env::var(RATE_LIMIT_ENV)
            .ok()?
            .trim()
            .parse::<u32>()
            .ok()?;
        Self::new(limit)
    }

    pub fn new(limit: u32) -> Option<Self> {
        (limit > 0).then(|| Self {
            limit,
            windows: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn allow(&self, key: &str, now: Instant) -> bool {
        let Ok(mut windows) = self.windows.lock() else {
            return false;
        };

        windows.retain(|_, window| now.duration_since(window.started) < WINDOW);

        let window = windows.entry(key.to_owned()).or_insert(ClientWindow {
            started: now,
            count: 0,
        });

        if now.duration_since(window.started) >= WINDOW {
            window.started = now;
            window.count = 0;
        }

        if window.count >= self.limit {
            return false;
        }

        window.count += 1;
        true
    }
}

pub async fn rate_limit(
    State(state): State<RateLimitState>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let key = client_key(req.headers());
    if !state.allow(&key, Instant::now()) {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(req).await)
}

fn client_key(headers: &HeaderMap) -> String {
    if let Some(token) = api_token(headers) {
        return format!("api-key:{:016x}", stable_hash(token));
    }

    if let Some(forwarded_for) = headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()) {
        if let Some(first) = forwarded_for.split(',').next().map(str::trim) {
            if !first.is_empty() {
                return format!("ip:{first}");
            }
        }
    }

    if let Some(real_ip) = headers.get("x-real-ip").and_then(|h| h.to_str().ok()) {
        if !real_ip.trim().is_empty() {
            return format!("ip:{}", real_ip.trim());
        }
    }

    "unknown".to_owned()
}

fn api_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(API_KEY_HEADER)
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "))
        })
}

fn stable_hash(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn enforces_limit_per_window() {
        let limiter = RateLimitState::new(2).expect("nonzero limit");
        let now = Instant::now();
        assert!(limiter.allow("client", now));
        assert!(limiter.allow("client", now));
        assert!(!limiter.allow("client", now));
        assert!(limiter.allow("other", now));
    }

    #[test]
    fn resets_after_window() {
        let limiter = RateLimitState::new(1).expect("nonzero limit");
        let now = Instant::now();
        assert!(limiter.allow("client", now));
        assert!(!limiter.allow("client", now));
        assert!(limiter.allow("client", now + WINDOW + Duration::from_secs(1)));
    }

    #[test]
    fn client_key_prefers_hashed_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("secret"));
        let key = client_key(&headers);
        assert!(key.starts_with("api-key:"));
        assert!(!key.contains("secret"));
    }
}
