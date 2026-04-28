// Mirrors the response types from indexer/src/api.rs exactly.
// Update here when api.rs response structs change.

export interface HealthResponse {
  status:      'ok' | string;
  uptime_secs: number;
}

export interface ScoreRow {
  profile_id:      string;
  schema_id:       string;
  value:           number;
  issuer:          string;
  last_tx_digest:  string;
  last_checkpoint: number;
}

export interface AttestationRow {
  attestation_id: string;
  schema_id:      string;
  issuer:         string;
  subject:        string;
  value:          number;
  issued_tx:      string;
  revoked:        boolean;
}

export interface SingletonRow {
  attestation_id: string;
  schema_id:      string;
  item_id:        string;
  issuer:         string;
  value:          number;
  issued_tx:      string;
  revoked:        boolean;
}

export interface LeaderboardEntry {
  profile_id: string;
  value:      number;
  issuer:     string;
}

export interface GateIntelEntry {
  value:     number;
  issuer:    string;
  issued_at: string;
}

export interface SystemIntelResponse {
  system_id:        string;
  gate_hostile:     GateIntelEntry | null;
  gate_camped:      GateIntelEntry | null;
  gate_clear:       GateIntelEntry | null;
  gate_toll:        GateIntelEntry | null;
  heat_trap:        GateIntelEntry | null;
  route_verified:   GateIntelEntry | null;
  system_contested: GateIntelEntry | null;
}

export interface GateSummaryRow {
  gate_id:           string;
  ally_threshold:    number | null;
  base_toll_mist:    number | null;
  config_updated_at: string | null;
  latest_checkpoint: number | null;
  passages_24h:      number;
  denies_24h:        number;
}

export interface GatePolicyRow {
  gate_id:        string;
  ally_threshold: number;
  base_toll_mist: number;
  tx_digest:      string;
  checkpoint_seq: number;
  indexed_at:     string;
}

export interface GatePassageRow {
  gate_id:        string;
  traveler:       string;
  allowed:        boolean;
  score:          number | null;
  toll_paid:      number | null;
  tier:           number | null;
  reason:         number | null;
  epoch:          number;
  tx_digest:      string;
  checkpoint_seq: number;
  indexed_at:     string;
}

export interface FraudChallengeRow {
  challenge_id:   string;
  attestation_id: string;
  challenger:     string;
  oracle:         string;
  created_tx:     string;
  created_at:     string;
  resolved:       boolean;
  guilty:         boolean | null;
  slash_amount:   number | null;
  resolved_tx:    string | null;
  resolved_at:    string | null;
}

// Derived threat level for UI rendering
export type ThreatLevel = 'hostile' | 'camped' | 'clear' | 'unknown';

export function systemThreatLevel(intel: SystemIntelResponse): ThreatLevel {
  if (intel.gate_hostile?.value) return 'hostile';
  if (intel.gate_camped?.value)  return 'camped';
  if (intel.gate_clear?.value)   return 'clear';
  return 'unknown';
}
