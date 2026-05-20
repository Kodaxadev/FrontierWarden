use super::types::*;
use super::WorldApiClient;

#[test]
fn client_new_trims_trailing_slash() {
    let client = WorldApiClient::new("https://example.com/");
    assert_eq!(client.base_url, "https://example.com");
}

#[test]
fn client_new_without_trailing_slash() {
    let client = WorldApiClient::new("https://example.com");
    assert_eq!(client.base_url, "https://example.com");
}

#[test]
fn deserialize_solar_system() {
    let json = serde_json::json!({
        "id": 30000001,
        "name": "A 2560",
        "constellationId": 20000001,
        "regionId": 10000001,
        "location": {
            "x": -5103797186450162000i64,
            "y": -442889159183433700i64,
            "z": 1335601100954271700i64
        }
    });
    let ss: WorldSolarSystem = serde_json::from_value(json).unwrap();
    assert_eq!(ss.id, 30000001);
    assert_eq!(ss.name, Some("A 2560".to_string()));
    assert!(ss.raw_extra.contains_key("constellationId"));
    assert!(ss.raw_extra.contains_key("location"));
}

#[test]
fn deserialize_tribe() {
    let json = serde_json::json!({
        "id": 1000044,
        "name": "NPC Corp 1000044",
        "nameShort": "SAK",
        "description": "",
        "taxRate": 0,
        "tribeUrl": ""
    });
    let tribe: WorldTribe = serde_json::from_value(json).unwrap();
    assert_eq!(tribe.id, 1000044);
    assert_eq!(tribe.name, Some("NPC Corp 1000044".to_string()));
    assert!(tribe.raw_extra.contains_key("nameShort"));
    assert!(tribe.raw_extra.contains_key("taxRate"));
}

#[test]
fn deserialize_ship() {
    let json = serde_json::json!({
        "id": 81609,
        "name": "USV",
        "classId": 25,
        "className": "Frigate",
        "description": "A light vessel optimized for resource extraction (placeholder)."
    });
    let ship: WorldShip = serde_json::from_value(json).unwrap();
    assert_eq!(ship.id, 81609);
    assert_eq!(ship.name, Some("USV".to_string()));
    assert_eq!(ship.class_id, Some(25));
    assert_eq!(ship.class_name, Some("Frigate".to_string()));
    assert!(ship.raw_extra.contains_key("description"));
}

#[test]
fn deserialize_type() {
    let json = serde_json::json!({
        "id": 72244,
        "name": "Feral Data",
        "description": "",
        "mass": 0.1,
        "radius": 1,
        "volume": 0.1,
        "portionSize": 1,
        "groupName": "Rogue Drone Analysis Data",
        "groupId": 0,
        "categoryName": "Commodity",
        "categoryId": 17,
        "iconUrl": ""
    });
    let t: WorldType = serde_json::from_value(json).unwrap();
    assert_eq!(t.id, 72244);
    assert_eq!(t.name, Some("Feral Data".to_string()));
    assert!(t.raw_extra.contains_key("mass"));
    assert!(t.raw_extra.contains_key("groupName"));
}

#[test]
fn deserialize_paginated_response() {
    let json = serde_json::json!({
        "data": [
            {"id": 30000001, "name": "A 2560"},
            {"id": 30000002, "name": "B 2561"}
        ],
        "metadata": { "total": 24502, "limit": 100, "offset": 0 }
    });
    let resp: WorldApiResponse<serde_json::Value> = serde_json::from_value(json).unwrap();
    assert_eq!(resp.metadata.total, 24502);
    assert_eq!(resp.metadata.limit, 100);
    assert_eq!(resp.data.len(), 2);
    assert_eq!(resp.data[0]["name"], "A 2560");
}
