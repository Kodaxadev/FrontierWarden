use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailItem {
    pub kill_mail_id: i64,
    pub source_id: i64,
    pub environment: String,
    pub killer_name: Option<String>,
    pub killer_address: Option<String>,
    pub killer_tribe: Option<String>,
    pub victim_name: Option<String>,
    pub victim_address: Option<String>,
    pub victim_tribe: Option<String>,
    pub solar_system_id: Option<i64>,
    pub solar_system_name: Option<String>,
    pub loss_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kill_timestamp: Option<String>,
    pub indexed_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailListResponse {
    pub items: Vec<KillMailItem>,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// Reminds callers that this is raw combat telemetry, not trust scores.
    pub data_note: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillMailResponse {
    #[serde(flatten)]
    pub kill_mail: KillMailItem,
    pub raw_json: Option<serde_json::Value>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct KillMailRow {
    pub(crate) id: i64,
    pub(crate) source_id: i64,
    pub(crate) environment: String,
    pub(crate) killer_name: Option<String>,
    pub(crate) killer_address: Option<String>,
    pub(crate) killer_tribe: Option<String>,
    pub(crate) victim_name: Option<String>,
    pub(crate) victim_address: Option<String>,
    pub(crate) victim_tribe: Option<String>,
    pub(crate) solar_system_id: Option<i64>,
    pub(crate) solar_system_name: Option<String>,
    pub(crate) loss_type: Option<String>,
    pub(crate) kill_time: Option<chrono::DateTime<chrono::Utc>>,
    pub(crate) indexed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(sqlx::FromRow)]
pub(crate) struct KillMailRowWithRaw {
    pub(crate) id: i64,
    pub(crate) source_id: i64,
    pub(crate) environment: String,
    pub(crate) killer_name: Option<String>,
    pub(crate) killer_address: Option<String>,
    pub(crate) killer_tribe: Option<String>,
    pub(crate) victim_name: Option<String>,
    pub(crate) victim_address: Option<String>,
    pub(crate) victim_tribe: Option<String>,
    pub(crate) solar_system_id: Option<i64>,
    pub(crate) solar_system_name: Option<String>,
    pub(crate) loss_type: Option<String>,
    pub(crate) kill_time: Option<chrono::DateTime<chrono::Utc>>,
    pub(crate) indexed_at: chrono::DateTime<chrono::Utc>,
    pub(crate) raw_json: Option<serde_json::Value>,
}

pub(crate) fn row_to_item(r: KillMailRow) -> KillMailItem {
    KillMailItem {
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
    }
}
