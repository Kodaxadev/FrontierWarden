// Typed fetch wrappers for the Rust/Axum REST API.
// All reads go through /api (proxied to localhost:3000 in dev via vite.config.ts).
// Write tx goes through /gas (proxied to gas station on localhost:3001 in dev).

import type {
  HealthResponse,
  AttestationFeedRow,
  ScoreRow,
  AttestationRow,
  LeaderboardEntry,
  SystemIntelResponse,
  GateSummaryRow,
  GatePolicyRow,
  GatePassageRow,
  TollWithdrawalRow,
  FraudChallengeRow,
  ChallengeStatsRow,
  VouchRow,
  SchemaRow,
  OracleRow,
  ProfileRow,
  TrustEvaluateRequest,
  TrustEvaluateResponse,
} from '../types/api.types';

const BASE     = import.meta.env.VITE_API_BASE         ?? '/api';
const GAS_BASE = import.meta.env.VITE_GAS_STATION_URL  ?? '/gas';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Health ────────────────────────────────────────────────────────────────────

export const fetchHealth = (): Promise<HealthResponse> =>
  get('/health');

// ── Scores ────────────────────────────────────────────────────────────────────

export const fetchScores = (profileId: string): Promise<ScoreRow[]> =>
  get(`/scores/${encodeURIComponent(profileId)}`);

export const fetchScore = (
  profileId: string,
  schemaId: string,
): Promise<ScoreRow | null> =>
  get(`/scores/${encodeURIComponent(profileId)}/${encodeURIComponent(schemaId)}`);

export const fetchVouches = (
  voucheeAddress: string,
  limit = 50,
): Promise<VouchRow[]> =>
  get(`/profiles/${encodeURIComponent(voucheeAddress)}/vouches?limit=${limit}`);

// ── Attestations ──────────────────────────────────────────────────────────────

export interface AttestationFilter {
  schema_id?: string;
  limit?:     number;
  revoked?:   boolean;
}

export function fetchAttestationFeed(
  filter: AttestationFilter = {},
): Promise<AttestationFeedRow[]> {
  const params = new URLSearchParams();
  if (filter.schema_id) params.set('schema_id', filter.schema_id);
  if (filter.limit     != null) params.set('limit',     String(filter.limit));
  if (filter.revoked   != null) params.set('revoked',   String(filter.revoked));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return get(`/attestations${qs}`);
}

export function fetchAttestations(
  subject: string,
  filter: AttestationFilter = {},
): Promise<AttestationRow[]> {
  const params = new URLSearchParams();
  if (filter.schema_id) params.set('schema_id', filter.schema_id);
  if (filter.limit     != null) params.set('limit',     String(filter.limit));
  if (filter.revoked   != null) params.set('revoked',   String(filter.revoked));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return get(`/attestations/${encodeURIComponent(subject)}${qs}`);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export const fetchLeaderboard = (
  schemaId: string,
  limit = 50,
): Promise<LeaderboardEntry[]> =>
  get(`/leaderboard/${encodeURIComponent(schemaId)}?limit=${limit}`);

// ── Intel ─────────────────────────────────────────────────────────────────────

export const fetchIntel = (systemId: string): Promise<SystemIntelResponse> =>
  get(`/intel/${encodeURIComponent(systemId)}`);

// ── Gas station ───────────────────────────────────────────────────────────────
// POST /gas/sponsor-transaction (proxied to localhost:3001 in dev)

export const fetchGates = (): Promise<GateSummaryRow[]> =>
  get('/gates');

export const fetchGate = (gateId: string): Promise<GateSummaryRow | null> =>
  get(`/gates/${encodeURIComponent(gateId)}`);

export const fetchGatePolicy = (gateId: string): Promise<GatePolicyRow | null> =>
  get(`/gates/${encodeURIComponent(gateId)}/policy`);

export const fetchGatePassages = (
  gateId: string,
  limit = 50,
): Promise<GatePassageRow[]> =>
  get(`/gates/${encodeURIComponent(gateId)}/passages?limit=${limit}`);

export const fetchGateWithdrawals = (
  gateId: string,
  limit = 50,
): Promise<TollWithdrawalRow[]> =>
  get(`/gates/${encodeURIComponent(gateId)}/withdrawals?limit=${limit}`);

export const fetchChallenges = (limit = 50): Promise<FraudChallengeRow[]> =>
  get(`/challenges?limit=${limit}`);

export const fetchChallenge = (challengeId: string): Promise<FraudChallengeRow | null> =>
  get(`/challenges/${encodeURIComponent(challengeId)}`);

export const fetchOracleChallenges = (
  oracle: string,
  limit = 50,
): Promise<FraudChallengeRow[]> =>
  get(`/oracles/${encodeURIComponent(oracle)}/challenges?limit=${limit}`);

export const fetchChallengeStats = (): Promise<ChallengeStatsRow> =>
  get('/challenges/stats');

export const fetchChallengesByChallenger = (
  address: string,
  limit = 50,
): Promise<FraudChallengeRow[]> =>
  get(`/challenges/by-challenger/${encodeURIComponent(address)}?limit=${limit}`);

// ── Registry listings ─────────────────────────────────────────────────────────

export const fetchSchemas = (limit = 100): Promise<SchemaRow[]> =>
  get(`/schemas?limit=${limit}`);

export const fetchOracles = (limit = 100): Promise<OracleRow[]> =>
  get(`/oracles?limit=${limit}`);

// Profile lookup by wallet address — poll after create_profile to get profile_id.
export const fetchProfileByOwner = (address: string): Promise<ProfileRow | null> =>
  get(`/profiles/by-owner/${encodeURIComponent(address)}`);

// Vouches issued by an address (voucher side).
export const fetchGivenVouches = (
  address: string,
  limit = 50,
): Promise<VouchRow[]> =>
  get(`/profiles/${encodeURIComponent(address)}/given-vouches?limit=${limit}`);

export const evaluateTrust = (
  input: TrustEvaluateRequest,
): Promise<TrustEvaluateResponse> =>
  post('/v1/trust/evaluate', input);

export interface SponsorRequest {
  /** Base64-encoded tx kind bytes (Transaction.build({ onlyTransactionKind: true })). */
  txKindBytes: string;
  /** Sender wallet address -- must match the signing wallet. */
  sender: string;
  /** Optional gas budget override (MIST). Defaults to server MAX_GAS_BUDGET. */
  gasBudget?: number;
}

export interface SponsorResponse {
  /** Base64-encoded full tx bytes with gas envelope set by sponsor. */
  txBytes: string;
  /** Sponsor's Ed25519 signature over txBytes. */
  sponsorSignature: string;
}

// ── Oracle ────────────────────────────────────────────────────────────────────
// POST /gas/oracle/issue-attestation (proxied to gas station)
// The gas station holds the oracle key and signs directly — no user wallet needed.

export interface IssueAttestationRequest {
  schema_id:          string;
  subject:            string;
  value:              number;
  expiration_epochs?: number;
}

export interface IssueAttestationResponse {
  digest:         string;
  attestationId:  string | null;
}

export async function issueAttestation(
  req: IssueAttestationRequest,
): Promise<IssueAttestationResponse> {
  const res = await fetch(`${GAS_BASE}/oracle/issue-attestation`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Oracle ${res.status}: ${text}`);
  }
  return res.json() as Promise<IssueAttestationResponse>;
}

export async function sponsorTransaction(req: SponsorRequest): Promise<SponsorResponse> {
  const res = await fetch(`${GAS_BASE}/sponsor-transaction`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Gas station ${res.status}: ${text}`);
  }
  return res.json() as Promise<SponsorResponse>;
}

export const sponsorAttestation = sponsorTransaction;
