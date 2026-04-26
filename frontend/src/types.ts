// ── API response types (mirrors indexer/src/api.rs) ──────────────────────────

export interface SystemIntelResponse {
  system_id:        string
  gate_hostile:     GateIntelEntry | null
  gate_camped:      GateIntelEntry | null
  gate_clear:       GateIntelEntry | null
  gate_toll:        GateIntelEntry | null
  heat_trap:        GateIntelEntry | null
  route_verified:   GateIntelEntry | null
  system_contested: GateIntelEntry | null
}

export interface GateIntelEntry {
  value:     number
  issuer:    string
  issued_at: string
}

export interface AttestationRow {
  attestation_id: string
  schema_id:      string
  issuer:         string
  subject:        string
  value:          number
  issued_tx:      string
  revoked:        boolean
}

export interface ScoreRow {
  profile_id:      string
  schema_id:       string
  value:           number
  issuer:          string
  last_tx_digest:  string
  last_checkpoint: number
}

export interface LeaderboardEntry {
  profile_id: string
  value:      number
  issuer:     string
}

// ── Map topology ──────────────────────────────────────────────────────────────

export interface SystemNode {
  id:       string   // matches system_id used in attestations
  label:    string
  x:        number
  y:        number
  security: 'hisec' | 'lowsec' | 'nullsec'
}

export interface JumpEdge {
  source: string
  target: string
}

// ── UI ────────────────────────────────────────────────────────────────────────

export type Tab = 'map' | 'intel' | 'tribe' | 'oracles'

export type IntelFilter = 'ALL' | 'GATE_HOSTILE' | 'GATE_CAMPED' | 'GATE_CLEAR' | 'VERIFIED'

export type ThreatLevel = 'hostile' | 'camped' | 'contested' | 'clear' | 'unknown'

export function threatLevel(intel: SystemIntelResponse | undefined): ThreatLevel {
  if (!intel) return 'unknown'
  if (intel.gate_hostile) return 'hostile'
  if (intel.gate_camped)  return 'camped'
  if (intel.system_contested) return 'contested'
  if (intel.gate_clear || intel.route_verified) return 'clear'
  return 'unknown'
}

export function threatColor(level: ThreatLevel): string {
  switch (level) {
    case 'hostile':   return '#ff2222'
    case 'camped':    return '#ff8c00'
    case 'contested': return '#ffcc00'
    case 'clear':     return '#00ff88'
    case 'unknown':   return '#3a5a7a'
  }
}
