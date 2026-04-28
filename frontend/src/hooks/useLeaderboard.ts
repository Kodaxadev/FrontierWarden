// useLeaderboard — polls GET /leaderboard/:schemaId every 5s.
// Used by LeaderboardPanel for live CREDIT score rankings.

import { useState, useEffect, useCallback } from 'react';
import { fetchLeaderboard } from '../lib/api';
import type { LeaderboardEntry } from '../types/api.types';

export interface LeaderboardState {
  data:    LeaderboardEntry[];
  loading: boolean;
  error:   string | null;
  refresh: () => void;
  pulse:   boolean; // true for one tick after a fresh fetch — used for scan-in animation
}

const POLL_MS = 5_000;

export function useLeaderboard(
  schemaId: string,
  limit = 20,
): LeaderboardState {
  const [data,    setData]    = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [pulse,   setPulse]   = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchLeaderboard(schemaId, limit);
      setData(res);
      setError(null);
      setPulse(true);
      setTimeout(() => setPulse(false), 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [schemaId, limit]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh, pulse };
}
