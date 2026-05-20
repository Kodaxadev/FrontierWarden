#[allow(dead_code)]
#[derive(serde::Serialize)]
pub(super) struct GraphQlRequest {
    pub(super) query: &'static str,
    pub(super) variables: GraphQlVariables,
}

#[allow(dead_code)]
#[derive(serde::Serialize)]
pub(super) struct GraphQlVariables {
    pub(super) address: String,
    pub(super) profile_type: String,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlResponse {
    pub(super) data: Option<GraphQlData>,
    pub(super) errors: Option<Vec<GraphQlError>>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlError {
    pub(super) message: String,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlData {
    pub(super) address: Option<GraphQlAddress>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlAddress {
    pub(super) objects: Option<GraphQlObjects>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlObjects {
    pub(super) nodes: Vec<GraphQlNode>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlNode {
    pub(super) address: String,
    pub(super) contents: Option<GraphQlContents>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct GraphQlContents {
    #[serde(rename = "type")]
    pub(super) type_info: TypeInfo,
    pub(super) json: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(serde::Deserialize)]
pub(super) struct TypeInfo {
    pub(super) repr: String,
}
