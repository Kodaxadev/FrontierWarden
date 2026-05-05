#[derive(Debug, Clone, serde::Serialize)]
pub struct EveIdentity {
    pub wallet: String,
    pub player_profile_object: Option<String>,
    pub character_id: Option<String>,
    pub character_object: Option<String>,
    pub tribe_id: Option<String>,
    pub tribe_name: Option<String>,
    pub character_name: Option<String>,
    pub tenant: Option<String>,
    pub item_id: Option<String>,
    pub frontierwarden_profile_id: Option<String>,
    pub identity_status: String,
    pub source: String,
    pub synced_at: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub(crate) struct CharacterData {
    pub(crate) tribe_id: Option<String>,
    pub(crate) tenant: Option<String>,
    pub(crate) item_id: Option<String>,
    pub(crate) character_name: Option<String>,
    pub(crate) raw: serde_json::Value,
}

pub(crate) const GRAPHQL_QUERY: &str = r#"
query GetCharacterDetails($address: SuiAddress!, $profileType: String!) {
  address(address: $address) {
    objects(last: 10, filter: { type: $profileType }) {
      nodes {
        address
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
}
"#;

pub(crate) const CHARACTER_GRAPHQL_QUERY: &str = r#"
query GetCharacter($characterId: SuiAddress!) {
  object(address: $characterId) {
    address
    asMoveObject {
      contents {
        type {
          repr
        }
        json
      }
    }
  }
}
"#;
