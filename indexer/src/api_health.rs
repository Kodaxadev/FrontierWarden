use axum::{extract::State, routing::get, Extension, Json, Router};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::time::{Duration, Instant};

use crate::api_common::ApiError;

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
static SUI_CHECKPOINT_CACHE: std::sync::OnceLock<std::sync::Mutex<Option<CachedCheckpoint>>> =
    std::sync::OnceLock::new();
const SUI_CHECKPOINT_CACHE_TTL: Duration = Duration::from_secs(10);

struct CachedCheckpoint {
    checked_at: Instant,
    checkpoint: i64,
}

#[derive(Clone, Default)]
pub(crate) struct HealthConfig {
    pub(crate) sui_rpc_url: Option<String>,
}

pub(crate) fn router(config: HealthConfig) -> Router<PgPool> {
    START.get_or_init(Instant::now);
    Router::new()
        .route("/health", get(health))
        .route("/health/freshness", get(freshness))
        .layer(Extension(config))
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    uptime_secs: u64,
}

async fn health() -> Json<HealthResponse> {
    let uptime = START.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    Json(HealthResponse {
        status: "ok",
        uptime_secs: uptime,
    })
}

#[derive(sqlx::FromRow)]
pub(crate) struct FreshnessRow {
    pub(crate) checkpoint_seq: i64,
    pub(crate) event_type: String,
    pub(crate) tx_digest: String,
    pub(crate) age_seconds: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FreshnessResponse {
    pub(crate) status: &'static str,
    pub(crate) latest_raw_event_checkpoint: Option<i64>,
    pub(crate) latest_raw_event_age_seconds: Option<i64>,
    pub(crate) latest_raw_event_type: Option<String>,
    pub(crate) latest_raw_event_tx_digest: Option<String>,
    pub(crate) latest_sui_checkpoint: Option<i64>,
    pub(crate) chain_checkpoint_lag: Option<i64>,
    pub(crate) interpretation: String,
}

async fn freshness(
    State(pool): State<PgPool>,
    Extension(config): Extension<HealthConfig>,
) -> Result<Json<FreshnessResponse>, ApiError> {
    let row = latest_raw_event(&pool).await?;
    let sui_checkpoint = match config.sui_rpc_url.as_deref() {
        Some(url) => latest_sui_checkpoint_cached(url).await.ok(),
        None => None,
    };
    Ok(Json(build_response(row, sui_checkpoint)))
}

async fn latest_raw_event(pool: &PgPool) -> Result<Option<FreshnessRow>, ApiError> {
    sqlx::query_as::<_, FreshnessRow>(
        "SELECT checkpoint_seq,
                event_type,
                tx_digest,
                EXTRACT(EPOCH FROM (NOW() - created_at))::BIGINT AS age_seconds
         FROM raw_events
         ORDER BY checkpoint_seq DESC, created_at DESC
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(Into::into)
}

pub(crate) fn build_response(
    row: Option<FreshnessRow>,
    latest_sui_checkpoint: Option<i64>,
) -> FreshnessResponse {
    let chain_checkpoint_lag = match (&row, latest_sui_checkpoint) {
        (Some(row), Some(latest)) if latest >= row.checkpoint_seq => {
            Some(latest - row.checkpoint_seq)
        }
        _ => None,
    };
    let interpretation = interpretation(row.as_ref(), latest_sui_checkpoint, chain_checkpoint_lag);

    FreshnessResponse {
        status: "ok",
        latest_raw_event_checkpoint: row.as_ref().map(|r| r.checkpoint_seq),
        latest_raw_event_age_seconds: row.as_ref().and_then(|r| r.age_seconds),
        latest_raw_event_type: row.as_ref().map(|r| r.event_type.clone()),
        latest_raw_event_tx_digest: row.as_ref().map(|r| r.tx_digest.clone()),
        latest_sui_checkpoint,
        chain_checkpoint_lag,
        interpretation,
    }
}

fn interpretation(
    row: Option<&FreshnessRow>,
    latest_sui_checkpoint: Option<i64>,
    chain_checkpoint_lag: Option<i64>,
) -> String {
    if row.is_none() {
        return "API is healthy, but no tracked raw events have been indexed yet.".to_owned();
    }
    if chain_checkpoint_lag.is_some() {
        return "API is healthy; latest tracked raw event is older than the current chain head."
            .to_owned();
    }
    if latest_sui_checkpoint.is_none() {
        return "API is healthy; latest tracked raw event is known, but live Sui checkpoint was not checked."
            .to_owned();
    }
    "API is healthy; latest tracked raw event is at or ahead of the checked chain checkpoint."
        .to_owned()
}

#[derive(Deserialize)]
struct RpcCheckpointResponse {
    result: Option<String>,
}

async fn latest_sui_checkpoint(rpc_url: &str) -> anyhow::Result<i64> {
    let client = Client::builder().timeout(Duration::from_secs(2)).build()?;
    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getLatestCheckpointSequenceNumber",
        "params": []
    });
    let response = client.post(rpc_url).json(&body).send().await?;
    let payload: RpcCheckpointResponse = response.error_for_status()?.json().await?;
    payload
        .result
        .ok_or_else(|| anyhow::anyhow!("missing checkpoint result"))?
        .parse::<i64>()
        .map_err(Into::into)
}

async fn latest_sui_checkpoint_cached(rpc_url: &str) -> anyhow::Result<i64> {
    let cache = SUI_CHECKPOINT_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    if let Some(checkpoint) = cached_checkpoint(cache) {
        return Ok(checkpoint);
    }

    let checkpoint = latest_sui_checkpoint(rpc_url).await?;
    let mut guard = cache
        .lock()
        .map_err(|_| anyhow::anyhow!("Sui checkpoint cache poisoned"))?;
    *guard = Some(CachedCheckpoint {
        checked_at: Instant::now(),
        checkpoint,
    });
    Ok(checkpoint)
}

fn cached_checkpoint(
    cache: &std::sync::Mutex<Option<CachedCheckpoint>>,
) -> Option<i64> {
    let guard = cache.lock().ok()?;
    let cached = guard.as_ref()?;
    if cached.checked_at.elapsed() <= SUI_CHECKPOINT_CACHE_TTL {
        Some(cached.checkpoint)
    } else {
        None
    }
}
