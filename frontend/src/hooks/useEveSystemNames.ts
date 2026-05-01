// useEveSystemNames — fetches solar system names and provides a lookup hook.
// Returns a function that resolves system IDs to names when available.

import { useState, useEffect, useCallback } from 'react';
import { fetchEveSolarSystems } from '../lib/api';
import type { EveSolarSystem } from '../types/api.types';

export function useEveSystemNames(): (systemId: string) => string | null {
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchEveSolarSystems(2000)
      .then((systems) => {
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const sys of systems) {
            if (sys.name) {
              map.set(sys.system_id, sys.name);
            }
          }
          setNameMap(map);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return useCallback(
    (systemId: string) => nameMap.get(systemId) ?? null,
    [nameMap],
  );
}
