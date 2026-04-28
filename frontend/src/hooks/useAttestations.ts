// useAttestations — polls GET /attestations/:subject every 5s.
// Accepts an optional schema filter for narrowing the feed.

import { useState, useEffect, useCallback } from 'react';
import { fetchAttestations } from '../lib/api';
import type { AttestationFilter } from '../lib/api';
import type { AttestationRow } from '../types/api.types';

export interface AttestationsState {
  data:    AttestationRow[];
  loading: boolean;
  error:   string | null;
  refresh: () => void;
}

const POLL_MS = 5_000;

export function useAttestations(
  subject: string,
  filter: AttestationFilter = {},
): AttestationsState {
  const [data,    setData]    = useState<AttestationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const filterKey = JSON.stringify(filter);

  const refresh = useCallback(async () => {
    if (!subject) return;
    try {
      const res = await fetchAttestations(subject, filter);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, filterKey]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
