mod client;
mod db;
mod parser;
mod resolver;
mod types;

pub use db::{resolve_cached_identity, resolve_fw_profile_id, upsert_identity};
pub use resolver::{resolve_identity_via_graphql, unresolved_identity};
pub use types::EveIdentity;

#[cfg(test)]
mod tests {
    use super::*;
    use super::parser::parse_graphql_response;

    #[test]
    fn parse_graphql_response_extracts_character_id() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x1234...abcd",
                            "contents": {
                                "type": { "repr": "0xd12a...::character::PlayerProfile" },
                                "json": {
                                    "character_id": "char_001",
                                    "tribe_id": "tribe_042"
                                }
                            }
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, Some("0x1234...abcd".to_string()));
        assert_eq!(char_id, Some("char_001".to_string()));
        assert_eq!(tribe, Some("tribe_042".to_string()));
        assert!(raw.get("data").is_some());
    }

    #[test]
    fn parse_graphql_response_handles_no_nodes() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": []
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_handles_graphql_errors() {
        let body = serde_json::json!({
            "errors": [{ "message": "Invalid address format" }],
            "data": null
        });

        let result = parse_graphql_response(&body);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("GraphQL errors"));
    }

    #[test]
    fn parse_graphql_response_handles_malformed_data() {
        let body = serde_json::json!({
            "data": {
                "address": null
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_handles_missing_contents() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x1234",
                            "contents": null
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, None);
        assert_eq!(char_id, None);
        assert_eq!(tribe, None);
    }

    #[test]
    fn parse_graphql_response_extracts_id_fallback() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0x5678",
                            "contents": {
                                "type": { "repr": "0xd12a...::character::PlayerProfile" },
                                "json": { "id": "profile_id_99" }
                            }
                        }]
                    }
                }
            }
        });

        let (_profile_obj, char_id, _tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(char_id, Some("profile_id_99".to_string()));
    }

    #[test]
    fn unresolved_identity_returns_safe_nulls() {
        let id = EveIdentity {
            wallet: "0x0000000000000000000000000000000000000000000000000000000000000001".into(),
            player_profile_object: None,
            character_id: None,
            character_object: None,
            tribe_id: None,
            tribe_name: None,
            character_name: None,
            tenant: None,
            item_id: None,
            frontierwarden_profile_id: None,
            identity_status: "unresolved".into(),
            source: "unresolved".into(),
            synced_at: None,
        };
        assert_eq!(id.character_id, None);
        assert_eq!(id.identity_status, "unresolved");
    }

    #[test]
    fn parse_character_json_extracts_fields() {
        let character_json = serde_json::json!({
            "id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
            "key": {
                "item_id": "2112089652",
                "tenant": "stillness"
            },
            "tribe_id": 1000167,
            "character_address": "0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f",
            "metadata": {
                "assembly_id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
                "name": "Kivik",
                "description": "",
                "url": ""
            },
            "owner_cap_id": "0x8479c0279f0197fe29987074d514a54c8881adc1f0557a3b556689ad838c067f"
        });

        let tribe_id = character_json.get("tribe_id")
            .and_then(|v| v.as_u64())
            .map(|n| n.to_string());
        let tenant = character_json.get("key")
            .and_then(|k| k.get("tenant"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let item_id = character_json.get("key")
            .and_then(|k| k.get("item_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                character_json.get("key")
                    .and_then(|k| k.get("item_id"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n.to_string())
            });
        let character_name = character_json.get("metadata")
            .and_then(|m| m.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        assert_eq!(tribe_id, Some("1000167".to_string()));
        assert_eq!(tenant, Some("stillness".to_string()));
        assert_eq!(item_id, Some("2112089652".to_string()));
        assert_eq!(character_name, Some("Kivik".to_string()));
    }

    #[test]
    fn parse_character_json_handles_numeric_item_id() {
        let character_json = serde_json::json!({
            "id": "0xchar",
            "key": {
                "item_id": 2112089652,
                "tenant": "stillness"
            },
            "tribe_id": 1000167,
            "metadata": {
                "name": "Kivik"
            }
        });

        let item_id = character_json.get("key")
            .and_then(|k| k.get("item_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                character_json.get("key")
                    .and_then(|k| k.get("item_id"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n.to_string())
            });

        assert_eq!(item_id, Some("2112089652".to_string()));
        assert!(!item_id.unwrap().starts_with('"'));
    }

    #[test]
    fn parse_player_profile_minimal_shape() {
        let body = serde_json::json!({
            "data": {
                "address": {
                    "objects": {
                        "nodes": [{
                            "address": "0xprofile_obj",
                            "contents": {
                                "type": { "repr": "0x28b497...::character::PlayerProfile" },
                                "json": {
                                    "id": "0xprofile_obj",
                                    "character_id": "0xchar_id"
                                }
                            }
                        }]
                    }
                }
            }
        });

        let (profile_obj, char_id, tribe, _raw) = parse_graphql_response(&body).unwrap();
        assert_eq!(profile_obj, Some("0xprofile_obj".to_string()));
        assert_eq!(char_id, Some("0xchar_id".to_string()));
        assert_eq!(tribe, None);
    }
}
