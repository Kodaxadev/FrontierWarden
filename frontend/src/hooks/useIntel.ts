// useIntel — fetches GET /intel/:systemId on mount + on manual refresh.
// Not polled automatically because system IDs are user-driven queries.

import { useState, useEffect, useCallback } from 'react';
import { fetchIntel } from '../lib/api';
import type { SystemIntelResponse } from '../types/api.types';

export interface IntelState {
  data:    SystemIntelResponse | null;
  loading: boolean;
  error:   string | null;
  refresh: () => void;
}

export function useIntel(systemId: string): IntelState {
  const [data,    setData]    = useState<SystemIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!systemId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchIntel(systemId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
