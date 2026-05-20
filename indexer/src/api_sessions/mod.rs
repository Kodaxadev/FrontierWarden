mod crypto;
mod service;
#[cfg(test)]
mod tests;
pub(crate) mod types;
mod verify;

use axum::{extract::Extension, http::StatusCode, routing::post, Json, Router};
use sqlx::PgPool;

pub use types::SessionState;
use types::*;

use crypto::normalize_sui_address;

pub fn router(session_state: SessionState) -> Router<PgPool> {
    Router::new()
        .route("/auth/nonce", post(create_nonce))
        .route("/auth/session", post(create_session))
        .layer(Extension(session_state))
}

async fn create_nonce(
    Extension(session_state): Extension<SessionState>,
    Json(req): Json<NonceRequest>,
) -> Result<Json<NonceResponse>, (StatusCode, &'static str)> {
    let address =
        normalize_sui_address(&req.address).ok_or((StatusCode::BAD_REQUEST, "invalid address"))?;
    Ok(Json(session_state.insert_nonce(address)?))
}

async fn create_session(
    Extension(session_state): Extension<SessionState>,
    Json(req): Json<SessionRequest>,
) -> Result<Json<SessionResponse>, (StatusCode, &'static str)> {
    let address =
        normalize_sui_address(&req.address).ok_or((StatusCode::BAD_REQUEST, "invalid address"))?;
    Ok(Json(
        session_state
            .create_session(SessionRequest { address, ..req })
            .await?,
    ))
}
