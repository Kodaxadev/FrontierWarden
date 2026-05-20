// useGateGroups — client-side gate tagging for corridor / group management.
// Persisted in localStorage so operators keep their groupings across sessions.

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'fw:gate-groups';

export interface GateGroupMap {
  /** gateId → group label */
  [gateId: string]: string;
}

function load(): GateGroupMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GateGroupMap) : {};
  } catch { return {}; }
}

function persist(map: GateGroupMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function useGateGroups() {
  const [groups, setGroups] = useState<GateGroupMap>(load);

  const setGroup = useCallback((gateId: string, label: string) => {
    setGroups(prev => {
      const next = { ...prev };
      if (label) {
        next[gateId] = label;
      } else {
        delete next[gateId];
      }
      persist(next);
      return next;
    });
  }, []);

  const removeGroup = useCallback((gateId: string) => {
    setGroups(prev => {
      const next = { ...prev };
      delete next[gateId];
      persist(next);
      return next;
    });
  }, []);

  /** All unique group labels currently in use. */
  const labels = [...new Set(Object.values(groups))].sort();

  return { groups, labels, setGroup, removeGroup };
}
