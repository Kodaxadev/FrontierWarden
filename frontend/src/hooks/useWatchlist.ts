// useWatchlist — localStorage-backed counterparty watchlist for creditors.
// Stores wallet addresses with optional labels and notes.

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'fw:credit-watchlist';

export interface WatchlistEntry {
  address: string;
  label: string;
  notes: string;
  addedAt: string;
}

function load(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchlistEntry[]) : [];
  } catch { return []; }
}

function persist(entries: WatchlistEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>(load);

  const addEntry = useCallback((address: string, label: string, notes = '') => {
    setEntries(prev => {
      const normalized = address.toLowerCase();
      if (prev.some(e => e.address.toLowerCase() === normalized)) return prev;
      const next = [...prev, { address, label, notes, addedAt: new Date().toISOString() }];
      persist(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((address: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.address.toLowerCase() !== address.toLowerCase());
      persist(next);
      return next;
    });
  }, []);

  const updateEntry = useCallback((address: string, patch: Partial<Pick<WatchlistEntry, 'label' | 'notes'>>) => {
    setEntries(prev => {
      const next = prev.map(e => {
        if (e.address.toLowerCase() !== address.toLowerCase()) return e;
        return { ...e, ...patch };
      });
      persist(next);
      return next;
    });
  }, []);

  const hasAddress = useCallback((address: string) => {
    return entries.some(e => e.address.toLowerCase() === address.toLowerCase());
  }, [entries]);

  return { entries, addEntry, removeEntry, updateEntry, hasAddress };
}
