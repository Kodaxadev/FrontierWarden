// World Gate Traffic + Kill Mail types — extracted from api.types.ts.
// Mirrors indexer/src/api_world_gate_traffic.rs response types.

export interface WorldGateActiveLinkItem {
  destination_gate_id:        string;
  destination_gate_item_id:   number;
  destination_gate_tenant:    string;
  linked_at_checkpoint:       number;
}

export interface WorldGateLinksResponse {
  gate_id:      string;
  active_links: WorldGateActiveLinkItem[];
  link_count:   number;
}

export interface WorldGateJumpItem {
  tx_digest:            string;
  checkpoint:           number;
  source_gate_id:       string;
  destination_gate_id:  string;
  character_id:         string;
  character_item_id:    number;
  character_tenant:     string;
}

export interface WorldGateJumpsResponse {
  gate_id: string;
  jumps:   WorldGateJumpItem[];
  total:   number;
}

export interface WorldGateActivityResponse {
  gate_id:               string;
  jump_count_1h:         number;
  jump_count_24h:        number;
  jump_count_7d:         number;
  unique_characters_24h: number;
  is_linked:             boolean;
  link_count:            number;
  /** Always present. Windows use indexer-observed insertion time, not on-chain timestamp. */
  activity_window_note:  string;
}

export interface WorldGateSummaryResponse {
  gate_id:             string;
  item_id:             number;
  tenant:              string;
  status:              string;
  fw_extension_active: boolean;
  fw_gate_policy_id:   string | null;
  is_linked:           boolean;
  link_count:          number;
  jump_count_24h:      number;
  active_links:        WorldGateActiveLinkItem[];
}

export interface WorldCharacterJumpsResponse {
  character_id: string;
  jumps:        WorldGateJumpItem[];
  total:        number;
}

// ── Native Kill Mails ─────────────────────────────────────────────────────────
// Combat telemetry from the alpha-strike community API.
// Separate from SHIP_KILL attestations (oracle/trust evidence).

export interface KillMailItem {
  killMailId:       number;
  sourceId:         number;
  environment:      string;
  killerName:       string | null;
  killerAddress:    string | null;
  killerTribe:      string | null;
  victimName:       string | null;
  victimAddress:    string | null;
  victimTribe:      string | null;
  solarSystemId:    number | null;
  solarSystemName:  string | null;
  lossType:         string | null;
  killTimestamp:    string | null;
  indexedAt:        string;
}

export interface KillMailListResponse {
  items:      KillMailItem[];
  total:      number;
  nextCursor: string | null;
  dataNote:   string;
}
