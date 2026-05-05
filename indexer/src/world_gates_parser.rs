use anyhow::{Context, Result};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorldGateRow {
    pub gate_id: String,
    pub item_id: i64,
    pub tenant: String,
    pub owner_character_id: Option<String>,
    pub owner_address: Option<String>,
    pub solar_system_id: Option<String>,
    pub linked_gate_id: Option<String>,
    pub status: String,
    pub fw_extension_active: bool,
    pub fw_gate_policy_id: Option<String>,
    pub checkpoint_updated: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorldGateExtension {
    pub package_id: Option<String>,
    pub module_name: Option<String>,
    pub struct_name: Option<String>,
    pub gate_policy_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantItemId {
    pub item_id: i64,
    pub tenant: String,
}

pub fn parse_gate_node(
    node: &Value,
    efrep_package_id: &str,
    fw_module_name: &str,
    fw_auth_witness: &str,
) -> Result<WorldGateRow> {
    let json = move_json(node).context("world gate node missing Move JSON contents")?;
    let key = parse_tenant_item_id(value_any(json, &["key"]).unwrap_or(json))?;
    let extension = parse_extension(json);
    let gate_id = normalize_sui_address(
        value_any(json, &["id", "gate_id"])
            .and_then(as_object_id)
            .or_else(|| node.get("address").and_then(Value::as_str))
            .context("world gate missing gate id")?,
    );
    let checkpoint_updated = parse_version(node.get("version"))
        .or_else(|| parse_version(value_any(json, &["version", "checkpoint_updated"])))
        .unwrap_or(0);

    Ok(WorldGateRow {
        gate_id,
        item_id: key.item_id,
        tenant: key.tenant,
        owner_character_id: optional_addr(value_any(
            json,
            &["owner_character_id", "ownerCharacterId"],
        )),
        owner_address: optional_addr(value_any(json, &["owner_address", "ownerAddress", "owner"])),
        solar_system_id: value_any(json, &["location", "solar_system_id", "solarSystemId"])
            .and_then(parse_location_ref),
        linked_gate_id: optional_addr(value_any(
            json,
            &["linked_id", "linked_gate_id", "linkedGateId"],
        )),
        status: parse_status(value_any(json, &["status"])),
        fw_extension_active: is_frontierwarden_extension(
            &extension,
            efrep_package_id,
            fw_module_name,
            fw_auth_witness,
        ),
        fw_gate_policy_id: extension
            .gate_policy_id
            .as_deref()
            .map(normalize_sui_address),
        checkpoint_updated,
    })
}

pub fn is_frontierwarden_extension(
    ext: &WorldGateExtension,
    efrep_package_id: &str,
    fw_module_name: &str,
    fw_auth_witness: &str,
) -> bool {
    ext.package_id.as_deref().map(normalize_sui_address)
        == Some(normalize_sui_address(efrep_package_id))
        && ext.module_name.as_deref() == Some(fw_module_name)
        && ext.struct_name.as_deref() == Some(fw_auth_witness)
}

pub fn parse_tenant_item_id(value: &Value) -> Result<TenantItemId> {
    let item_id = value_any(value, &["item_id", "itemId"])
        .map(parse_item_id)
        .transpose()?
        .context("TenantItemId missing item_id")?;
    let tenant = value_any(value, &["tenant"])
        .and_then(Value::as_str)
        .context("TenantItemId missing tenant")?
        .to_string();
    Ok(TenantItemId { item_id, tenant })
}

pub fn parse_item_id(value: &Value) -> Result<i64> {
    match value {
        Value::String(s) => s
            .parse::<i64>()
            .with_context(|| format!("invalid item_id {s}")),
        Value::Number(n) => n.as_i64().context("item_id out of i64 range"),
        _ => anyhow::bail!("item_id must be string or number"),
    }
}

fn parse_extension(json: &Value) -> WorldGateExtension {
    let ext = value_any(json, &["extension", "gate_extension", "gateExtension"]).unwrap_or(json);
    WorldGateExtension {
        package_id: value_any(ext, &["package_id", "packageId"])
            .and_then(as_object_id)
            .map(str::to_string),
        module_name: value_any(ext, &["module_name", "moduleName"])
            .and_then(Value::as_str)
            .map(str::to_string),
        struct_name: value_any(
            ext,
            &["struct_name", "structName", "auth_witness", "authWitness"],
        )
        .and_then(Value::as_str)
        .map(str::to_string),
        gate_policy_id: value_any(
            ext,
            &["gate_policy_id", "gatePolicyId", "policy_id", "policyId"],
        )
        .and_then(as_object_id)
        .map(str::to_string),
    }
}

fn move_json(node: &Value) -> Option<&Value> {
    node.pointer("/contents/json")
        .or_else(|| node.pointer("/asMoveObject/contents/json"))
        .or_else(|| node.pointer("/contents/value/json"))
}

fn value_any<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| value.get(*key))
}

fn as_object_id(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
        .or_else(|| value.get("bytes").and_then(Value::as_str))
}

fn optional_addr(value: Option<&Value>) -> Option<String> {
    value.and_then(as_object_id).map(normalize_sui_address)
}

fn parse_location_ref(value: &Value) -> Option<String> {
    parse_tenant_item_id(value)
        .ok()
        .map(|key| format!("{}:{}", key.tenant, key.item_id))
        .or_else(|| value.as_str().map(str::to_string))
}

fn parse_status(value: Option<&Value>) -> String {
    value
        .and_then(|v| {
            v.as_str()
                .or_else(|| v.get("name").and_then(Value::as_str))
                .or_else(|| v.get("@variant").and_then(Value::as_str))
                .or_else(|| v.pointer("/status/@variant").and_then(Value::as_str))
        })
        .unwrap_or("unknown")
        .to_ascii_lowercase()
}

fn parse_version(value: Option<&Value>) -> Option<i64> {
    value.and_then(|v| match v {
        Value::String(s) => s.parse::<i64>().ok(),
        Value::Number(n) => n.as_i64(),
        _ => None,
    })
}

fn normalize_sui_address(input: &str) -> String {
    let stripped = input
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X")
        .to_ascii_lowercase();
    format!("0x{stripped:0>64}")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    const FW_PACKAGE: &str = "0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2";

    #[test]
    fn parser_maps_world_gate_fixture_to_row() {
        let fixture = json!({
            "address": "0xabc",
            "version": 12345,
            "contents": { "json": {
                "id": { "id": "0xabc" },
                "key": { "item_id": "424242", "tenant": "stillness" },
                "owner_character_id": "0xdef",
                "owner_address": "0x123",
                "location": { "item_id": "30000142", "tenant": "stillness" },
                "linked_id": { "id": "0x456" },
                "status": "ONLINE",
                "extension": {
                    "package_id": FW_PACKAGE,
                    "module_name": "reputation_gate",
                    "struct_name": "FrontierWardenAuth",
                    "gate_policy_id": "0x789"
                }
            }}
        });

        let row = super::parse_gate_node(
            &fixture,
            FW_PACKAGE,
            "reputation_gate",
            "FrontierWardenAuth",
        )
        .expect("fixture should parse");

        assert_eq!(
            row.gate_id,
            "0x0000000000000000000000000000000000000000000000000000000000000abc"
        );
        assert_eq!(row.item_id, 424242);
        assert_eq!(row.tenant, "stillness");
        assert_eq!(
            row.owner_character_id.as_deref(),
            Some("0x0000000000000000000000000000000000000000000000000000000000000def")
        );
        assert_eq!(
            row.owner_address.as_deref(),
            Some("0x0000000000000000000000000000000000000000000000000000000000000123")
        );
        assert_eq!(row.solar_system_id.as_deref(), Some("stillness:30000142"));
        assert_eq!(
            row.linked_gate_id.as_deref(),
            Some("0x0000000000000000000000000000000000000000000000000000000000000456")
        );
        assert_eq!(row.status, "online");
        assert!(row.fw_extension_active);
        assert_eq!(
            row.fw_gate_policy_id.as_deref(),
            Some("0x0000000000000000000000000000000000000000000000000000000000000789")
        );
        assert_eq!(row.checkpoint_updated, 12345);
    }

    #[test]
    fn extension_tuple_detection_requires_full_match() {
        let ext = super::WorldGateExtension {
            package_id: Some(FW_PACKAGE.to_string()),
            module_name: Some("reputation_gate".to_string()),
            struct_name: Some("FrontierWardenAuth".to_string()),
            gate_policy_id: None,
        };

        assert!(super::is_frontierwarden_extension(
            &ext,
            FW_PACKAGE,
            "reputation_gate",
            "FrontierWardenAuth",
        ));
    }

    #[test]
    fn extension_tuple_detection_rejects_package_only_match() {
        let ext = super::WorldGateExtension {
            package_id: Some(FW_PACKAGE.to_string()),
            module_name: Some("other_module".to_string()),
            struct_name: Some("FrontierWardenAuth".to_string()),
            gate_policy_id: None,
        };

        assert!(!super::is_frontierwarden_extension(
            &ext,
            FW_PACKAGE,
            "reputation_gate",
            "FrontierWardenAuth",
        ));
    }

    #[test]
    fn item_id_numeric_parsing_accepts_bigint_compatible_strings() {
        assert_eq!(
            super::parse_item_id(&json!("9007199254740991")).unwrap(),
            9_007_199_254_740_991
        );
        assert_eq!(super::parse_item_id(&json!(42)).unwrap(), 42);
    }

    #[test]
    fn tenant_is_preserved_from_tenant_item_id() {
        let fixture = json!({ "item_id": "7", "tenant": "stillness" });
        let key = super::parse_tenant_item_id(&fixture).unwrap();
        assert_eq!(key.tenant, "stillness");
        assert_eq!(key.item_id, 7);
    }

    #[test]
    fn parser_handles_nested_status_variant() {
        let fixture = json!({
            "address": "0xabc",
            "version": 1,
            "asMoveObject": { "contents": { "json": {
                "id": "0xabc",
                "key": { "item_id": "1", "tenant": "stillness" },
                "status": { "status": { "@variant": "ONLINE" } },
                "extension": null
            }}}
        });

        let row = super::parse_gate_node(
            &fixture,
            FW_PACKAGE,
            "reputation_gate",
            "FrontierWardenAuth",
        )
        .expect("fixture should parse");

        assert_eq!(row.status, "online");
    }
}
