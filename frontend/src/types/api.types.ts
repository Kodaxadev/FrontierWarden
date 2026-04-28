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

// Derived threat level for UI rendering
export type ThreatLevel = 'hostile' | 'camped' | 'clear' | 'unknown';

export function systemThreatLevel(intel: SystemIntelResponse): ThreatLevel {
  if (intel.gate_hostile?.value) return 'hostile';
  if (intel.gate_camped?.value)  return 'camped';
  if (intel.gate_clear?.value)   return 'clear';
  return 'unknown';
}
