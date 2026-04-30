use anyhow::Result;
use sqlx::PgPool;
use std::time::{SystemTime, UNIX_EPOCH};

const STALE_EVENT_SECONDS: i64 = 300;
const CACHE_TTL_SECS: u64 = 2;

#[derive(sqlx::FromRow, Clone)]
pub(crate) struct IndexerFreshness {
    pub(crate) latest_checkpoint: Option<i64>,
    pub(crate) latest_event_age_secs: Option<i64>,
}

// Simple in-memory cache: stores (cached_value, cached_at_epoch_secs)
static CACHE_VALUE: std::sync::OnceLock<std::sync::Mutex<Option<(IndexerFreshness, u64)>>> =
    std::sync::OnceLock::new();

fn cache() -> &'static std::sync::Mutex<Option<(IndexerFreshness, u64)>> {
    CACHE_VALUE.get_or_init(|| std::sync::Mutex::new(None))
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(crate) async fn latest(pool: &PgPool) -> Result<IndexerFreshness> {
    // Check cache
    if let Some((value, cached_at)) = cache().lock().unwrap().as_ref() {
        if now_epoch_secs().saturating_sub(*cached_at) < CACHE_TTL_SECS {
            return Ok(value.clone());
        }
    }

    // Cache miss or expired — query DB
    let result = sqlx::query_as::<_, IndexerFreshness>(
        "SELECT MAX(checkpoint_seq)::BIGINT AS latest_checkpoint,
                EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::BIGINT AS latest_event_age_secs
         FROM raw_events",
    )
    .fetch_one(pool)
    .await?;

    // Update cache
    *cache().lock().unwrap() = Some((result.clone(), now_epoch_secs()));
    Ok(result)
}

pub(crate) fn warnings(proof_checkpoint: Option<i64>, freshness: &IndexerFreshness) -> Vec<String> {
    let mut warnings = Vec::new();
    match (proof_checkpoint, freshness.latest_checkpoint) {
        (Some(proof), Some(latest)) if latest > proof => {
            warnings.push(format!(
                "PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:{}",
                latest - proof
            ));
        }
        (None, Some(_)) => warnings.push("PROOF_CHECKPOINT_UNKNOWN".to_owned()),
        (_, None) => warnings.push("INDEXER_CHECKPOINT_UNKNOWN".to_owned()),
        _ => {}
    }

    if let Some(age) = freshness.latest_event_age_secs {
        if age > STALE_EVENT_SECONDS {
            warnings.push(format!("INDEXER_LAST_EVENT_STALE_SECONDS:{age}"));
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warns_when_proof_checkpoint_lags_latest_indexed_checkpoint() {
        let freshness = IndexerFreshness {
            latest_checkpoint: Some(125),
            latest_event_age_secs: Some(2),
        };

        assert_eq!(
            warnings(Some(100), &freshness),
            vec!["PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:25"]
        );
    }

    #[test]
    fn warns_when_latest_indexed_event_is_old() {
        let freshness = IndexerFreshness {
            latest_checkpoint: Some(100),
            latest_event_age_secs: Some(301),
        };

        assert_eq!(
            warnings(Some(100), &freshness),
            vec!["INDEXER_LAST_EVENT_STALE_SECONDS:301"]
        );
    }
}
