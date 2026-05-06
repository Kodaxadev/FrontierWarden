// Hydrates the FrontierWarden shell with live indexer data when available.
// Static design data remains the empty-indexer fallback.

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { fetchAttestationFeed, fetchAttestations, fetchChallenges, fetchEveIdentity, fetchGatePolicy, fetchGates, fetchLeaderboard, fetchScores, fetchVouches } from '../lib/api';
import { networkTitle, SUI_NETWORK_LABEL } from '../lib/network';
import type { AttestationFeedRow, AttestationRow, EveIdentity, FraudChallengeRow, GatePolicyRow, GateSummaryRow, LeaderboardEntry, ScoreRow, VouchRow } from '../types/api.types';
import { FW_DATA } from '../components/features/frontierwarden/fw-data';
import type { FwAlert, FwContract, FwData, FwGate, FwKill, FwPilot, FwPolicy, FwProof, FwVouch } from '../components/features/frontierwarden/fw-data';
import type { Provenance } from '../components/features/frontierwarden/LiveStatus';

const POLL_MS = 10_000;

export interface FrontierWardenDataState {
  data: FwData;
  live: boolean;
  loading: boolean;
  reputationLive: boolean;
  killboardLive: boolean;
  policyLive: boolean;
  contractsLive: boolean;
  provenance: Record<string, Provenance>;
  error: string | null;
  eveIdentity: EveIdentity | null;
  refresh: () => void;
}

export interface UseFrontierWardenDataOptions {
  demoEnabled?: boolean;
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function gateStatus(gate: GateSummaryRow): FwGate['status'] {
  if (gate.denies_24h > 0) return 'camped';
  if ((gate.base_toll_mist ?? 0) > 0) return 'toll';
  return 'open';
}

function formatToll(mist: number | null | undefined): string {
  if (!mist) return '0';
  const sui = mist / 1_000_000_000;
  if (sui >= 1) return `${sui.toFixed(2)} SUI`;
  return `${mist.toLocaleString()} MIST`;
}

function formatUpdated(value: string | null | undefined): string {
  return value ?? new Date().toISOString();
}

function ageLabel(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'indexed';
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function mapGate(gate: GateSummaryRow): FwGate {
  const threshold = gate.ally_threshold;
  const status = gateStatus(gate);

  return {
    id: shortId(gate.gate_id),
    sourceId: gate.gate_id,
    from: `${networkTitle(SUI_NETWORK_LABEL.toLowerCase())} gate`,
    to: shortId(gate.gate_id),
    status,
    toll: formatToll(gate.base_toll_mist),
    traffic: gate.passages_24h,
    policy: threshold == null ? 'OBSERVE' : `ALLY >= ${threshold}`,
    updated: formatUpdated(gate.config_updated_at),
    threat: gate.denies_24h > 0 ? `${gate.denies_24h} denied / 24h` : undefined,
    checkpoint: gate.latest_checkpoint,
  };
}

function challengeAlert(challenge: FraudChallengeRow): FwAlert {
  const time = (challenge.resolved_at ?? challenge.created_at).split('T')[1]?.replace('Z', '') ?? '--:--:--';
  const id = shortId(challenge.challenge_id);

  if (!challenge.resolved) {
    return {
      lvl: 'WARN',
      t: time,
      msg: `Open fraud challenge ${id} against oracle ${shortId(challenge.oracle)}`,
    };
  }

  return {
    lvl: challenge.guilty ? 'CRIT' : 'INFO',
    t: time,
    msg: `Fraud challenge ${id} resolved ${challenge.guilty ? 'guilty' : 'cleared'}`,
  };
}

function liveScore(scores: ScoreRow[], fallback: LeaderboardEntry): ScoreRow | null {
  return scores.find(s => s.schema_id === 'CREDIT')
    ?? scores.find(s => s.schema_id === 'TRIBE_STANDING')
    ?? scores[0]
    ?? {
      profile_id: fallback.profile_id,
      schema_id: 'CREDIT',
      value: fallback.value,
      issuer: fallback.issuer,
      last_tx_digest: '',
      last_checkpoint: 0,
    };
}

function mapPilot(entry: LeaderboardEntry, scores: ScoreRow[], eveIdentity?: EveIdentity | null): FwPilot {
  const primary = liveScore(scores, entry);
  const checkpoint = primary?.last_checkpoint ?? null;

  const characterName = eveIdentity?.character_name ?? null;
  const tribeDisplay = eveIdentity?.tribe_name
    ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})`
    : eveIdentity?.tribe_id
      ? eveIdentity.tribe_id
      : `Issuer ${shortId(primary?.issuer ?? entry.issuer)}`;

  return {
    ...FW_DATA.pilot,
    name: characterName ?? `Live Profile ${shortId(entry.profile_id)}`,
    handle: shortId(entry.profile_id),
    syndicate: `${networkTitle(SUI_NETWORK_LABEL.toLowerCase())} indexed profile`,
    syndicateTag: primary?.schema_id ?? 'LIVE',
    tribe: tribeDisplay,
    standing: primary?.schema_id ?? 'INDEXED',
    score: primary?.value ?? entry.value,
    scoreDelta: 0,
    walletLux: 0,
    timestamp: checkpoint ? `checkpoint ${checkpoint}` : FW_DATA.pilot.timestamp,
    sourceId: entry.profile_id,
    checkpoint,
    characterName,
  };
}

function mapVouches(rows: VouchRow[]): FwVouch[] {
  const maxStake = Math.max(...rows.map(row => row.stake_amount), 1);

  return rows.map(row => ({
    from: `Voucher ${shortId(row.voucher)}`,
    weight: Math.max(0.05, Math.min(1, row.stake_amount / maxStake)),
    by: `${shortId(row.created_tx)}${row.redeemed ? ' · redeemed' : ' · active'}`,
    ts: row.redeemed_at ?? row.created_at,
  }));
}

function mapProofs(rows: AttestationRow[]): FwProof[] {
  return rows.map(row => ({
    id: shortId(row.attestation_id),
    schema: row.schema_id,
    issuer: shortId(row.issuer),
    value: row.value,
    tx: shortId(row.issued_tx),
    revoked: row.revoked,
  }));
}

function mapKills(rows: AttestationFeedRow[]): FwKill[] {
  return rows.map(row => ({
    id: shortId(row.attestation_id),
    t: row.issued_at,
    victim: shortId(row.subject),
    ship: 'SHIP_KILL attestation',
    system: `${networkTitle(SUI_NETWORK_LABEL.toLowerCase())} indexed`,
    lux: Math.max(0, row.value),
    attackers: 1,
    hash: row.issued_tx,
    verified: !row.revoked,
    issuer: shortId(row.issuer),
  }));
}

function mapPolicy(row: GatePolicyRow | null): FwPolicy | undefined {
  if (!row) return undefined;
  return {
    gateId: row.gate_id,
    allyThreshold: row.ally_threshold,
    baseTollMist: row.base_toll_mist,
    txDigest: row.tx_digest,
    checkpoint: row.checkpoint_seq,
    indexedAt: row.indexed_at,
  };
}

function bountyLabel(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} SUI`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}

function contractPriority(value: number): FwContract['priority'] {
  if (value >= 1_000_000_000) return 'CRIT';
  if (value >= 100_000_000) return 'HIGH';
  if (value >= 10_000_000) return 'MED';
  return 'LOW';
}

function mapContracts(rows: AttestationFeedRow[]): FwContract[] {
  return rows.map(row => ({
    id: shortId(row.attestation_id),
    kind: 'BOUNTY',
    target: shortId(row.subject),
    bounty: bountyLabel(row.value),
    age: ageLabel(row.issued_at),
    priority: contractPriority(row.value),
    state: row.revoked ? 'EXPIRED' : 'OPEN',
    issuer: shortId(row.issuer),
    tx: shortId(row.issued_tx),
  }));
}

function mergeLiveData(
  gates: GateSummaryRow[],
  challenges: FraudChallengeRow[],
  profile: LeaderboardEntry | null,
  scores: ScoreRow[],
  vouches: VouchRow[],
  attestations: AttestationRow[],
  shipKills: AttestationFeedRow[],
  policy: GatePolicyRow | null,
  contracts: AttestationFeedRow[],
  eveIdentity: EveIdentity | null,
  demoEnabled: boolean,
): { data: FwData; provenance: Record<string, Provenance> } {
  const liveGates = gates.map(mapGate);
  const liveAlerts = challenges.slice(0, 5).map(challengeAlert);
  const liveVouches = mapVouches(vouches);
  const liveProofs = mapProofs(attestations);
  const liveKills = mapKills(shipKills);
  const livePolicy = mapPolicy(policy);
  const liveContracts = mapContracts(contracts);

  const gateProv: Provenance = liveGates.length > 0 ? 'LIVE' : demoEnabled ? 'DEMO' : 'EMPTY';
  const killProv: Provenance = liveKills.length > 0 ? 'LIVE' : demoEnabled ? 'DEMO' : 'EMPTY';
  const contractProv: Provenance = liveContracts.length > 0 ? 'LIVE' : demoEnabled ? 'DEMO' : 'EMPTY';
  const repProv: Provenance = profile ? 'LIVE' : demoEnabled ? 'DEMO' : 'EMPTY';
  const policyProv: Provenance = livePolicy ? 'LIVE' : demoEnabled ? 'DEMO' : 'EMPTY';

  return {
    data: {
      ...FW_DATA,
      pilot: profile ? mapPilot(profile, scores, eveIdentity) : (demoEnabled ? { ...FW_DATA.pilot, timestamp: '[DEMO] mockup — no live profile' } : { ...FW_DATA.pilot, score: 0, scoreDelta: 0, timestamp: 'no profile', sourceId: undefined, checkpoint: null }),
      policy: livePolicy ?? (demoEnabled ? FW_DATA.policy : undefined),
      gates: liveGates.length > 0 ? liveGates : (demoEnabled ? FW_DATA.gates : []),
      kills: liveKills.length > 0 ? liveKills : (demoEnabled ? FW_DATA.kills : []),
      contracts: liveContracts.length > 0 ? liveContracts : (demoEnabled ? FW_DATA.contracts : []),
      vouches: liveVouches.length > 0 ? liveVouches : (demoEnabled ? FW_DATA.vouches : []),
      proofs: liveProofs.length > 0 ? liveProofs : (demoEnabled ? FW_DATA.proofs : []),
      alerts: liveAlerts.length > 0 ? liveAlerts : (demoEnabled ? FW_DATA.alerts : []),
    },
    provenance: {
      gateNetwork: gateProv,
      reputation: repProv,
      killboard: killProv,
      contracts: contractProv,
      policy: policyProv,
    },
  };
}

export function useFrontierWardenData(options: UseFrontierWardenDataOptions = {}): FrontierWardenDataState {
  const { demoEnabled = true } = options;
  const account = useCurrentAccount();
  const [data, setData] = useState<FwData>(FW_DATA);
  const [live, setLive] = useState(false);
  const [reputationLive, setReputationLive] = useState(false);
  const [killboardLive, setKillboardLive] = useState(false);
  const [policyLive, setPolicyLive] = useState(false);
  const [contractsLive, setContractsLive] = useState(false);
  const [provenance, setProvenance] = useState<Record<string, Provenance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eveIdentity, setEveIdentity] = useState<EveIdentity | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [gates, challenges, creditLeaders, standingLeaders, shipKills, bountyContracts] = await Promise.all([
        fetchGates(),
        fetchChallenges(25),
        fetchLeaderboard('CREDIT', 1),
        fetchLeaderboard('TRIBE_STANDING', 1),
        fetchAttestationFeed({ schema_id: 'SHIP_KILL', limit: 50 }),
        fetchAttestationFeed({ schema_id: 'PLAYER_BOUNTY', limit: 50 }),
      ]);
      const profile = creditLeaders[0] ?? standingLeaders[0] ?? null;
      const firstGateId = gates.find(g => g.gate_id)?.gate_id ?? null;
      const [scores, vouches, attestations] = profile
        ? await Promise.all([
          fetchScores(profile.profile_id),
          fetchVouches(profile.profile_id, 8),
          fetchAttestations(profile.profile_id, { limit: 8 }),
        ])
        : [[], [], []] as [ScoreRow[], VouchRow[], AttestationRow[]];
      const policy = firstGateId ? await fetchGatePolicy(firstGateId) : null;

      // Fetch EVE identity for the connected wallet
      const identity = account?.address
        ? await fetchEveIdentity(account.address).catch(() => null)
        : null;
      setEveIdentity(identity);

      const result = mergeLiveData(gates, challenges, profile, scores, vouches, attestations, shipKills, policy, bountyContracts, identity, demoEnabled);
      setData(result.data);
      setProvenance(result.provenance);
      setLive(gates.length > 0 || challenges.length > 0 || profile != null || shipKills.length > 0 || policy != null || bountyContracts.length > 0);
      setReputationLive(profile != null);
      setKillboardLive(shipKills.length > 0);
      setPolicyLive(policy != null);
      setContractsLive(bountyContracts.length > 0);
      setError(null);
    } catch (err) {
      setData(FW_DATA);
      setLive(false);
      setReputationLive(false);
      setKillboardLive(false);
      setPolicyLive(false);
      setContractsLive(false);
      setProvenance({
        gateNetwork: 'ERROR',
        reputation: 'ERROR',
        killboard: 'ERROR',
        contracts: 'ERROR',
        policy: 'ERROR',
      });
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [demoEnabled, account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, live, loading, reputationLive, killboardLive, policyLive, contractsLive, provenance, error, eveIdentity, refresh };
}
