//! Read-only kill mail API.
//!
//! Exposes native EVE Frontier kill data ingested from the alpha-strike
//! community API. This is combat telemetry — not trust scores, not
//! attestations, and not targeting intelligence.
//!
//! SHIP_KILL attestations are a separate, trust-layer concept and are served
//! by the attestation endpoints. These two data sources must not be conflated.
//!
//! Data aggregation policy: paginated reads only, max 200 rows per page,
//! no bulk export, no "vulnerable pilot" filters, no social-graph traversal.
//!
//! Endpoints:
//!   GET /kill-mails?limit=&cursor=
//!   GET /kill-mails/:id
//!   GET /world/characters/:address/kills?limit=&cursor=
//!   GET /world/characters/:address/losses?limit=&cursor=
//!   GET /world/systems/:system_id/kills?limit=&cursor=

mod handlers;
pub(crate) mod types;

use axum::{routing::get, Router};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sqlx::PgPool;


const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

const DATA_NOTE: &str =
    "Native kill mail data is combat telemetry. \
     It is not a trust score, attestation, or targeting recommendation. \
     SHIP_KILL attestations are a separate trust-layer signal served by /attestations.";

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/kill-mails", get(handlers::list_kill_mails))
        .route("/kill-mails/{id}", get(handlers::get_kill_mail))
        .route(
            "/world/characters/{address}/kills",
            get(handlers::character_kills),
        )
        .route(
            "/world/characters/{address}/losses",
            get(handlers::character_losses),
        )
        .route(
            "/world/systems/{system_id}/kills",
            get(handlers::system_kills),
        )
}

fn clamp_limit(requested: Option<i64>) -> i64 {
    requested.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn decode_cursor(s: &str) -> Option<i64> {
    let bytes = URL_SAFE_NO_PAD.decode(s).ok()?;
    let id_str = std::str::from_utf8(&bytes).ok()?;
    id_str.parse::<i64>().ok()
}

fn encode_cursor(id: i64) -> String {
    URL_SAFE_NO_PAD.encode(id.to_string())
}
