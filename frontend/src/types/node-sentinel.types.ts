// Node Sentinel domain types — place-based trust & security model.
// FrontierWarden organizes around in-game places (Network Nodes),
// not protocol modules.

import type { EveIdentity } from './api.types';

// ── Node Object ─────────────────────────────────────────────────────────────

export type NodeStatus = 'online' | 'offline' | 'unknown';
export type TrustMode = 'advisory' | 'enforced' | 'simulation';

export interface AssemblyRef {
  assemblyId: string;
  kind: 'gate' | 'storage' | 'trade' | 'defense' | 'unknown';
  status: 'online' | 'offline' | 'unlinked';
  label?: string;
}

export interface WardenNode {
  nodeId: string;
  ownerWallet: string;
  tribeId?: string;
  tribeName?: string;
  systemId?: string;
  systemName?: string;
  status: NodeStatus;
  connectedAssemblies: AssemblyRef[];
  trustMode: TrustMode;
  powerStatus: 'online' | 'low' | 'offline';
}

// ── Character ↔ Wallet ↔ Reputation mapping ─────────────────────────────────

export interface CharacterTrustProfile {
  wallet: string;
  characterId?: string | null;
  characterName?: string | null;
  tribeId?: string | null;
  tribeName?: string | null;
  profileId?: string | null;
  score: number | null;
  schemaId?: string;
  attestationCount: number;
  hasCharacterMapping: boolean;
  lastSeen?: string;
}

export interface WalletTrustProfile {
  wallet: string;
  identity?: EveIdentity | null;
  score: number | null;
  vouchCount: number;
  attestationCount: number;
  hasProfile: boolean;
  hasCharacterMapping: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
}

// ── Risk Findings ───────────────────────────────────────────────────────────

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface RiskFinding {
  id: string;
  severity: RiskSeverity;
  category: 'counterparty' | 'fraud' | 'attestation' | 'mapping' | 'oracle' | 'policy' | 'stale';
  title: string;
  detail: string;
  evidence?: string;
  timestamp?: string;
}

// ── Trust Perimeter ─────────────────────────────────────────────────────────

export interface TrustPerimeter {
  nodeId: string;
  knownCharacters: CharacterTrustProfile[];
  knownWallets: WalletTrustProfile[];
  riskyCounterparties: RiskFinding[];
  unresolvedChallenges: RiskFinding[];
  staleSignals: RiskFinding[];
  trustFabricStatus: 'healthy' | 'degraded' | 'critical' | 'unknown';
}

// ── Policy Recommendations ──────────────────────────────────────────────────

export type PolicyAction = 'allow' | 'deny' | 'manual_review' | 'raise_threshold' | 'require_attestation' | 'require_tribe_approval';
export type PolicyTarget = 'storage' | 'gate' | 'trade' | 'defense' | 'tribe';

export interface PolicyRecommendation {
  targetType: PolicyTarget;
  targetId?: string;
  action: PolicyAction;
  confidence: number;
  reasonCodes: string[];
  evidence: string[];
}

// ── Enforcement Status ──────────────────────────────────────────────────────

export type EnforcementMode = 'none' | 'advisory' | 'simulated' | 'onchain';
export type EnforcementBlocker =
  | 'missing_world_gate_link'
  | 'missing_character_mapping'
  | 'missing_oracle_data'
  | 'unsupported_assembly'
  | 'no_policy_set';

export interface EnforcementStatus {
  canEnforce: boolean;
  mode: EnforcementMode;
  blockers: EnforcementBlocker[];
}

// ── Access Risk Summary ─────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface AccessRiskSummary {
  storage: RiskLevel;
  gatePolicy: RiskLevel | 'unlinked';
  trade: RiskLevel;
  counterpartyRisk: RiskLevel;
  overallRisk: RiskLevel;
}

// ── Recent Changes ──────────────────────────────────────────────────────────

export type ChangeKind =
  | 'profile_linked'
  | 'attestation_new'
  | 'attestation_revoked'
  | 'challenge_opened'
  | 'challenge_resolved'
  | 'policy_changed'
  | 'oracle_gap'
  | 'object_stale';

export interface RecentChange {
  kind: ChangeKind;
  summary: string;
  timestamp: string;
  severity: RiskSeverity;
}

// ── Aggregate Sentinel State ────────────────────────────────────────────────

export interface NodeSentinelState {
  node: WardenNode;
  perimeter: TrustPerimeter;
  accessRisk: AccessRiskSummary;
  recommendations: PolicyRecommendation[];
  enforcement: EnforcementStatus;
  recentChanges: RecentChange[];
  warnings: RiskFinding[];
  loading: boolean;
  error: string | null;
}
