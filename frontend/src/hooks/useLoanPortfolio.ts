// useLoanPortfolio — client-side loan tracking for creditors.
// Persisted in localStorage. Tracks loans the operator has issued or is monitoring.
// Future: replace with indexed loan data when the backend exposes loan events.

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'fw:loan-portfolio';

export type LoanStatus = 'active' | 'repaid' | 'defaulted' | 'overdue';

export interface LoanRecord {
  id: string;           // user-entered or on-chain loan object ID
  borrower: string;     // wallet address
  borrowerLabel: string;
  amount: number;       // MIST
  dueEpoch: number;
  status: LoanStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function load(): LoanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LoanRecord[]) : [];
  } catch { return []; }
}

function persist(records: LoanRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function useLoanPortfolio() {
  const [loans, setLoans] = useState<LoanRecord[]>(load);

  const addLoan = useCallback((loan: Omit<LoanRecord, 'createdAt' | 'updatedAt'>) => {
    setLoans(prev => {
      if (prev.some(l => l.id === loan.id)) return prev;
      const now = new Date().toISOString();
      const next = [...prev, { ...loan, createdAt: now, updatedAt: now }];
      persist(next);
      return next;
    });
  }, []);

  const updateLoan = useCallback((id: string, patch: Partial<Pick<LoanRecord, 'status' | 'notes'>>) => {
    setLoans(prev => {
      const next = prev.map(l =>
        l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l
      );
      persist(next);
      return next;
    });
  }, []);

  const removeLoan = useCallback((id: string) => {
    setLoans(prev => {
      const next = prev.filter(l => l.id !== id);
      persist(next);
      return next;
    });
  }, []);

  // Summary stats
  const active = loans.filter(l => l.status === 'active' || l.status === 'overdue');
  const totalLent = active.reduce((sum, l) => sum + l.amount, 0);
  const totalRepaid = loans.filter(l => l.status === 'repaid').reduce((sum, l) => sum + l.amount, 0);
  const defaultCount = loans.filter(l => l.status === 'defaulted').length;
  const defaultRate = loans.length > 0 ? defaultCount / loans.length : 0;

  return { loans, addLoan, updateLoan, removeLoan, totalLent, totalRepaid, defaultCount, defaultRate };
}
