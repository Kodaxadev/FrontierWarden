// LoanPortfolioView — P0 creditor tool: active loan tracking dashboard.
// Client-side loan book. Creditors log loans and track repayment / default status.
// Future: auto-populated from on-chain loan events when indexer supports it.

import { useState } from 'react';
import type { LoanRecord, LoanStatus } from '../../../../hooks/useLoanPortfolio';

interface Props {
  loans: LoanRecord[];
  totalLent: number;
  totalRepaid: number;
  defaultCount: number;
  defaultRate: number;
  onAddLoan: (loan: Omit<LoanRecord, 'createdAt' | 'updatedAt'>) => void;
  onUpdateLoan: (id: string, patch: { status?: LoanStatus; notes?: string }) => void;
  onRemoveLoan: (id: string) => void;
}

function formatMist(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} SUI`;
  return `${value.toLocaleString()} MIST`;
}

function shortAddr(v: string): string {
  if (v.length <= 14) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

const STATUS_BADGE: Record<LoanStatus, string> = {
  active: 'c-badge--ok',
  repaid: 'c-badge--claimed',
  defaulted: 'c-badge--expired',
  overdue: 'c-badge--toll',
};

export function LoanPortfolioView({
  loans, totalLent, totalRepaid, defaultCount, defaultRate,
  onAddLoan, onUpdateLoan, onRemoveLoan,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formId, setFormId] = useState('');
  const [formBorrower, setFormBorrower] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formAmount, setFormAmount] = useState(1_000_000_000);
  const [formDueEpoch, setFormDueEpoch] = useState(0);
  const [formNotes, setFormNotes] = useState('');

  function submitLoan() {
    if (!formId.trim() || !formBorrower.trim()) return;
    onAddLoan({
      id: formId.trim(),
      borrower: formBorrower.trim(),
      borrowerLabel: formLabel.trim() || shortAddr(formBorrower.trim()),
      amount: formAmount,
      dueEpoch: formDueEpoch,
      status: 'active',
      notes: formNotes,
    });
    setShowForm(false);
    setFormId(''); setFormBorrower(''); setFormLabel(''); setFormNotes('');
    setFormAmount(1_000_000_000); setFormDueEpoch(0);
  }

  const active = loans.filter(l => l.status === 'active' || l.status === 'overdue');
  const closed = loans.filter(l => l.status === 'repaid' || l.status === 'defaulted');

  return (
    <>
      <div className="c-view__title">Loan Portfolio</div>
      <div className="c-sub" style={{ marginBottom: 16 }}>
        Track loans you've issued. Log entries manually — on-chain loan indexing will auto-populate this in a future update.
      </div>

      {/* Exposure summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 1, marginBottom: 24,
        border: '1px solid var(--c-border)', background: 'var(--c-border)',
      }}>
        {[
          { k: 'Active Exposure', v: formatMist(totalLent) },
          { k: 'Total Repaid', v: formatMist(totalRepaid) },
          { k: 'Defaults', v: defaultCount.toString() },
          { k: 'Default Rate', v: `${(defaultRate * 100).toFixed(1)}%` },
          { k: 'Active Loans', v: active.length.toString() },
          { k: 'Closed Loans', v: closed.length.toString() },
        ].map(s => (
          <div key={s.k} style={{ background: 'var(--c-surface)', padding: '14px 16px' }}>
            <div className="c-stat__label">{s.k}</div>
            <div style={{
              fontSize: 20, fontWeight: 700,
              color: s.k === 'Defaults' && defaultCount > 0 ? 'var(--c-crimson)' : 'var(--c-hi)',
              letterSpacing: '-0.02em', marginTop: 4,
            }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Add loan button */}
      <div style={{ marginBottom: 20 }}>
        <button className="c-commit" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'CANCEL' : '+ LOG NEW LOAN'}
        </button>
      </div>

      {/* New loan form */}
      {showForm && (
        <div style={{
          border: '1px solid var(--c-border)', padding: 18, marginBottom: 24,
          background: 'rgba(232,120,42,0.02)',
        }}>
          <div className="c-stat__label" style={{ marginBottom: 12 }}>Log a New Loan</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <label>
              <div className="c-policy__label">Loan Object ID</div>
              <input className="c-input" placeholder="0x..." value={formId} onChange={e => setFormId(e.target.value)} />
            </label>
            <label>
              <div className="c-policy__label">Borrower Address</div>
              <input className="c-input" placeholder="0x..." value={formBorrower} onChange={e => setFormBorrower(e.target.value)} />
            </label>
            <label>
              <div className="c-policy__label">Borrower Label</div>
              <input className="c-input" placeholder="Name or handle" value={formLabel} onChange={e => setFormLabel(e.target.value)} />
            </label>
            <label>
              <div className="c-policy__label">Amount (MIST)</div>
              <input className="c-input" type="number" min={1} value={formAmount} onChange={e => setFormAmount(Number(e.target.value))} />
            </label>
            <label>
              <div className="c-policy__label">Due Epoch</div>
              <input className="c-input" type="number" min={0} value={formDueEpoch} onChange={e => setFormDueEpoch(Number(e.target.value))} />
            </label>
            <label>
              <div className="c-policy__label">Notes</div>
              <input className="c-input" placeholder="Optional notes" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </label>
          </div>
          <button className="c-commit" style={{ marginTop: 14 }} disabled={!formId.trim() || !formBorrower.trim()} onClick={submitLoan}>
            LOG LOAN
          </button>
        </div>
      )}

      {/* Active loans */}
      {active.length > 0 && (
        <>
          <div className="c-stat__label" style={{ marginBottom: 10 }}>Active Loans</div>
          <LoanTable loans={active} onUpdate={onUpdateLoan} onRemove={onRemoveLoan} />
        </>
      )}

      {/* Closed loans */}
      {closed.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary className="c-stat__label" style={{ cursor: 'pointer', marginBottom: 10 }}>
            Closed Loans ({closed.length})
          </summary>
          <LoanTable loans={closed} onUpdate={onUpdateLoan} onRemove={onRemoveLoan} />
        </details>
      )}

      {loans.length === 0 && !showForm && (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 11, color: 'var(--c-mid)' }}>
          No loans logged yet. Click "LOG NEW LOAN" to start tracking your portfolio.
        </div>
      )}
    </>
  );
}

function LoanTable({ loans, onUpdate, onRemove }: {
  loans: LoanRecord[];
  onUpdate: (id: string, patch: { status?: LoanStatus; notes?: string }) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <table className="c-table">
      <thead>
        <tr>
          <th>Borrower</th>
          <th>Loan ID</th>
          <th>Amount</th>
          <th>Due Epoch</th>
          <th>Status</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {loans.map(loan => (
          <tr key={loan.id}>
            <td>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-hi)' }}>{loan.borrowerLabel}</div>
              <div className="c-sub" style={{ fontFamily: 'var(--c-mono)' }}>{shortAddr(loan.borrower)}</div>
              {loan.notes && <div className="c-sub" style={{ fontStyle: 'italic', marginTop: 2 }}>{loan.notes}</div>}
            </td>
            <td style={{ fontSize: 10, fontFamily: 'var(--c-mono)', color: 'var(--c-mid)' }}>
              {shortAddr(loan.id)}
            </td>
            <td style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-amber)' }}>
              {formatMist(loan.amount)}
            </td>
            <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>
              {loan.dueEpoch || '—'}
            </td>
            <td>
              <span className={`c-badge ${STATUS_BADGE[loan.status]}`}>
                {loan.status.toUpperCase()}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {loan.status === 'active' && (
                  <>
                    <button className="c-context-cell__action--link" onClick={() => onUpdate(loan.id, { status: 'repaid' })}>
                      MARK REPAID
                    </button>
                    <button className="c-context-cell__action--link" style={{ color: 'var(--c-crimson)' }} onClick={() => onUpdate(loan.id, { status: 'defaulted' })}>
                      MARK DEFAULT
                    </button>
                    <button className="c-context-cell__action--link" onClick={() => onUpdate(loan.id, { status: 'overdue' })}>
                      OVERDUE
                    </button>
                  </>
                )}
                {loan.status === 'overdue' && (
                  <>
                    <button className="c-context-cell__action--link" onClick={() => onUpdate(loan.id, { status: 'repaid' })}>
                      MARK REPAID
                    </button>
                    <button className="c-context-cell__action--link" style={{ color: 'var(--c-crimson)' }} onClick={() => onUpdate(loan.id, { status: 'defaulted' })}>
                      MARK DEFAULT
                    </button>
                  </>
                )}
                <button className="c-context-cell__action--link" style={{ color: 'var(--c-mid)' }} onClick={() => onRemove(loan.id)}>
                  DELETE
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
