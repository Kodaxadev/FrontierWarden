// Hydrates the FrontierWarden shell with live indexer data when available.
// Static design data remains the empty-indexer fallback.

import { useCallback, useEffect, useState } from 'react';
import { fetchChallenges, fetchGates } from '../lib/api';
import type { FraudChallengeRow, GateSummaryRow } from '../types/api.types';
import { FW_DATA } from '../components/features/frontierwarden/fw-data';
import type { FwAlert, FwData, FwGate } from '../components/features/frontierwarden/fw-data';

const POLL_MS = 10_000;

export interface FrontierWardenDataState {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
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

function mapGate(gate: GateSummaryRow): FwGate {
  const threshold = gate.ally_threshold;
  const status = gateStatus(gate);

  return {
    id: shortId(gate.gate_id),
    sourceId: gate.gate_id,
    from: 'Devnet gate',
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

function mergeLiveData(gates: GateSummaryRow[], challenges: FraudChallengeRow[]): FwData {
  const liveGates = gates.map(mapGate);
  const liveAlerts = challenges.slice(0, 5).map(challengeAlert);

  return {
    ...FW_DATA,
    gates: liveGates.length > 0 ? liveGates : FW_DATA.gates,
    alerts: liveAlerts.length > 0 ? liveAlerts : FW_DATA.alerts,
  };
}

export function useFrontierWardenData(): FrontierWardenDataState {
  const [data, setData] = useState<FwData>(FW_DATA);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [gates, challenges] = await Promise.all([
        fetchGates(),
        fetchChallenges(25),
      ]);
      setData(mergeLiveData(gates, challenges));
      setLive(gates.length > 0 || challenges.length > 0);
      setError(null);
    } catch (err) {
      setData(FW_DATA);
      setLive(false);
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, live, loading, error, refresh };
}
