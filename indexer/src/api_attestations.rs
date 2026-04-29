use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::api_common::ApiError;

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/attestations", get(attestations_feed))
        .route("/attestations/{subject}", get(attestations_for_subject))
        .route(
            "/attestations/singleton/{item_id}",
            get(singleton_attestations),
        )
        .route("/intel/{system_id}", get(system_intel))
}

#[derive(Deserialize)]
struct AttestationFilter {
    schema_id: Option<String>,
    limit: Option<i64>,
    revoked: Option<bool>,
}

#[derive(Serialize, sqlx::FromRow)]
struct AttestationRow {
    attestation_id: String,
    schema_id: String,
    issuer: String,
    subject: String,
    value: i64,
    issued_tx: String,
    revoked: bool,
}

#[derive(Serialize, sqlx::FromRow)]
struct AttestationFeedRow {
    attestation_id: String,
    schema_id: String,
    issuer: String,
    subject: String,
    value: i64,
    issued_tx: String,
    issued_at: String,
    revoked: bool,
}

#[derive(Serialize, sqlx::FromRow)]
struct SingletonRow {
    attestation_id: String,
    schema_id: String,
    item_id: String,
    issuer: String,
    value: i64,
    issued_tx: String,
    revoked: bool,
}

#[derive(sqlx::FromRow)]
struct GateIntelRow {
    schema_id: String,
    issuer: String,
    value: i64,
    issued_at: String,
}

#[derive(Serialize)]
struct GateIntelEntry {
    value: i64,
    issuer: String,
    issued_at: String,
}

#[derive(Serialize)]
struct SystemIntelResponse {
    system_id: String,
    gate_hostile: Option<GateIntelEntry>,
    gate_camped: Option<GateIntelEntry>,
    gate_clear: Option<GateIntelEntry>,
    gate_toll: Option<GateIntelEntry>,
    heat_trap: Option<GateIntelEntry>,
    route_verified: Option<GateIntelEntry>,
    system_contested: Option<GateIntelEntry>,
}

async fn attestations_feed(
    State(pool): State<PgPool>,
    Query(filter): Query<AttestationFilter>,
) -> Result<Json<Vec<AttestationFeedRow>>, ApiError> {
    let limit = filter.limit.unwrap_or(50).min(200);
    let revoked = filter.revoked.unwrap_or(false);

    let rows = if let Some(sid) = &filter.schema_id {
        sqlx::query_as::<_, AttestationFeedRow>(ATTESTATION_FEED_SCHEMA_SQL)
            .bind(sid)
            .bind(revoked)
            .bind(limit)
            .fetch_all(&pool)
            .await?
    } else {
        sqlx::query_as::<_, AttestationFeedRow>(ATTESTATION_FEED_SQL)
            .bind(revoked)
            .bind(limit)
            .fetch_all(&pool)
            .await?
    };

    Ok(Json(rows))
}

async fn attestations_for_subject(
    State(pool): State<PgPool>,
    Path(subject): Path<String>,
    Query(filter): Query<AttestationFilter>,
) -> Result<Json<Vec<AttestationRow>>, ApiError> {
    let limit = filter.limit.unwrap_or(50).min(200);
    let revoked = filter.revoked.unwrap_or(false);

    let rows = if let Some(sid) = &filter.schema_id {
        sqlx::query_as::<_, AttestationRow>(
            "SELECT attestation_id, schema_id, issuer, subject, value, issued_tx, revoked
             FROM attestations
             WHERE subject = $1 AND schema_id = $2 AND revoked = $3
             ORDER BY issued_at DESC
             LIMIT $4",
        )
        .bind(&subject)
        .bind(sid)
        .bind(revoked)
        .bind(limit)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, AttestationRow>(
            "SELECT attestation_id, schema_id, issuer, subject, value, issued_tx, revoked
             FROM attestations
             WHERE subject = $1 AND revoked = $2
             ORDER BY issued_at DESC
             LIMIT $3",
        )
        .bind(&subject)
        .bind(revoked)
        .bind(limit)
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(rows))
}

async fn singleton_attestations(
    State(pool): State<PgPool>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<SingletonRow>>, ApiError> {
    let rows = sqlx::query_as::<_, SingletonRow>(
        "SELECT attestation_id, schema_id, item_id, issuer, value, issued_tx, revoked
         FROM singleton_attestations
         WHERE item_id = $1
         ORDER BY issued_at DESC",
    )
    .bind(&item_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn system_intel(
    State(pool): State<PgPool>,
    Path(system_id): Path<String>,
) -> Result<Json<SystemIntelResponse>, ApiError> {
    let rows = sqlx::query_as::<_, GateIntelRow>(
        "SELECT schema_id, issuer, value, issued_at::TEXT AS issued_at
         FROM gate_intel
         WHERE system_id = $1 AND NOT revoked
         ORDER BY issued_at DESC",
    )
    .bind(&system_id)
    .fetch_all(&pool)
    .await?;

    let mut resp = SystemIntelResponse::new(system_id);
    for row in rows {
        let entry = GateIntelEntry {
            value: row.value,
            issuer: row.issuer,
            issued_at: row.issued_at,
        };
        match row.schema_id.as_str() {
            "GATE_HOSTILE" => resp.gate_hostile = resp.gate_hostile.or(Some(entry)),
            "GATE_CAMPED" => resp.gate_camped = resp.gate_camped.or(Some(entry)),
            "GATE_CLEAR" => resp.gate_clear = resp.gate_clear.or(Some(entry)),
            "GATE_TOLL" => resp.gate_toll = resp.gate_toll.or(Some(entry)),
            "HEAT_TRAP" => resp.heat_trap = resp.heat_trap.or(Some(entry)),
            "ROUTE_VERIFIED" => resp.route_verified = resp.route_verified.or(Some(entry)),
            "SYSTEM_CONTESTED" => resp.system_contested = resp.system_contested.or(Some(entry)),
            _ => {}
        }
    }

    Ok(Json(resp))
}

impl SystemIntelResponse {
    fn new(system_id: String) -> Self {
        Self {
            system_id,
            gate_hostile: None,
            gate_camped: None,
            gate_clear: None,
            gate_toll: None,
            heat_trap: None,
            route_verified: None,
            system_contested: None,
        }
    }
}

const ATTESTATION_FEED_SCHEMA_SQL: &str = "
    SELECT attestation_id, schema_id, issuer, subject, value, issued_tx,
           issued_at::TEXT AS issued_at, revoked
    FROM (
        SELECT attestation_id, schema_id, issuer, subject, value, issued_tx,
               issued_at, revoked
        FROM attestations
        UNION ALL
        SELECT attestation_id, schema_id, issuer, item_id AS subject,
               value, issued_tx, issued_at, revoked
        FROM singleton_attestations
    ) feed
    WHERE schema_id = $1 AND revoked = $2
    ORDER BY issued_at DESC
    LIMIT $3";

const ATTESTATION_FEED_SQL: &str = "
    SELECT attestation_id, schema_id, issuer, subject, value, issued_tx,
           issued_at::TEXT AS issued_at, revoked
    FROM (
        SELECT attestation_id, schema_id, issuer, subject, value, issued_tx,
               issued_at, revoked
        FROM attestations
        UNION ALL
        SELECT attestation_id, schema_id, issuer, item_id AS subject,
               value, issued_tx, issued_at, revoked
        FROM singleton_attestations
    ) feed
    WHERE revoked = $1
    ORDER BY issued_at DESC
    LIMIT $2";
