use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::api_common::ApiError;

use super::types::*;
use super::{clamp_limit, decode_cursor, encode_cursor, DATA_NOTE};

#[derive(Deserialize)]
pub(crate) struct PageParams {
    limit: Option<i64>,
    cursor: Option<String>,
}

/// GET /kill-mails?limit=&cursor=
pub(crate) async fn list_kill_mails(
    State(pool): State<PgPool>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE id < $1
             ORDER BY id DESC
             LIMIT $2",
        )
        .bind(before_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             ORDER BY id DESC
             LIMIT $1",
        )
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    };

    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /kill-mails/:id
pub(crate) async fn get_kill_mail(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, KillMailRowWithRaw>(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at, raw_json
         FROM world_kill_mails
         WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await?;

    let Some(r) = row else {
        return Ok((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "kill mail not found", "id": id })),
        )
            .into_response());
    };

    let kill_mail = KillMailItem {
        kill_mail_id: r.id,
        source_id: r.source_id,
        environment: r.environment,
        killer_name: r.killer_name,
        killer_address: r.killer_address,
        killer_tribe: r.killer_tribe,
        victim_name: r.victim_name,
        victim_address: r.victim_address,
        victim_tribe: r.victim_tribe,
        solar_system_id: r.solar_system_id,
        solar_system_name: r.solar_system_name,
        loss_type: r.loss_type,
        kill_timestamp: r.kill_time.map(|t| t.to_rfc3339()),
        indexed_at: r.indexed_at.to_rfc3339(),
    };

    Ok(Json(KillMailResponse {
        kill_mail,
        raw_json: r.raw_json,
    })
    .into_response())
}

/// GET /world/characters/:address/kills?limit=&cursor=
pub(crate) async fn character_kills(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = fetch_by_column(&pool, "killer_address", &address, limit, cursor_id).await?;
    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /world/characters/:address/losses?limit=&cursor=
pub(crate) async fn character_losses(
    State(pool): State<PgPool>,
    Path(address): Path<String>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = fetch_by_column(&pool, "victim_address", &address, limit, cursor_id).await?;
    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

/// GET /world/systems/:system_id/kills?limit=&cursor=
pub(crate) async fn system_kills(
    State(pool): State<PgPool>,
    Path(system_id): Path<i64>,
    Query(params): Query<PageParams>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = clamp_limit(params.limit);
    let cursor_id = params.cursor.as_deref().and_then(decode_cursor);

    let rows = if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE solar_system_id = $1 AND id < $2
             ORDER BY id DESC
             LIMIT $3",
        )
        .bind(system_id)
        .bind(before_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, KillMailRow>(
            "SELECT id, source_id, environment,
                    killer_name, killer_address, killer_tribe,
                    victim_name, victim_address, victim_tribe,
                    solar_system_id, solar_system_name,
                    loss_type, kill_time, indexed_at
             FROM world_kill_mails
             WHERE solar_system_id = $1
             ORDER BY id DESC
             LIMIT $2",
        )
        .bind(system_id)
        .bind(limit + 1)
        .fetch_all(&pool)
        .await?
    };

    let (items, next_cursor) = paginate(rows, limit);
    let total = items.len();

    Ok(Json(KillMailListResponse {
        items,
        total,
        next_cursor,
        data_note: DATA_NOTE,
    }))
}

async fn fetch_by_column(
    pool: &PgPool,
    column: &str,
    value: &str,
    limit: i64,
    cursor_id: Option<i64>,
) -> Result<Vec<KillMailRow>, sqlx::Error> {
    let sql_cursor = format!(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at
         FROM world_kill_mails
         WHERE {column} = $1 AND id < $2
         ORDER BY id DESC
         LIMIT $3"
    );
    let sql_first = format!(
        "SELECT id, source_id, environment,
                killer_name, killer_address, killer_tribe,
                victim_name, victim_address, victim_tribe,
                solar_system_id, solar_system_name,
                loss_type, kill_time, indexed_at
         FROM world_kill_mails
         WHERE {column} = $1
         ORDER BY id DESC
         LIMIT $2"
    );

    if let Some(before_id) = cursor_id {
        sqlx::query_as::<_, KillMailRow>(&sql_cursor)
            .bind(value)
            .bind(before_id)
            .bind(limit + 1)
            .fetch_all(pool)
            .await
    } else {
        sqlx::query_as::<_, KillMailRow>(&sql_first)
            .bind(value)
            .bind(limit + 1)
            .fetch_all(pool)
            .await
    }
}

fn paginate(mut rows: Vec<KillMailRow>, limit: i64) -> (Vec<KillMailItem>, Option<String>) {
    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.truncate(limit as usize);
    }
    let next_cursor = if has_more {
        rows.last().map(|r| encode_cursor(r.id))
    } else {
        None
    };
    let items = rows.into_iter().map(row_to_item).collect();
    (items, next_cursor)
}
