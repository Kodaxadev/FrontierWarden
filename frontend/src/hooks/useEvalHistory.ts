// useEvalHistory — localStorage-backed trust evaluation history.
// Stores the last N evaluation results so operators can review previous lookups.

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'fw:eval-history';
const MAX_ENTRIES = 20;

export interface EvalHistoryEntry {
  subject: string;
  action: string;
  decision: string;
  score: number | null;
  confidence: number;
  reason: string;
  timestamp: string;
}

function load(): EvalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EvalHistoryEntry[]) : [];
  } catch { return []; }
}

function persist(entries: EvalHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useEvalHistory() {
  const [entries, setEntries] = useState<EvalHistoryEntry[]>(load);

  const addEntry = useCallback((entry: Omit<EvalHistoryEntry, 'timestamp'>) => {
    setEntries(prev => {
      const next = [{ ...entry, timestamp: new Date().toISOString() }, ...prev].slice(0, MAX_ENTRIES);
      persist(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { entries, addEntry, clearHistory };
}
