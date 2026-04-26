use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::time::Instant;

// ── Startup ───────────────────────────────────────────────────────────────────

static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

pub fn router(pool: PgPool) -> Router {
    START.get_or_init(Instant::now);
    Router::new()
        .route("/health",                            get(health))
        .route("/scores/:profile_id",                get(scores_for_profile))
        .route("/scores/:profile_id/:schema_id",     get(score_single))
        .route("/attestations/:subject",             get(attestations_for_subject))
        .route("/attestations/singleton/:item_id",   get(singleton_attestations))
        .route("/leaderboard/:schema_id",            get(leaderboard))
        .route("/intel/:system_id",                  get(system_intel))
        .with_state(pool)
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    status:       &'static str,
    uptime_secs:  u64,
}

#[derive(Serialize, sqlx::FromRow)]
struct ScoreRow {
    profile_id:      String,
    schema_id:       String,
    value:           i64,
    issuer:          String,
    last_tx_digest:  String,
    last_checkpoint: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct AttestationRow {
    attestation_id: String,
    schema_id:      String,
    issuer:         String,
    subject:        String,
    value:          i64,
    issued_tx:      String,
    revoked:        bool,
}

#[derive(Serialize, sqlx::FromRow)]
struct SingletonRow {
    attestation_id: String,
    schema_id:      String,
    item_id:        String,
    issuer:         String,
    value:          i64,
    issued_tx:      String,
    revoked:        bool,
}

#[derive(Serialize, sqlx::FromRow)]
struct LeaderboardEntry {
    profile_id: String,
    value:      i64,
    issuer:     String,
}

#[derive(sqlx::FromRow)]
struct GateIntelRow {
    schema_id: String,
    issuer:    String,
    value:     i64,
    issued_at: String,
}

#[derive(Serialize)]
struct GateIntelEntry {
    value:     i64,
    issuer:    String,
    issued_at: String,
}

#[derive(Serialize)]
struct SystemIntelResponse {
    system_id:        String,
    gate_hostile:     Option<GateIntelEntry>,
    gate_camped:      Option<GateIntelEntry>,
    gate_clear:       Option<GateIntelEntry>,
    gate_toll:        Option<GateIntelEntry>,
    heat_trap:        Option<GateIntelEntry>,
    route_verified:   Option<GateIntelEntry>,
    system_contested: Option<GateIntelEntry>,
}

// ── Query params ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AttestationFilter {
    schema_id: Option<String>,
    limit:     Option<i64>,
    revoked:   Option<bool>,
}

#[derive(Deserialize)]
struct LeaderboardParams {
    limit: Option<i64>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn health() -> Json<HealthResponse> {
    let uptime = START.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    Json(HealthResponse { status: "ok", uptime_secs: uptime })
}

// All scores for a profile (one row per schema_id).
async fn scores_for_profile(
    State(pool): State<PgPool>,
    Path(profile_id): Path<String>,
) -> Result<Json<Vec<ScoreRow>>, ApiError> {
    let rows = sqlx::query_as::<_, ScoreRow>(
        "SELECT profile_id, schema_id, value, issuer, last_tx_digest, last_checkpoint
         FROM score_cache
         WHERE profile_id = $1
         ORDER BY schema_id",
    )
    .bind(&profile_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

// Single score for (profile, schema).
async fn score_single(
    State(pool): State<PgPool>,
    Path((profile_id, schema_id)): Path<(String, String)>,
) -> Result<Json<Option<ScoreRow>>, ApiError> {
    let row = sqlx::query_as::<_, ScoreRow>(
        "SELECT profile_id, schema_id, value, issuer, last_tx_digest, last_checkpoint
         FROM score_cache
         WHERE profile_id = $1 AND schema_id = $2",
    )
    .bind(&profile_id)
    .bind(&schema_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

// Attestations issued to a subject address.
// ?schema_id=CREDIT&limit=50&revoked=false
async fn attestations_for_subject(
    State(pool): State<PgPool>,
    Path(subject): Path<String>,
    Query(filter): Query<AttestationFilter>,
) -> Result<Json<Vec<AttestationRow>>, ApiError> {
    let limit    = filter.limit.unwrap_or(50).min(200);
    let revoked  = filter.revoked.unwrap_or(false);

    let rows = if let Some(sid) = &filter.schema_id {
        sqlx::query_as::<_, AttestationRow>(
            "SELECT attestation_id, schema_id, issuer, subject, value, issued_tx, revoked
             FROM attestations
             WHERE subject = $1 AND schema_id = $2 AND revoked = $3
             ORDER BY issued_at DESC
             LIMIT $4",
        )
        .bind(&subject).bind(sid).bind(revoked).bind(limit)
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
        .bind(&subject).bind(revoked).bind(limit)
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(rows))
}

// Singleton attestations attached to an item (ship, module, etc.).
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

// Top N holders of a given schema score.
// GET /leaderboard/PIRATE_INDEX_V1?limit=20
async fn leaderboard(
    State(pool): State<PgPool>,
    Path(schema_id): Path<String>,
    Query(params): Query<LeaderboardParams>,
) -> Result<Json<Vec<LeaderboardEntry>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);

    let rows = sqlx::query_as::<_, LeaderboardEntry>(
        "SELECT profile_id, value, issuer
         FROM score_cache
         WHERE schema_id = $1
         ORDER BY value DESC
         LIMIT $2",
    )
    .bind(&schema_id)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

// Gate-intel pivot: one nullable field per schema, most-recent active attestation wins.
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

    let mut resp = SystemIntelResponse {
        system_id,
        gate_hostile:     None,
        gate_camped:      None,
        gate_clear:       None,
        gate_toll:        None,
        heat_trap:        None,
        route_verified:   None,
        system_contested: None,
    };

    for row in rows {
        let entry = GateIntelEntry { value: row.value, issuer: row.issuer, issued_at: row.issued_at };
        match row.schema_id.as_str() {
            "GATE_HOSTILE"     => { resp.gate_hostile     = resp.gate_hostile.or(Some(entry)); }
            "GATE_CAMPED"      => { resp.gate_camped      = resp.gate_camped.or(Some(entry)); }
            "GATE_CLEAR"       => { resp.gate_clear       = resp.gate_clear.or(Some(entry)); }
            "GATE_TOLL"        => { resp.gate_toll        = resp.gate_toll.or(Some(entry)); }
            "HEAT_TRAP"        => { resp.heat_trap        = resp.heat_trap.or(Some(entry)); }
            "ROUTE_VERIFIED"   => { resp.route_verified   = resp.route_verified.or(Some(entry)); }
            "SYSTEM_CONTESTED" => { resp.system_contested = resp.system_contested.or(Some(entry)); }
            _ => {}
        }
    }

    Ok(Json(resp))
}

// ── Error type ────────────────────────────────────────────────────────────────

struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("API error: {:#}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self { ApiError(e.into()) }
}
