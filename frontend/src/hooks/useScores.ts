// useScores — fetches GET /scores/:profileId on mount and on manual refresh.
// Returns all schema scores for a given profile address.

import { useState, useEffect, useCallback } from 'react';
import { fetchScores } from '../lib/api';
import type { ScoreRow } from '../types/api.types';

export interface ScoresState {
  data:    ScoreRow[];
  loading: boolean;
  error:   string | null;
  refresh: () => void;
}

const POLL_MS = 10_000;

export function useScores(profileId: string): ScoresState {
  const [data,    setData]    = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const res = await fetchScores(profileId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, profileId]);

  return { data, loading, error, refresh };
}
