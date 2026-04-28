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
        .route("/scores/{profile_id}",                get(scores_for_profile))
        .route("/scores/{profile_id}/{schema_id}",   get(score_single))
        .route("/attestations/{subject}",            get(attestations_for_subject))
        .route("/attestations/singleton/{item_id}",  get(singleton_attestations))
        .route("/leaderboard/{schema_id}",           get(leaderboard))
        .route("/intel/{system_id}",                 get(system_intel))
        .route("/gates",                             get(gates))
        .route("/gates/{gate_id}",                   get(gate_single))
        .route("/gates/{gate_id}/policy",            get(gate_policy))
        .route("/gates/{gate_id}/passages",          get(gate_passages))
        .route("/challenges",                        get(challenges))
        .route("/challenges/{challenge_id}",          get(challenge_single))
        .route("/oracles/{oracle}/challenges",       get(challenges_for_oracle))
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

#[derive(Serialize, sqlx::FromRow)]
struct GateSummaryRow {
    gate_id:           String,
    ally_threshold:    Option<i64>,
    base_toll_mist:    Option<i64>,
    config_updated_at: Option<String>,
    latest_checkpoint: Option<i64>,
    passages_24h:      i64,
    denies_24h:        i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct GatePolicyRow {
    gate_id:        String,
    ally_threshold: i64,
    base_toll_mist: i64,
    tx_digest:      String,
    checkpoint_seq: i64,
    indexed_at:     String,
}

#[derive(Serialize, sqlx::FromRow)]
struct GatePassageRow {
    gate_id:        String,
    traveler:       String,
    allowed:        bool,
    score:          Option<i64>,
    toll_paid:      Option<i64>,
    tier:           Option<i16>,
    reason:         Option<i16>,
    epoch:          i64,
    tx_digest:      String,
    checkpoint_seq: i64,
    indexed_at:     String,
}

#[derive(Serialize, sqlx::FromRow)]
struct FraudChallengeRow {
    challenge_id:   String,
    attestation_id: String,
    challenger:     String,
    oracle:         String,
    created_tx:     String,
    created_at:     String,
    resolved:       bool,
    guilty:         Option<bool>,
    slash_amount:   Option<i64>,
    resolved_tx:    Option<String>,
    resolved_at:    Option<String>,
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

#[derive(Deserialize)]
struct LimitParams {
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

async fn gates(
    State(pool): State<PgPool>,
) -> Result<Json<Vec<GateSummaryRow>>, ApiError> {
    let rows = sqlx::query_as::<_, GateSummaryRow>(
        "WITH gate_ids AS (
             SELECT gate_id FROM gate_config_updates
             UNION
             SELECT gate_id FROM gate_passages
         ),
         latest_config AS (
             SELECT DISTINCT ON (gate_id)
                    gate_id, ally_threshold, base_toll_mist, checkpoint_seq, indexed_at
             FROM gate_config_updates
             ORDER BY gate_id, indexed_at DESC
         )
         SELECT g.gate_id,
                c.ally_threshold,
                c.base_toll_mist,
                c.indexed_at::TEXT AS config_updated_at,
                NULLIF(GREATEST(COALESCE(MAX(c.checkpoint_seq), 0), COALESCE(MAX(p.checkpoint_seq), 0)), 0)::BIGINT AS latest_checkpoint,
                COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours')::BIGINT AS passages_24h,
                COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours' AND NOT p.allowed)::BIGINT AS denies_24h
         FROM gate_ids g
         LEFT JOIN latest_config c ON c.gate_id = g.gate_id
         LEFT JOIN gate_passages p ON p.gate_id = g.gate_id
         GROUP BY g.gate_id, c.ally_threshold, c.base_toll_mist, c.indexed_at
         ORDER BY COALESCE(c.indexed_at, NOW()) DESC, g.gate_id",
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn gate_single(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<Json<Option<GateSummaryRow>>, ApiError> {
    let row = sqlx::query_as::<_, GateSummaryRow>(
         "WITH latest_config AS (
             SELECT DISTINCT ON (gate_id)
                    gate_id, ally_threshold, base_toll_mist, checkpoint_seq, indexed_at
             FROM gate_config_updates
             WHERE gate_id = $1
             ORDER BY gate_id, indexed_at DESC
         )
         SELECT g.gate_id,
                c.ally_threshold,
                c.base_toll_mist,
                c.indexed_at::TEXT AS config_updated_at,
                NULLIF(GREATEST(COALESCE(MAX(c.checkpoint_seq), 0), COALESCE(MAX(p.checkpoint_seq), 0)), 0)::BIGINT AS latest_checkpoint,
                COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours')::BIGINT AS passages_24h,
                COUNT(p.id) FILTER (WHERE p.indexed_at >= NOW() - INTERVAL '24 hours' AND NOT p.allowed)::BIGINT AS denies_24h
         FROM (SELECT $1::TEXT AS gate_id) g
         LEFT JOIN latest_config c ON c.gate_id = g.gate_id
         LEFT JOIN gate_passages p ON p.gate_id = g.gate_id
         GROUP BY g.gate_id, c.ally_threshold, c.base_toll_mist, c.indexed_at
         HAVING c.gate_id IS NOT NULL OR COUNT(p.id) > 0",
    )
    .bind(&gate_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn gate_policy(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
) -> Result<Json<Option<GatePolicyRow>>, ApiError> {
    let row = sqlx::query_as::<_, GatePolicyRow>(
        "SELECT gate_id, ally_threshold, base_toll_mist, tx_digest, checkpoint_seq,
                indexed_at::TEXT AS indexed_at
         FROM gate_config_updates
         WHERE gate_id = $1
         ORDER BY indexed_at DESC
         LIMIT 1",
    )
    .bind(&gate_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn gate_passages(
    State(pool): State<PgPool>,
    Path(gate_id): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<GatePassageRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, GatePassageRow>(
        "SELECT gate_id, traveler, allowed, score, toll_paid, tier, reason, epoch,
                tx_digest, checkpoint_seq, indexed_at::TEXT AS indexed_at
         FROM gate_passages
         WHERE gate_id = $1
         ORDER BY indexed_at DESC
         LIMIT $2",
    )
    .bind(&gate_id)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn challenges(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<FraudChallengeRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         ORDER BY created_at DESC
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

async fn challenge_single(
    State(pool): State<PgPool>,
    Path(challenge_id): Path<String>,
) -> Result<Json<Option<FraudChallengeRow>>, ApiError> {
    let row = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         WHERE challenge_id = $1",
    )
    .bind(&challenge_id)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(row))
}

async fn challenges_for_oracle(
    State(pool): State<PgPool>,
    Path(oracle): Path<String>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<FraudChallengeRow>>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);
    let rows = sqlx::query_as::<_, FraudChallengeRow>(
        "SELECT challenge_id, attestation_id, challenger, oracle, created_tx,
                created_at::TEXT AS created_at, resolved, guilty, slash_amount,
                resolved_tx, resolved_at::TEXT AS resolved_at
         FROM fraud_challenges
         WHERE oracle = $1
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(&oracle)
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}

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
