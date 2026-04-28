// useHealth — polls GET /health every 10s.
// Returns api online/offline status and uptime.

import { useState, useEffect, useCallback } from 'react';
import { fetchHealth } from '../lib/api';
import type { HealthResponse } from '../types/api.types';

export interface HealthState {
  data:    HealthResponse | null;
  online:  boolean;
  loading: boolean;
  error:   string | null;
  refresh: () => void;
}

const POLL_MS = 10_000;

export function useHealth(): HealthState {
  const [data,    setData]    = useState<HealthResponse | null>(null);
  const [online,  setOnline]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchHealth();
      setData(res);
      setOnline(res.status === 'ok');
      setError(null);
    } catch (err) {
      setOnline(false);
      setError(err instanceof Error ? err.message : 'unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, online, loading, error, refresh };
}
