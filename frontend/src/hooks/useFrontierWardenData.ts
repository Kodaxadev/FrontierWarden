// Hydrates the FrontierWarden shell with live indexer data when available.
// Static design data remains the empty-indexer fallback.

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { fetchAttestationFeed, fetchAttestations, fetchBatchIdentities, fetchChallenges, fetchEveIdentity, fetchGatePolicy, fetchGates, fetchKillMails, fetchLeaderboard, fetchScores, fetchVouches } from '../lib/api';
import type { AttestationFeedRow, AttestationRow, EveIdentity, IdentityEnrichmentMap, ScoreRow, VouchRow } from '../types/api.types';
import { FW_DATA } from '../components/features/frontierwarden/fw-data';
import type { FwData } from '../components/features/frontierwarden/fw-data';
import type { Provenance } from '../components/features/frontierwarden/LiveStatus';
import { collectIdentityWallets, fetchGateBindings, mergeLiveData } from './fw-data-mappers';

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
  eveIdentityMap: IdentityEnrichmentMap;
  refresh: () => void;
}

export type UseFrontierWardenDataOptions = Record<string, never>;

export function useFrontierWardenData(options: UseFrontierWardenDataOptions = {}): FrontierWardenDataState {

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
  const [eveIdentityMap, setEveIdentityMap] = useState<IdentityEnrichmentMap>({});

  const refresh = useCallback(async () => {
    try {
      const [gates, challenges, creditLeaders, standingLeaders, killMailsResp, bountyContracts, shipKillAttestations] = await Promise.all([
        fetchGates(),
        fetchChallenges(25),
        fetchLeaderboard('CREDIT', 1),
        fetchLeaderboard('TRIBE_STANDING', 1),
        // Native kill mails are the primary killboard source.
        fetchKillMails({ limit: 50 }).catch(() => ({ items: [], total: 0, nextCursor: null, dataNote: '' })),
        fetchAttestationFeed({ schema_id: 'PLAYER_BOUNTY', limit: 50 }),
        // SHIP_KILL attestations remain fetched for the "ATTESTED" badge overlay only.
        fetchAttestationFeed({ schema_id: 'SHIP_KILL', limit: 50 }).catch(() => [] as AttestationFeedRow[]),
      ]);
      const nativeKills = killMailsResp.items;
      const profile = creditLeaders[0] ?? standingLeaders[0] ?? null;
      const firstGateId = gates.find(g => g.gate_id)?.gate_id ?? null;
      const gateBindings = await fetchGateBindings(gates);
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
      const identityWallets = collectIdentityWallets(
        account?.address,
        vouches,
        attestations,
        bountyContracts,
      );
      const identityMap = identityWallets.length > 0
        ? await fetchBatchIdentities(identityWallets).catch(() => ({}))
        : {};
      setEveIdentity(identity);
      setEveIdentityMap(identityMap);

      const result = mergeLiveData(gates, gateBindings, challenges, profile, scores, vouches, attestations, nativeKills, shipKillAttestations, policy, bountyContracts, identity, identityMap);
      setData(result.data);
      setProvenance(result.provenance);
      setLive(gates.length > 0 || challenges.length > 0 || profile != null || nativeKills.length > 0 || policy != null || bountyContracts.length > 0);
      setReputationLive(profile != null);
      setKillboardLive(nativeKills.length > 0);
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
      setEveIdentityMap({});
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, live, loading, reputationLive, killboardLive, policyLive, contractsLive, provenance, error, eveIdentity, eveIdentityMap, refresh };
}
