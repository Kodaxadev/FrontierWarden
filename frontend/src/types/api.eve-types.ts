// EVE World Data types — extracted from api.types.ts.

export interface EveSolarSystem {
  system_id: string;
  name: string | null;
}

export interface EveType {
  type_id: string;
  name: string | null;
  group_id: string | null;
  category_id: string | null;
}

export interface EveTribe {
  tribe_id: string;
  name: string | null;
}

export interface EveShip {
  ship_id: string;
  name: string | null;
  owner_character_id: string | null;
  type_id: string | null;
}

export interface EveWorldStatus {
  systems_count: number;
  types_count: number;
  tribes_count: number;
  ships_count: number;
  source: string;
}

export interface EveIdentity {
  wallet: string;
  player_profile_object: string | null;
  character_id: string | null;
  character_object: string | null;
  tribe_id: string | null;
  tribe_name: string | null;
  character_name: string | null;
  tenant: string | null;
  item_id: string | null;
  frontierwarden_profile_id: string | null;
  identity_status: string;
  source: string;
  synced_at: string | null;
}

export interface IdentityEnrichment {
  wallet: string;
  character_id: string | null;
  character_name: string | null;
  tribe_id: string | null;
  tribe_name: string | null;
  frontierwarden_profile_id: string | null;
  identity_status: string;
  synced_at: string | null;
}

export type IdentityEnrichmentMap = Record<string, IdentityEnrichment>;
