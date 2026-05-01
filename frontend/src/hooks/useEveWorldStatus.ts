// useEveWorldStatus — fetches EVE world data counts on mount.
// Lightweight status strip for dashboard header.

import { useState, useEffect } from 'react';
import { fetchEveWorldStatus } from '../lib/api';

export interface EveWorldStatusResult {
  systems_count: number;
  types_count: number;
  tribes_count: number;
  ships_count: number;
  source: string;
  loading: boolean;
  error: string | null;
}

export function useEveWorldStatus(): EveWorldStatusResult {
  const [data, setData] = useState({
    systems_count: 0,
    types_count: 0,
    tribes_count: 0,
    ships_count: 0,
    source: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEveWorldStatus()
      .then((status) => {
        if (!cancelled) {
          setData(status);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'fetch failed');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return { ...data, loading, error };
}
