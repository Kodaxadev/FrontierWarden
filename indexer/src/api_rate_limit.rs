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

/// Rate limit tier names used as key prefixes so each tier tracks independent
/// windows per client. See `Documents/API_WEAPONIZATION_AUDIT.md`.
pub const TIER_GLOBAL: &str = "global";
pub const TIER_SENSITIVE: &str = "sensitive";
pub const TIER_ELEVATED: &str = "elevated";

pub const SENSITIVE_LIMIT_ENV: &str = "EFREP_RATE_LIMIT_SENSITIVE_PER_MINUTE";
pub const ELEVATED_LIMIT_ENV: &str = "EFREP_RATE_LIMIT_ELEVATED_PER_MINUTE";

const DEFAULT_SENSITIVE_LIMIT: u32 = 30;
const DEFAULT_ELEVATED_LIMIT: u32 = 60;

#[derive(Clone)]
pub struct RateLimitState {
    tier: String,
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
        Self::with_tier(TIER_GLOBAL, limit)
    }

    /// Sensitive tier: identity batch, character jump history.
    pub fn sensitive_from_env() -> Option<Self> {
        let limit = std::env::var(SENSITIVE_LIMIT_ENV)
            .ok()
            .and_then(|v| v.trim().parse::<u32>().ok())
            .unwrap_or(DEFAULT_SENSITIVE_LIMIT);
        Self::with_tier(TIER_SENSITIVE, limit)
    }

    /// Elevated tier: kill-mails, leaderboard, identity lookups, gate jumps.
    pub fn elevated_from_env() -> Option<Self> {
        let limit = std::env::var(ELEVATED_LIMIT_ENV)
            .ok()
            .and_then(|v| v.trim().parse::<u32>().ok())
            .unwrap_or(DEFAULT_ELEVATED_LIMIT);
        Self::with_tier(TIER_ELEVATED, limit)
    }

    #[cfg(test)]
    pub fn new(limit: u32) -> Option<Self> {
        Self::with_tier(TIER_GLOBAL, limit)
    }

    pub fn with_tier(tier: &str, limit: u32) -> Option<Self> {
        (limit > 0).then(|| Self {
            tier: tier.to_owned(),
            limit,
            windows: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn check(&self, client_key: &str, now: Instant) -> RateLimitResult {
        let key = format!("{}:{}", self.tier, client_key);
        let Ok(mut windows) = self.windows.lock() else {
            return RateLimitResult { allowed: false, limit: self.limit, remaining: 0, retry_after_secs: 60 };
        };

        windows.retain(|_, window| now.duration_since(window.started) < WINDOW);

        let window = windows.entry(key).or_insert(ClientWindow {
            started: now,
            count: 0,
        });

        if now.duration_since(window.started) >= WINDOW {
            window.started = now;
            window.count = 0;
        }

        if window.count >= self.limit {
            let elapsed = now.duration_since(window.started).as_secs();
            let retry_after = 60u64.saturating_sub(elapsed);
            return RateLimitResult { allowed: false, limit: self.limit, remaining: 0, retry_after_secs: retry_after };
        }

        window.count += 1;
        let remaining = self.limit.saturating_sub(window.count);
        RateLimitResult { allowed: true, limit: self.limit, remaining, retry_after_secs: 0 }
    }
}

pub struct RateLimitResult {
    pub allowed: bool,
    pub limit: u32,
    pub remaining: u32,
    pub retry_after_secs: u64,
}

pub async fn rate_limit(
    State(state): State<RateLimitState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let key = client_key(req.headers());
    let result = state.check(&key, Instant::now());
    let tier = &state.tier;

    if !result.allowed {
        let body = format!(
            r#"{{"error":"RATE_LIMITED","tier":"{}","message":"Too many requests ({}). See Retry-After header."}}"#,
            tier, tier,
        );
        return Response::builder()
            .status(StatusCode::TOO_MANY_REQUESTS)
            .header("X-RateLimit-Limit", result.limit.to_string())
            .header("X-RateLimit-Remaining", "0")
            .header("X-RateLimit-Tier", tier.as_str())
            .header("Retry-After", result.retry_after_secs.to_string())
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .unwrap_or_default();
    }

    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert("X-RateLimit-Limit", result.limit.to_string().parse().unwrap());
    headers.insert("X-RateLimit-Remaining", result.remaining.to_string().parse().unwrap());
    response
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
        assert!(limiter.check("client", now).allowed);
        assert!(limiter.check("client", now).allowed);
        let denied = limiter.check("client", now);
        assert!(!denied.allowed);
        assert_eq!(denied.remaining, 0);
        assert!(limiter.check("other", now).allowed);
    }

    #[test]
    fn resets_after_window() {
        let limiter = RateLimitState::new(1).expect("nonzero limit");
        let now = Instant::now();
        assert!(limiter.check("client", now).allowed);
        assert!(!limiter.check("client", now).allowed);
        assert!(limiter.check("client", now + WINDOW + Duration::from_secs(1)).allowed);
    }

    #[test]
    fn returns_remaining_count() {
        let limiter = RateLimitState::new(3).expect("nonzero limit");
        let now = Instant::now();
        let r1 = limiter.check("client", now);
        assert!(r1.allowed);
        assert_eq!(r1.remaining, 2);
        assert_eq!(r1.limit, 3);
        let r2 = limiter.check("client", now);
        assert_eq!(r2.remaining, 1);
    }

    #[test]
    fn client_key_prefers_hashed_api_key() {
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("secret"));
        let key = client_key(&headers);
        assert!(key.starts_with("api-key:"));
        assert!(!key.contains("secret"));
    }

    #[test]
    fn tiers_track_independent_windows() {
        let global = RateLimitState::with_tier(TIER_GLOBAL, 2).unwrap();
        let sensitive = RateLimitState::with_tier(TIER_SENSITIVE, 1).unwrap();
        let now = Instant::now();

        // Sensitive tier exhausted after 1 request
        assert!(sensitive.check("client", now).allowed);
        assert!(!sensitive.check("client", now).allowed);

        // Global tier still has capacity (independent window)
        assert!(global.check("client", now).allowed);
        assert!(global.check("client", now).allowed);
        assert!(!global.check("client", now).allowed);
    }

    #[test]
    fn with_tier_zero_returns_none() {
        assert!(RateLimitState::with_tier(TIER_SENSITIVE, 0).is_none());
    }
}
