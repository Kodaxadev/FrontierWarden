use anyhow::{Context, Result};
use serde_json::Value;

use crate::world_gates_parser::parse_tenant_item_id;

// ── Row types ─────────────────────────────────────────────────────────────────

/// Parsed payload from a `GateLinkedEvent` world contract event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateLinkRow {
    pub source_gate_id: String,
    pub destination_gate_id: String,
    pub source_gate_item_id: i64,
    pub source_gate_tenant: String,
    pub destination_gate_item_id: i64,
    pub destination_gate_tenant: String,
    pub linked_at_checkpoint: i64,
    pub tx_digest: Option<String>,
}

/// Parsed payload from a `GateUnlinkedEvent` world contract event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateUnlinkRow {
    pub source_gate_id: String,
    pub destination_gate_id: String,
    pub unlinked_at_checkpoint: i64,
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/// Parse a `GateLinkedEvent` JSON payload into a [`GateLinkRow`].
///
/// Expected JSON shape (Sui event parsedJson):
/// ```json
/// {
///   "source_gate_id":       { "bytes": "0x..." },
///   "source_gate_key":      { "item_id": "12345", "tenant": "stillness" },
///   "destination_gate_id":  { "bytes": "0x..." },
///   "destination_gate_key": { "item_id": "67890", "tenant": "stillness" }
/// }
/// ```
pub fn parse_gate_linked_event(
    event_json: &Value,
    checkpoint: i64,
    tx_digest: Option<&str>,
) -> Result<GateLinkRow> {
    let source_gate_id = parse_id_bytes_field(event_json, "source_gate_id")
        .context("GateLinkedEvent: source_gate_id")?;
    let destination_gate_id = parse_id_bytes_field(event_json, "destination_gate_id")
        .context("GateLinkedEvent: destination_gate_id")?;

    let source_key = event_json
        .get("source_gate_key")
        .context("GateLinkedEvent: missing source_gate_key")?;
    let src = parse_tenant_item_id(source_key).context("GateLinkedEvent: source_gate_key")?;

    let dest_key = event_json
        .get("destination_gate_key")
        .context("GateLinkedEvent: missing destination_gate_key")?;
    let dst = parse_tenant_item_id(dest_key).context("GateLinkedEvent: destination_gate_key")?;

    Ok(GateLinkRow {
        source_gate_id,
        destination_gate_id,
        source_gate_item_id: src.item_id,
        source_gate_tenant: src.tenant,
        destination_gate_item_id: dst.item_id,
        destination_gate_tenant: dst.tenant,
        linked_at_checkpoint: checkpoint,
        tx_digest: tx_digest.map(str::to_string),
    })
}

/// Parse a `GateUnlinkedEvent` JSON payload into a [`GateUnlinkRow`].
///
/// Expected JSON shape is identical to `GateLinkedEvent` — only
/// `source_gate_id` and `destination_gate_id` are needed for the unlink path.
pub fn parse_gate_unlinked_event(event_json: &Value, checkpoint: i64) -> Result<GateUnlinkRow> {
    let source_gate_id = parse_id_bytes_field(event_json, "source_gate_id")
        .context("GateUnlinkedEvent: source_gate_id")?;
    let destination_gate_id = parse_id_bytes_field(event_json, "destination_gate_id")
        .context("GateUnlinkedEvent: destination_gate_id")?;

    Ok(GateUnlinkRow {
        source_gate_id,
        destination_gate_id,
        unlinked_at_checkpoint: checkpoint,
    })
}

// ── Field helpers ─────────────────────────────────────────────────────────────

/// Extract a Sui object ID from a `{ "bytes": "0x..." }` or bare hex string.
///
/// Sui event payloads represent `ID` fields as `{ "bytes": "0x..." }` objects.
/// This function handles both that shape and a bare string value.
pub fn parse_id_bytes_field(payload: &Value, key: &str) -> Result<String> {
    let field = payload
        .get(key)
        .with_context(|| format!("missing field '{key}'"))?;
    extract_id_value(field).with_context(|| format!("field '{key}': cannot extract ID"))
}

fn extract_id_value(value: &Value) -> Result<String> {
    // { "bytes": "0x..." } shape (most common in Sui event payloads)
    if let Some(bytes_str) = value.get("bytes").and_then(Value::as_str) {
        return Ok(normalize_sui_address(bytes_str));
    }
    // Bare string — already a hex address
    if let Some(s) = value.as_str() {
        return Ok(normalize_sui_address(s));
    }
    // { "id": "0x..." } shape (seen in some object reads)
    if let Some(id_str) = value.get("id").and_then(Value::as_str) {
        return Ok(normalize_sui_address(id_str));
    }
    anyhow::bail!("cannot extract Sui ID from value: {value}")
}

fn normalize_sui_address(input: &str) -> String {
    let stripped = input
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X")
        .to_ascii_lowercase();
    format!("0x{stripped:0>64}")
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        parse_gate_linked_event, parse_gate_unlinked_event, parse_id_bytes_field,
    };

    fn bytes_id(hex: &str) -> serde_json::Value {
        json!({ "bytes": hex })
    }

    fn linked_event() -> serde_json::Value {
        json!({
            "source_gate_id":       bytes_id("0xaaaa000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": "12345", "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0xbbbb000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": "67890", "tenant": "stillness" }
        })
    }

    fn unlinked_event() -> serde_json::Value {
        json!({
            "source_gate_id":       bytes_id("0xaaaa000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": "12345", "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0xbbbb000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": "67890", "tenant": "stillness" }
        })
    }

    #[test]
    fn parse_gate_linked_event_fields_string_item_id() {
        let ev = linked_event();
        let row = parse_gate_linked_event(&ev, 1_000_000, Some("deadbeef"))
            .expect("should parse linked event");

        assert_eq!(
            row.source_gate_id,
            "0xaaaa000000000000000000000000000000000000000000000000000000000001"
        );
        assert_eq!(
            row.destination_gate_id,
            "0xbbbb000000000000000000000000000000000000000000000000000000000002"
        );
        assert_eq!(row.source_gate_item_id, 12345);
        assert_eq!(row.source_gate_tenant, "stillness");
        assert_eq!(row.destination_gate_item_id, 67890);
        assert_eq!(row.destination_gate_tenant, "stillness");
        assert_eq!(row.linked_at_checkpoint, 1_000_000);
        assert_eq!(row.tx_digest.as_deref(), Some("deadbeef"));
    }

    #[test]
    fn parse_gate_linked_event_fields_numeric_item_id() {
        let ev = json!({
            "source_gate_id":       bytes_id("0xaaaa000000000000000000000000000000000000000000000000000000000001"),
            "source_gate_key":      { "item_id": 12345, "tenant": "stillness" },
            "destination_gate_id":  bytes_id("0xbbbb000000000000000000000000000000000000000000000000000000000002"),
            "destination_gate_key": { "item_id": 67890, "tenant": "stillness" }
        });
        let row = parse_gate_linked_event(&ev, 999, None).expect("numeric item_id should parse");
        assert_eq!(row.source_gate_item_id, 12345);
        assert_eq!(row.destination_gate_item_id, 67890);
        assert!(row.tx_digest.is_none());
    }

    #[test]
    fn parse_gate_unlinked_event_fields() {
        let ev = unlinked_event();
        let row = parse_gate_unlinked_event(&ev, 2_000_000)
            .expect("should parse unlinked event");

        assert_eq!(
            row.source_gate_id,
            "0xaaaa000000000000000000000000000000000000000000000000000000000001"
        );
        assert_eq!(
            row.destination_gate_id,
            "0xbbbb000000000000000000000000000000000000000000000000000000000002"
        );
        assert_eq!(row.unlinked_at_checkpoint, 2_000_000);
    }

    #[test]
    fn parse_id_bytes_field_extracts_hex() {
        let payload = json!({
            "gate_id": { "bytes": "0xdeadbeef" }
        });
        let id = parse_id_bytes_field(&payload, "gate_id").expect("should extract bytes id");
        // normalized to 66-char padded form
        assert_eq!(
            id,
            "0x00000000000000000000000000000000000000000000000000000000deadbeef"
        );
    }

    #[test]
    fn parse_id_bytes_field_accepts_bare_string() {
        let payload = json!({
            "gate_id": "0xdeadbeef"
        });
        let id = parse_id_bytes_field(&payload, "gate_id").expect("bare string should work");
        assert_eq!(
            id,
            "0x00000000000000000000000000000000000000000000000000000000deadbeef"
        );
    }

    #[test]
    fn parse_id_bytes_field_rejects_missing_key() {
        let payload = json!({});
        assert!(parse_id_bytes_field(&payload, "gate_id").is_err());
    }

    /// DB lifecycle test: upsert link → is_active=true, mark unlinked → is_active=false.
    /// Requires a live Postgres database; skip without one.
    #[ignore = "requires live Postgres DB — run with DATABASE_URL set"]
    #[tokio::test]
    async fn link_then_unlink_marks_inactive() {
        use crate::world_topology::{active_links_for_gate, mark_gate_unlinked, upsert_gate_link};

        let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .expect("pool connect failed");

        let link = super::GateLinkRow {
            source_gate_id: "0x000000000000000000000000000000000000000000000000000000000000aa01"
                .to_string(),
            destination_gate_id:
                "0x000000000000000000000000000000000000000000000000000000000000bb02"
                    .to_string(),
            source_gate_item_id: 1,
            source_gate_tenant: "stillness".to_string(),
            destination_gate_item_id: 2,
            destination_gate_tenant: "stillness".to_string(),
            linked_at_checkpoint: 100,
            tx_digest: Some("testtx".to_string()),
        };

        upsert_gate_link(&pool, &link)
            .await
            .expect("upsert should succeed");

        let active = active_links_for_gate(&pool, &link.source_gate_id)
            .await
            .expect("query active links");
        assert_eq!(active.len(), 1, "should have one active link");
        assert_eq!(active[0].source_gate_id, link.source_gate_id);

        let unlink = super::GateUnlinkRow {
            source_gate_id: link.source_gate_id.clone(),
            destination_gate_id: link.destination_gate_id.clone(),
            unlinked_at_checkpoint: 200,
        };
        mark_gate_unlinked(&pool, &unlink)
            .await
            .expect("mark_unlinked should succeed");

        let active_after = active_links_for_gate(&pool, &link.source_gate_id)
            .await
            .expect("query active links after unlink");
        assert!(
            active_after.is_empty(),
            "link should be inactive after unlink"
        );
    }
}
