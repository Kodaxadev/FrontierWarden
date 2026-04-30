use axum::{extract::State, routing::post, Json, Router};
use sqlx::PgPool;

use crate::{
    api_common::ApiError,
    trust_evaluator,
    trust_types::{TrustEvaluationRequest, TrustEvaluationResponse},
};

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/v1/trust/evaluate", post(evaluate))
        .route("/v1/trust/explain", post(evaluate))
        .route("/v1/cradleos/gate/evaluate", post(evaluate))
}

async fn evaluate(
    State(pool): State<PgPool>,
    Json(req): Json<TrustEvaluationRequest>,
) -> Result<Json<TrustEvaluationResponse>, ApiError> {
    let response = trust_evaluator::evaluate(&pool, req).await?;
    Ok(Json(response))
}
