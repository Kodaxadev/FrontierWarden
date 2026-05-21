// useHealth — polls GET /health every 10s.
// Returns api online/offline status and uptime.

import { useState, useCallback } from 'react';
import { fetchHealth } from '../lib/api';
import type { HealthResponse } from '../types/api.types';
import { useGuardedPolling } from './useGuardedPolling';

export interface HealthState {
  data:    HealthResponse | null;
  online:  boolean;
  loading: boolean;
  error:   string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 10_000;

export function useHealth(): HealthState {
  const [data,    setData]    = useState<HealthResponse | null>(null);
  const [online,  setOnline]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const refreshTask = useCallback(async (isCurrent: () => boolean) => {
    try {
      const res = await fetchHealth();
      if (!isCurrent()) return;
      setData(res);
      setOnline(res.status === 'ok');
      setError(null);
    } catch (err) {
      if (!isCurrent()) return;
      setOnline(false);
      setError(err instanceof Error ? err.message : 'unreachable');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const refresh = useGuardedPolling(refreshTask, { intervalMs: POLL_MS });

  return { data, online, loading, error, refresh };
}
