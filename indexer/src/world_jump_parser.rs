use anyhow::{Context, Result};

use crate::{
    rpc::SuiEvent,
    world_gates_parser::parse_tenant_item_id,
    world_topology_parser::parse_id_bytes_field,
};

// ── Row type ──────────────────────────────────────────────────────────────────

/// Parsed payload from a `JumpEvent` world contract event.
///
/// Field mapping (from `gate.move` @ db577cf9):
/// ```move
/// public struct JumpEvent has copy, drop {
///     source_gate_id:       ID,
///     source_gate_key:      TenantItemId,
///     destination_gate_id:  ID,
///     destination_gate_key: TenantItemId,
///     character_id:         ID,
///     character_key:        TenantItemId,
/// }
/// ```
/// ID fields arrive in parsedJson as `{ "bytes": "0x..." }`.
/// TenantItemId fields arrive as `{ "item_id": "12345", "tenant": "stillness" }`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JumpEventRow {
    pub tx_digest: String,
    pub event_seq: i64,
    pub checkpoint: i64,
    pub source_gate_id: String,
    pub source_gate_item_id: i64,
    pub source_gate_tenant: String,
    pub destination_gate_id: String,
    pub destination_gate_item_id: i64,
    pub destination_gate_tenant: String,
    pub character_id: String,
    pub character_item_id: i64,
    pub character_tenant: String,
}

// ── Parser ────────────────────────────────────────────────────────────────────

/// Parse a `JumpEvent` from a [`SuiEvent`] into a [`JumpEventRow`].
///
/// `checkpoint` must be passed in from the outer polling loop — the Sui
/// `SuiEvent` carries `ev.checkpoint` as `Option<String>` which the caller
/// resolves before invoking this function.
pub fn parse_jump_event(ev: &SuiEvent, checkpoint: i64) -> Result<JumpEventRow> {
    let json = &ev.parsed_json;

    let event_seq: i64 = ev
        .id
        .event_seq
        .parse()
        .context("JumpEvent: event_seq is not a valid i64")?;

    let source_gate_id = parse_id_bytes_field(json, "source_gate_id")
        .context("JumpEvent: source_gate_id")?;
    let destination_gate_id = parse_id_bytes_field(json, "destination_gate_id")
        .context("JumpEvent: destination_gate_id")?;
    let character_id = parse_id_bytes_field(json, "character_id")
        .context("JumpEvent: character_id")?;

    let src_key = json
        .get("source_gate_key")
        .context("JumpEvent: missing source_gate_key")?;
    let src = parse_tenant_item_id(src_key).context("JumpEvent: source_gate_key")?;

    let dst_key = json
        .get("destination_gate_key")
        .context("JumpEvent: missing destination_gate_key")?;
    let dst = parse_tenant_item_id(dst_key).context("JumpEvent: destination_gate_key")?;

    let char_key = json
        .get("character_key")
        .context("JumpEvent: missing character_key")?;
    let chr = parse_tenant_item_id(char_key).context("JumpEvent: character_key")?;

    Ok(JumpEventRow {
        tx_digest: ev.id.tx_digest.clone(),
        event_seq,
        checkpoint,
        source_gate_id,
        source_gate_item_id: src.item_id,
        source_gate_tenant: src.tenant,
        destination_gate_id,
        destination_gate_item_id: dst.item_id,
        destination_gate_tenant: dst.tenant,
        character_id,
        character_item_id: chr.item_id,
        character_tenant: chr.tenant,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{parse_jump_event, JumpEventRow};
    use crate::rpc::{EventId, SuiEvent};

    fn bytes_id(hex: &str) -> serde_json::Value {
        json!({ "bytes": hex })
    }

    /// Build a minimal mock SuiEvent with a JumpEvent parsedJson payload.
    fn make_event(parsed_json: serde_json::Value, tx: &str, seq: &str) -> SuiEvent {
        SuiEvent {
            id: EventId {
                tx_digest: tx.to_string(),
                event_seq: seq.to_string(),
            },
            package_id: "0x0000000000000000000000000000000000000000000000000000000000000001"
                .to_string(),
            transaction_module: "gate".to_string(),
            sender: None,
            type_: "gate::JumpEvent".to_string(),
            parsed_json,
            timestamp_ms: None,
            checkpoint: None,
        }
    }

    fn jump_payload() -> serde_json::Value {
        json!({
            "source_gate_id":       bytes_id("0xaaaa000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": "11111", "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0xbbbb000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": "22222", "tenant": "stillness" },
            "character_id":         bytes_id("0xcccc000000000000000000000000000000000000000000000000000000000003"),
            "character_key":        { "item_id": "33333", "tenant": "stillness" }
        })
    }

    #[test]
    fn parse_jump_event_all_fields() {
        let ev = make_event(jump_payload(), "deadbeef01", "0");
        let row = parse_jump_event(&ev, 308_264_360).expect("should parse JumpEvent");

        assert_eq!(
            row.source_gate_id,
            "0xaaaa000000000000000000000000000000000000000000000000000000000001"
        );
        assert_eq!(row.source_gate_item_id, 11111);
        assert_eq!(row.source_gate_tenant, "stillness");
        assert_eq!(
            row.destination_gate_id,
            "0xbbbb000000000000000000000000000000000000000000000000000000000002"
        );
        assert_eq!(row.destination_gate_item_id, 22222);
        assert_eq!(row.destination_gate_tenant, "stillness");
        assert_eq!(
            row.character_id,
            "0xcccc000000000000000000000000000000000000000000000000000000000003"
        );
        assert_eq!(row.character_item_id, 33333);
        assert_eq!(row.character_tenant, "stillness");
        assert_eq!(row.tx_digest, "deadbeef01");
        assert_eq!(row.event_seq, 0);
        assert_eq!(row.checkpoint, 308_264_360);
    }

    #[test]
    fn parse_character_id_bytes() {
        let payload = json!({
            "source_gate_id":       bytes_id("0x1111000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": "1", "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0x2222000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": "2", "tenant": "stillness" },
            "character_id":         bytes_id("0xabc"),
            "character_key":        { "item_id": "9999", "tenant": "stillness" }
        });
        let ev = make_event(payload, "txabc", "0");
        let row = parse_jump_event(&ev, 1).expect("should parse");
        assert_eq!(
            row.character_id,
            "0x0000000000000000000000000000000000000000000000000000000000000abc"
        );
    }

    #[test]
    fn parse_character_key_tenant_item() {
        // item_id as string (common Sui JSON encoding for u64)
        let payload = json!({
            "source_gate_id":       bytes_id("0x1111000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": "1", "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0x2222000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": "2", "tenant": "stillness" },
            "character_id":         bytes_id("0x0000000000000000000000000000000000000000000000000000000000000001"),
            "character_key":        { "item_id": "2112089652", "tenant": "stillness" }
        });
        let ev = make_event(payload, "txkey", "1");
        let row = parse_jump_event(&ev, 999).expect("should parse");
        assert_eq!(row.character_item_id, 2_112_089_652);
        assert_eq!(row.character_tenant, "stillness");
        assert_eq!(row.event_seq, 1);
    }

    #[test]
    fn parse_gate_ids_both() {
        let ev = make_event(jump_payload(), "txgates", "5");
        let row = parse_jump_event(&ev, 500).expect("should parse gate IDs");
        // Source and destination are independently parsed and not swapped
        assert_ne!(row.source_gate_id, row.destination_gate_id);
        assert!(row.source_gate_id.starts_with("0xaaaa"));
        assert!(row.destination_gate_id.starts_with("0xbbbb"));
    }

    #[test]
    fn parse_jump_event_numeric_item_id() {
        // item_id as JSON number (some events encode u64 as number when < 2^53)
        let payload = json!({
            "source_gate_id":       bytes_id("0xaaaa000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": 11111, "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0xbbbb000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": 22222, "tenant": "stillness" },
            "character_id":         bytes_id("0xcccc000000000000000000000000000000000000000000000000000000000003"),
            "character_key":        { "item_id": 33333, "tenant": "stillness" }
        });
        let ev = make_event(payload, "txnum", "0");
        let row = parse_jump_event(&ev, 100).expect("numeric item_id should parse");
        assert_eq!(row.source_gate_item_id, 11111);
        assert_eq!(row.destination_gate_item_id, 22222);
        assert_eq!(row.character_item_id, 33333);
    }

    /// DB dedup test: insert the same row twice, assert count = 1.
    /// Requires a live Postgres database; skip without one.
    #[ignore = "requires live Postgres DB — run with DATABASE_URL set"]
    #[tokio::test]
    async fn insert_jump_dedup() {
        use crate::world_jump::insert_jump_event;

        let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .expect("pool connect failed");

        let row = JumpEventRow {
            tx_digest: "0xdeadfeeddeadfeeddeadfeeddeadfeeddeadfeeddeadfeeddeadfeeddeadfeed"
                .to_string(),
            event_seq: 0,
            checkpoint: 308_264_360,
            source_gate_id:
                "0xaaaa000000000000000000000000000000000000000000000000000000000001".to_string(),
            source_gate_item_id: 11111,
            source_gate_tenant: "stillness".to_string(),
            destination_gate_id:
                "0xbbbb000000000000000000000000000000000000000000000000000000000002".to_string(),
            destination_gate_item_id: 22222,
            destination_gate_tenant: "stillness".to_string(),
            character_id:
                "0xcccc000000000000000000000000000000000000000000000000000000000003".to_string(),
            character_item_id: 33333,
            character_tenant: "stillness".to_string(),
        };

        insert_jump_event(&pool, &row).await.expect("first insert");
        insert_jump_event(&pool, &row).await.expect("second insert (dedup)");

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM world_gate_jumps WHERE tx_digest = $1 AND event_seq = $2",
        )
        .bind(&row.tx_digest)
        .bind(row.event_seq)
        .fetch_one(&pool)
        .await
        .expect("count query");

        assert_eq!(count, 1, "ON CONFLICT DO NOTHING should deduplicate");

        // Cleanup
        sqlx::query("DELETE FROM world_gate_jumps WHERE tx_digest = $1 AND event_seq = $2")
            .bind(&row.tx_digest)
            .bind(row.event_seq)
            .execute(&pool)
            .await
            .ok();
    }
}
