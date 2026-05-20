#![allow(dead_code)]

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize, Clone)]
pub struct WorldApiResponse<T> {
    pub data: Vec<T>,
    pub metadata: WorldApiMetadata,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldApiMetadata {
    pub total: u64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldSolarSystem {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldTribe {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldShip {
    pub id: i64,
    pub name: Option<String>,
    #[serde(rename = "classId")]
    pub class_id: Option<i64>,
    #[serde(rename = "className")]
    pub class_name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct WorldType {
    pub id: i64,
    pub name: Option<String>,
    #[serde(flatten)]
    pub raw_extra: HashMap<String, serde_json::Value>,
}
