// Mirrors the response types from indexer/src/api.rs exactly.
// Update here when api.rs response structs change.

export interface HealthResponse {
  status:      'ok' | string;
  uptime_secs: number;
}

export interface OperatorNonceRequest {
  address: string;
}

export interface OperatorNonceResponse {
  address:    string;
  nonce:      string;
  message:    string;
  expires_at: number;
}

export interface OperatorSessionRequest {
  address:   string;
  nonce:     string;
  message:   string;
  signature: string;
}

export interface OperatorSessionResponse {
  address:    string;
  token:      string;
  expires_at: number;
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

export interface AttestationFeedRow extends AttestationRow {
  issued_at: string;
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

export type GateBindingStatusValue = 'unbound' | 'bound' | 'verified';

export interface GateBindingStatusResponse {
  gatePolicyId:      string;
  bindingStatus:    GateBindingStatusValue;
  worldGateId:      string | null;
  worldGateStatus:  string | null;
  linkedGateId:     string | null;
  fwExtensionActive: boolean;
  extensionType:    string | null;
  active:           boolean;
  boundTxDigest:    string | null;
  boundCheckpoint:  number | null;
  updatedAt:        string | null;
}

export interface WorldGateCandidate {
  worldGateId:       string;
  itemId:            number;
  tenant:            string;
  status:            string;
  linkedGateId:      string | null;
  fwExtensionActive: boolean;
  checkpointUpdated: number;
  updatedAt:         string;
}

export interface WorldGatesResponse {
  tenant: string;
  count:  number;
  gates:  WorldGateCandidate[];
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

export interface TollWithdrawalRow {
  gate_id:        string;
  owner:          string;
  amount_mist:    number;
  tx_digest:      string;
  event_seq:      number;
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

export interface ChallengeStatsRow {
  total:         number;
  active:        number;
  resolved:      number;
  guilty_count:  number;
  cleared_count: number;
  total_slashed: number;
  guilty_rate:   number | null;
}

export interface VouchRow {
  vouch_id:        string;
  voucher:         string;
  vouchee:         string;
  stake_amount:    number;
  created_tx:      string;
  created_at:      string;
  redeemed:        boolean;
  amount_returned: number | null;
  redeemed_tx:     string | null;
  redeemed_at:     string | null;
}

export interface SchemaRow {
  schema_id:     string;
  version:       number;
  resolver:      string | null;
  deprecated_by: string | null;
  registered_tx: string;
  registered_at: string;
  deprecated_tx: string | null;
  deprecated_at: string | null;
}

export interface OracleRow {
  oracle_address:   string;
  name:             string;
  tee_verified:     boolean;
  is_system_oracle: boolean;
  registered_tx:    string;
  registered_at:    string;
}

export interface ProfileRow {
  profile_id: string;
  owner:      string;
  created_tx: string;
  created_at: string;
}

export type TrustApiVersion = 'trust.v1';

export type TrustAction =
  | 'gate_access'
  | 'counterparty_risk'
  | 'bounty_trust';

export type TrustDecision =
  | 'ALLOW'
  | 'ALLOW_FREE'
  | 'ALLOW_TAXED'
  | 'DENY'
  | 'INSUFFICIENT_DATA'
  | 'REVIEW';

export type TrustReason =
  | 'ALLOW_FREE'
  | 'ALLOW_TAXED'
  | 'COUNTERPARTY_REQUIREMENTS_MET'
  | 'DENY_SCORE_BELOW_THRESHOLD'
  | 'DENY_NO_STANDING_ATTESTATION'
  | 'DENY_COUNTERPARTY_NO_SCORE'
  | 'DENY_COUNTERPARTY_SCORE_TOO_LOW'
  | 'BOUNTY_TRUST_REQUIREMENTS_MET'
  | 'BOUNTY_TRUST_SCORE_BELOW_THRESHOLD'
  | 'BOUNTY_TRUST_INSUFFICIENT_DATA'
  | 'ERROR_GATE_NOT_FOUND'
  | 'ERROR_UNSUPPORTED_ACTION';

export interface TrustEvaluateRequest {
  entity: string;
  action: TrustAction;
  context: {
    gateId?: string;
    schemaId?: string;
    minimumScore?: number;
    bountyId?: string;
    target?: string;
  };
}

export interface TrustRequirements {
  schema: string;
  threshold: number | null;
  minimumPassScore: number;
}

export interface TrustObserved {
  score: number | null;
  attestationId: string | null;
  scoreSource?: string | null;
}

export interface TrustProof {
  gateId?: string;
  subject: string;
  checkpoint: number | null;
  source: 'indexed_protocol_state' | string;
  schemas: string[];
  attestationIds: string[];
  txDigests: string[];
  warnings: string[];
}

export interface TrustEvaluateResponse {
  apiVersion: TrustApiVersion;
  action: TrustAction;
  decision: TrustDecision;
  allow: boolean;
  tollMultiplier: number | null;
  tollMist: number | null;
  confidence: number;
  reason: TrustReason;
  explanation: string;
  subject: string;
  gateId?: string;
  score: number | null;
  threshold: number | null;
  requirements: TrustRequirements;
  observed: TrustObserved;
  proof: TrustProof;
}

// Derived threat level for UI rendering
export type ThreatLevel = 'hostile' | 'camped' | 'clear' | 'unknown';

export function systemThreatLevel(intel: SystemIntelResponse): ThreatLevel {
  if (intel.gate_hostile?.value) return 'hostile';
  if (intel.gate_camped?.value)  return 'camped';
  if (intel.gate_clear?.value)   return 'clear';
  return 'unknown';
}

// ── EVE World Data ────────────────────────────────────────────────────────────

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
