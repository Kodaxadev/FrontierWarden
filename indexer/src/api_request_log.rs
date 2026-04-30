use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use std::time::Instant;

pub async fn log_request(req: Request<Body>, next: Next) -> Response {
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    let started = Instant::now();

    let response = next.run(req).await;
    let status = response.status().as_u16();
    let elapsed_ms = started.elapsed().as_millis();

    tracing::info!(
        method = %method,
        path = %path,
        status,
        elapsed_ms,
        "api_request"
    );

    response
}
