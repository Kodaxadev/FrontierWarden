use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct LimitParams {
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

pub struct ApiError(pub anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("API error: {:#}", self.0);
        let body = ErrorBody {
            error: "INTERNAL_ERROR".to_owned(),
            message: "An internal error occurred.".to_owned(),
            field: None,
        };
        (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        ApiError(e.into())
    }
}

pub struct ValidationError {
    pub field: Option<String>,
    pub message: String,
}

impl ValidationError {
    pub fn missing_field(field: &str, message: impl Into<String>) -> Self {
        Self {
            field: Some(field.to_owned()),
            message: message.into(),
        }
    }
}

impl IntoResponse for ValidationError {
    fn into_response(self) -> axum::response::Response {
        let body = ErrorBody {
            error: "VALIDATION_ERROR".to_owned(),
            message: self.message,
            field: self.field,
        };
        (StatusCode::BAD_REQUEST, Json(body)).into_response()
    }
}
