// useNodeSentinel - Derives NodeSentinelState from existing FwData + live signals.
// Transforms protocol-module data into a place-based node-centric model.

import { useMemo } from 'react';
import type { FwData, FwAlert } from '../components/features/frontierwarden/fw-data';
import type { EveIdentity, IdentityEnrichmentMap } from '../types/api.types';
import { deriveCharacters, deriveWallets, resolutionCoverage } from './nodeSentinelIdentity';
import type {
  NodeSentinelState,
  WardenNode,
  TrustPerimeter,
  AccessRiskSummary,
  PolicyRecommendation,
  EnforcementStatus,
  RiskFinding,
  RecentChange,
  AssemblyRef,
  RiskLevel,
  RiskSeverity,
} from '../types/node-sentinel.types';

interface UseNodeSentinelOptions {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  eveIdentity?: EveIdentity | null;
  eveIdentityMap?: IdentityEnrichmentMap;
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
// FwGate.sourceId is currently a protocol gate/policy identifier, not a proven
// EVE world Gate binding. Keep Sentinel advisory until explicit binding exists.
function hasConfirmedWorldGateBinding(_data: FwData): boolean {
  return false;
}

// Build WardenNode from FwData

function deriveNode(data: FwData, identity?: EveIdentity | null): WardenNode {
  const assemblies: AssemblyRef[] = data.gates.map(g => ({
    assemblyId: g.sourceId ?? g.id,
    kind: 'gate' as const,
    status: g.status === 'closed' ? 'offline' as const : 'online' as const,
    label: `${g.from} -> ${g.to}`,
  }));

  return {
    nodeId: identity?.item_id ?? data.pilot.sourceId ?? 'NODE-UNKNOWN',
    ownerWallet: identity?.wallet ?? data.pilot.handle,
    tribeId: identity?.tribe_id ?? undefined,
    tribeName: identity?.tribe_name ?? data.pilot.tribe,
    systemId: data.systems[0]?.id,
    systemName: data.systems[0]?.name ?? 'Unknown System',
    status: data.gates.length > 0 ? 'online' : 'unknown',
    connectedAssemblies: assemblies,
    trustMode: 'advisory',
    powerStatus: data.gates.length > 0 ? 'online' : 'offline',
  };
}

// Derive Risk Findings

function deriveRisks(
  data: FwData,
  identity?: EveIdentity | null,
  identityMap: IdentityEnrichmentMap = {},
): {
  counterparties: RiskFinding[];
  challenges: RiskFinding[];
  stale: RiskFinding[];
  allWarnings: RiskFinding[];
} {
  const counterparties: RiskFinding[] = [];
  const challenges: RiskFinding[] = [];
  const stale: RiskFinding[] = [];
  const allWarnings: RiskFinding[] = [];

  // Fraud challenges -> risk findings
  for (const alert of data.alerts) {
    if (alert.lvl === 'CRIT') {
      const finding: RiskFinding = {
        id: `alert-${alert.t}`,
        severity: 'critical',
        category: 'fraud',
        title: 'Critical Alert',
        detail: alert.msg,
        timestamp: alert.t,
      };
      challenges.push(finding);
      allWarnings.push(finding);
    } else if (alert.lvl === 'WARN') {
      const finding: RiskFinding = {
        id: `alert-${alert.t}`,
        severity: 'high',
        category: alert.msg.toLowerCase().includes('fraud') ? 'fraud' : 'counterparty',
        title: 'Warning',
        detail: alert.msg,
        timestamp: alert.t,
      };
      counterparties.push(finding);
      allWarnings.push(finding);
    }
  }

  // Missing character mapping
  if (!identity?.character_id) {
    const finding: RiskFinding = {
      id: 'missing-character-mapping',
      severity: 'high',
      category: 'mapping',
      title: 'No character mapping',
      detail: 'Connected wallet has no confirmed EVE character binding. Identity verification incomplete.',
    };
    stale.push(finding);
    allWarnings.push(finding);
  }

  // Revoked attestations
  const revokedCount = data.proofs.filter(p => p.revoked).length;
  if (revokedCount > 0) {
    const finding: RiskFinding = {
      id: 'revoked-attestations',
      severity: 'medium',
      category: 'attestation',
      title: `${revokedCount} revoked attestation${revokedCount > 1 ? 's' : ''}`,
      detail: 'Attestations have been revoked - trust evidence may be outdated.',
    };
    stale.push(finding);
    allWarnings.push(finding);
  }

  // Profiles lacking character mapping (from vouches)
  const unmapped = data.vouches.filter(v => {
    const wallet = v.voucherWallet ?? v.by;
    return !identityMap[wallet]?.character_id;
  }).length;
  if (unmapped > 0) {
    const finding: RiskFinding = {
      id: 'unmapped-vouchers',
      severity: 'medium',
      category: 'mapping',
      title: `${unmapped} voucher profile${unmapped > 1 ? 's' : ''} lack character mapping`,
      detail: 'Voucher wallets have no confirmed character identity.',
    };
    stale.push(finding);
    allWarnings.push(finding);
  }

  // Gate topology check
  if (!hasConfirmedWorldGateBinding(data)) {
    const finding: RiskFinding = {
      id: 'gate-topology-unavailable',
      severity: 'medium',
      category: 'policy',
      title: 'Gate topology unavailable',
      detail: 'No confirmed GatePolicy -> world Gate binding - topology warnings remain advisory.',
    };
    stale.push(finding);
    allWarnings.push(finding);
  }

  // No world-gate pointer
  if (!hasConfirmedWorldGateBinding(data)) {
    const finding: RiskFinding = {
      id: 'no-world-gate-pointer',
      severity: 'medium',
      category: 'policy',
      title: 'No world-gate pointer confirmed',
      detail: 'Gate policy is not linked to a confirmed world object - enforcement unavailable.',
    };
    stale.push(finding);
    allWarnings.push(finding);
  }

  return { counterparties, challenges, stale, allWarnings };
}

// Access Risk Summary

function deriveAccessRisk(data: FwData, risks: RiskFinding[]): AccessRiskSummary {
  const critCount = risks.filter(r => r.severity === 'critical').length;
  const highCount = risks.filter(r => r.severity === 'high').length;

  const hasGatePolicy = !!data.policy;
  const hasWorldGateBinding = hasConfirmedWorldGateBinding(data);
  const hasCounterpartyRisk = risks.some(r => r.category === 'counterparty');

  const overallRisk: RiskLevel =
    critCount > 0 ? 'high' :
    highCount > 1 ? 'high' :
    highCount > 0 ? 'medium' :
    risks.length > 0 ? 'medium' : 'low';

  return {
    storage: risks.some(r => r.category === 'fraud') ? 'high' : 'medium',
    gatePolicy: hasGatePolicy && hasWorldGateBinding ? (data.gates.some(g => g.status === 'camped') ? 'high' : 'low') : 'unlinked',
    trade: 'unknown',
    counterpartyRisk: hasCounterpartyRisk ? 'high' : 'medium',
    overallRisk,
  };
}

// Policy Recommendations

function deriveRecommendations(data: FwData, risks: RiskFinding[]): PolicyRecommendation[] {
  const recs: PolicyRecommendation[] = [];

  const hasMapping = data.pilot.characterName != null;
  const hasCritRisk = risks.some(r => r.severity === 'critical');
  const hasPolicy = !!data.policy;
  const hasWorldGateBinding = hasConfirmedWorldGateBinding(data);

  if (!hasMapping) {
    recs.push({
      targetType: 'tribe',
      action: 'require_attestation',
      confidence: 0.9,
      reasonCodes: ['MISSING_CHARACTER_MAPPING'],
      evidence: ['No character <-> wallet binding confirmed'],
    });
  }

  if (hasCritRisk) {
    recs.push({
      targetType: 'gate',
      action: 'manual_review',
      confidence: 0.85,
      reasonCodes: ['CRITICAL_RISK_ACTIVE'],
      evidence: risks.filter(r => r.severity === 'critical').map(r => r.detail),
    });
  }

  if (!hasPolicy || !hasWorldGateBinding) {
    recs.push({
      targetType: 'gate',
      action: 'deny',
      confidence: 0.7,
      reasonCodes: hasPolicy ? ['NO_WORLD_GATE_BINDING', 'ADVISORY_ONLY'] : ['NO_GATE_POLICY', 'ADVISORY_ONLY'],
      evidence: ['No confirmed world-gate binding - do not enable automated passage policy'],
    });
  }

  // Default recommendation for non-tribe users
  recs.push({
    targetType: 'storage',
    action: 'manual_review',
    confidence: 0.75,
    reasonCodes: ['DEFAULT_NON_TRIBE'],
    evidence: ['Require manual review for non-tribe users'],
  });

  return recs;
}

// Enforcement Status

function deriveEnforcement(data: FwData, identity?: EveIdentity | null): EnforcementStatus {
  const blockers: EnforcementStatus['blockers'] = [];

  if (!data.policy) blockers.push('no_policy_set');
  if (!identity?.character_id) blockers.push('missing_character_mapping');

  if (!hasConfirmedWorldGateBinding(data)) blockers.push('missing_world_gate_link');

  return {
    canEnforce: blockers.length === 0,
    mode: blockers.length === 0 ? 'advisory' : 'none',
    blockers,
  };
}

// Recent Changes

function deriveRecentChanges(data: FwData): RecentChange[] {
  const changes: RecentChange[] = [];

  for (const alert of data.alerts.slice(0, 8)) {
    const severity: RiskSeverity = alert.lvl === 'CRIT' ? 'critical' : alert.lvl === 'WARN' ? 'high' : 'info';
    changes.push({
      kind: alert.lvl === 'CRIT' ? 'challenge_opened' :
            alert.msg.toLowerCase().includes('vouch') ? 'attestation_new' :
            alert.msg.toLowerCase().includes('policy') ? 'policy_changed' : 'challenge_opened',
      summary: alert.msg,
      timestamp: alert.t,
      severity,
    });
  }

  for (const proof of data.proofs.slice(0, 4)) {
    changes.push({
      kind: proof.revoked ? 'attestation_revoked' : 'attestation_new',
      summary: `${proof.schema} attestation ${proof.revoked ? 'revoked' : 'issued'} by ${shortAddr(proof.issuer)}`,
      timestamp: '',
      severity: proof.revoked ? 'high' : 'info',
    });
  }

  return changes;
}

// Main Hook

export function useNodeSentinel({
  data,
  live,
  loading,
  error,
  eveIdentity,
  eveIdentityMap = {},
}: UseNodeSentinelOptions): NodeSentinelState {
  return useMemo(() => {
    const node = deriveNode(data, eveIdentity);
    const { counterparties, challenges, stale, allWarnings } = deriveRisks(data, eveIdentity, eveIdentityMap);
    const knownCharacters = deriveCharacters(data, eveIdentity, eveIdentityMap);
    const knownWallets = deriveWallets(data, eveIdentity, eveIdentityMap);

    const perimeter: TrustPerimeter = {
      nodeId: node.nodeId,
      knownCharacters,
      knownWallets,
      identityCoverage: resolutionCoverage(knownWallets),
      riskyCounterparties: counterparties,
      unresolvedChallenges: challenges,
      staleSignals: stale,
      trustFabricStatus:
        allWarnings.some(w => w.severity === 'critical') ? 'critical' :
        allWarnings.filter(w => w.severity === 'high').length > 1 ? 'degraded' :
        allWarnings.length > 0 ? 'degraded' : 'healthy',
    };

    return {
      node,
      perimeter,
      accessRisk: deriveAccessRisk(data, allWarnings),
      recommendations: deriveRecommendations(data, allWarnings),
      enforcement: deriveEnforcement(data, eveIdentity),
      recentChanges: deriveRecentChanges(data),
      warnings: allWarnings,
      loading,
      error,
    };
  }, [data, live, loading, error, eveIdentity, eveIdentityMap]);
}
