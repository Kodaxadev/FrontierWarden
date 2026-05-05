use axum::{
    extract::{Extension, State},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::{
    api_common::ApiError,
    trust_evaluator,
    trust_types::{TrustEvaluationRequest, TrustEvaluationResponse},
};

#[derive(Clone)]
pub struct TrustConfig {
    pub default_gate_schema: String,
    pub default_counterparty_schema: String,
    pub default_bounty_schema: String,
}

impl Default for TrustConfig {
    fn default() -> Self {
        Self {
            default_gate_schema: "TRIBE_STANDING".into(),
            default_counterparty_schema: "TRIBE_STANDING".into(),
            default_bounty_schema: "TRIBE_STANDING".into(),
        }
    }
}

#[derive(Serialize)]
struct TrustConfigResponse {
    default_gate_schema: String,
    default_counterparty_schema: String,
    default_bounty_schema: String,
}

pub fn router_with_config(cfg: TrustConfig) -> Router<PgPool> {
    Router::new()
        .route("/v1/trust/evaluate", post(evaluate))
        .route("/v1/trust/explain", post(evaluate))
        .route("/v1/cradleos/gate/evaluate", post(evaluate))
        .route("/v1/trust/config", get(show_config))
        .layer(Extension(cfg))
}

async fn show_config(Extension(cfg): Extension<TrustConfig>) -> Json<TrustConfigResponse> {
    Json(TrustConfigResponse {
        default_gate_schema: cfg.default_gate_schema.clone(),
        default_counterparty_schema: cfg.default_counterparty_schema.clone(),
        default_bounty_schema: cfg.default_bounty_schema.clone(),
    })
}

async fn evaluate(
    State(pool): State<PgPool>,
    Extension(cfg): Extension<TrustConfig>,
    Json(req): Json<TrustEvaluationRequest>,
) -> Result<Json<TrustEvaluationResponse>, ApiError> {
    let response = trust_evaluator::evaluate(
        &pool,
        req,
        &cfg.default_gate_schema,
        &cfg.default_counterparty_schema,
        &cfg.default_bounty_schema,
    )
    .await?;
    Ok(Json(response))
}
