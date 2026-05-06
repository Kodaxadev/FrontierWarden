use axum::{
    extract::{Extension, Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{
    api_common::{ApiError, LimitParams},
    config::EveConfig,
    eve_identity,
    rpc::normalize_sui_address,
};

pub fn router(eve_cfg: Option<EveConfig>) -> Router<PgPool> {
    let cfg_clone = eve_cfg.clone();
    Router::new()
        .route("/eve/status", get(world_status))
        .route("/eve/solarsystems", get(solar_systems))
        .route("/eve/solarsystems/{id}", get(solar_system))
        .route("/eve/tribes", get(tribes))
        .route("/eve/tribes/{id}", get(tribe))
        .route("/eve/ships", get(ships))
        .route("/eve/ships/{id}", get(ship))
        .route("/eve/types", get(types))
        .route("/eve/types/{id}", get(type_by_id))
        .route("/eve/identity/{wallet}", {
            let eve_cfg = eve_cfg.clone();
            get(
                move |state: State<PgPool>, path: Path<String>, query: Query<IdentityQuery>| {
                    let eve_cfg = eve_cfg.clone();
                    async move { identity(state, path, query, eve_cfg).await }
                },
            )
        })
        .layer(Extension(cfg_clone))
}

#[derive(Deserialize)]
struct IdentityQuery {
    refresh: Option<bool>,
}

// ── World Status ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct WorldStatus {
    systems_count: i64,
    types_count: i64,
    tribes_count: i64,
    ships_count: i64,
    source: String,
}

fn derive_source_label(eve_cfg: &Option<EveConfig>) -> String {
    match eve_cfg {
        Some(cfg) if cfg.enabled => {
            let url = cfg.world_api_base.to_lowercase();
            if url.contains("stillness") {
                "Stillness World API".to_string()
            } else if url.contains("utopia") {
                "Utopia World API".to_string()
            } else {
                "EVE World API".to_string()
            }
        }
        _ => "EVE World API (disabled)".to_string(),
    }
}

async fn world_status(
    State(pool): State<PgPool>,
    Extension(eve_cfg): Extension<Option<EveConfig>>,
) -> Result<Json<WorldStatus>, ApiError> {
    let systems_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eve_solar_systems")
        .fetch_one(&pool)
        .await?;
    let types_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eve_types")
        .fetch_one(&pool)
        .await?;
    let tribes_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eve_tribes")
        .fetch_one(&pool)
        .await?;
    let ships_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM eve_ships")
        .fetch_one(&pool)
        .await?;

    Ok(Json(WorldStatus {
        systems_count,
        types_count,
        tribes_count,
        ships_count,
        source: derive_source_label(&eve_cfg),
    }))
}

// ── Solar Systems ─────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct SolarSystemRow {
    system_id: String,
    name: Option<String>,
}

async fn solar_systems(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<SolarSystemRow>>, ApiError> {
    let limit = params.limit.unwrap_or(500).min(2000);
    let rows = sqlx::query_as::<_, SolarSystemRow>(
        "SELECT system_id, name FROM eve_solar_systems ORDER BY system_id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn solar_system(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Option<SolarSystemRow>>, ApiError> {
    let row = sqlx::query_as::<_, SolarSystemRow>(
        "SELECT system_id, name FROM eve_solar_systems WHERE system_id = $1",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?;
    Ok(Json(row))
}

// ── Tribes ────────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct TribeRow {
    tribe_id: String,
    name: Option<String>,
}

async fn tribes(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<TribeRow>>, ApiError> {
    let limit = params.limit.unwrap_or(500).min(2000);
    let rows = sqlx::query_as::<_, TribeRow>(
        "SELECT tribe_id, name FROM eve_tribes ORDER BY tribe_id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn tribe(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Option<TribeRow>>, ApiError> {
    let row =
        sqlx::query_as::<_, TribeRow>("SELECT tribe_id, name FROM eve_tribes WHERE tribe_id = $1")
            .bind(&id)
            .fetch_optional(&pool)
            .await?;
    Ok(Json(row))
}

// ── Ships ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct ShipRow {
    ship_id: String,
    name: Option<String>,
    owner_character_id: Option<String>,
    type_id: Option<String>,
}

async fn ships(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<ShipRow>>, ApiError> {
    let limit = params.limit.unwrap_or(500).min(2000);
    let rows = sqlx::query_as::<_, ShipRow>(
        "SELECT ship_id, name, owner_character_id, type_id FROM eve_ships ORDER BY ship_id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn ship(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Option<ShipRow>>, ApiError> {
    let row = sqlx::query_as::<_, ShipRow>(
        "SELECT ship_id, name, owner_character_id, type_id FROM eve_ships WHERE ship_id = $1",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?;
    Ok(Json(row))
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct TypeRow {
    type_id: String,
    name: Option<String>,
    group_id: Option<String>,
    category_id: Option<String>,
}

async fn types(
    State(pool): State<PgPool>,
    Query(params): Query<LimitParams>,
) -> Result<Json<Vec<TypeRow>>, ApiError> {
    let limit = params.limit.unwrap_or(500).min(2000);
    let rows = sqlx::query_as::<_, TypeRow>(
        "SELECT type_id, name, group_id, category_id FROM eve_types ORDER BY type_id LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

async fn type_by_id(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Option<TypeRow>>, ApiError> {
    let row = sqlx::query_as::<_, TypeRow>(
        "SELECT type_id, name, group_id, category_id FROM eve_types WHERE type_id = $1",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?;
    Ok(Json(row))
}

// ── Identity ──────────────────────────────────────────────────────────────────

async fn identity(
    State(pool): State<PgPool>,
    Path(wallet): Path<String>,
    Query(query): Query<IdentityQuery>,
    eve_cfg: Option<EveConfig>,
) -> Result<Json<eve_identity::EveIdentity>, ApiError> {
    let normalized = normalize_sui_address(&wallet);
    let refresh = query.refresh.unwrap_or(false);

    // Return cached identity if present (unless refresh requested)
    if !refresh {
        if let Some(cached) = eve_identity::resolve_cached_identity(&pool, &normalized).await? {
            // If cached result was graphql_error, allow retry by skipping cache
            if cached.identity_status != "graphql_error" {
                return Ok(Json(cached));
            }
            tracing::info!(wallet = %normalized, "cached graphql_error found, re-attempting lookup");
        }
    }

    // Attempt GraphQL lookup if config is present
    if let Some(eve) = eve_cfg {
        if eve.enabled {
            match eve_identity::resolve_identity_via_graphql(&pool, &normalized, &eve).await {
                Ok(identity) => return Ok(Json(identity)),
                Err(e) => {
                    tracing::warn!(wallet = %normalized, error = %e, "GraphQL lookup failed, falling back to unresolved");
                }
            }
        }
    }

    // Safe unresolved response (null EVE identity + FW profile if found)
    let unresolved = eve_identity::unresolved_identity(&pool, &normalized).await?;
    Ok(Json(unresolved))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eve_router_builds_without_panic() {
        // Verify the router constructs without panicking.
        // Route shape validation requires a real PgPool or a mock Service.
        let _app = router(None);
    }
}
