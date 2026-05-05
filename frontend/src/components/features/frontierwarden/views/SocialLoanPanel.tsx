import { SocialStatusLine } from './SocialStatusLine';

interface ActionState {
  step: string;
  digest: string | null;
  error: string | null;
}

interface SocialLoanPanelProps {
  accountConnected: boolean;
  busy: boolean;
  loanId: string;
  repaymentMist: number;
  markLoanId: string;
  lendState: ActionState;
  setLoanId: (value: string) => void;
  setRepaymentMist: (value: number) => void;
  setMarkLoanId: (value: string) => void;
  onRepayLoan: () => void;
  onMarkDefault: () => void;
  onReset: () => void;
}

export function SocialLoanPanel({
  accountConnected,
  busy,
  loanId,
  repaymentMist,
  markLoanId,
  lendState,
  setLoanId,
  setRepaymentMist,
  setMarkLoanId,
  onRepayLoan,
  onMarkDefault,
  onReset,
}: SocialLoanPanelProps) {
  return (
    <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)' }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>Loan Management</div>
      <div className="c-sub" style={{ marginBottom: 12 }}>Repay an active loan or mark an overdue loan as defaulted. Loan issuance requires a multi-party flow (lender + borrower vouch).</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
        <label>
          <div className="c-policy__label">Loan Object ID</div>
          <input className="c-input" placeholder="0x..." value={loanId} onChange={e => setLoanId(e.target.value)} />
        </label>
        <label>
          <div className="c-policy__label">Repayment (MIST)</div>
          <input className="c-input" type="number" min={1} value={repaymentMist} onChange={e => setRepaymentMist(Number(e.target.value))} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="c-commit" disabled={!accountConnected || busy || !loanId || repaymentMist <= 0}
          onClick={onRepayLoan}>
          {lendState.step === 'signing' ? 'SIGNING...' : 'REPAY LOAN'}
        </button>
        <SocialStatusLine {...lendState} />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ flex: 1 }}>
          <div className="c-policy__label">Loan Object ID (mark defaulted)</div>
          <input className="c-input" placeholder="0x..." value={markLoanId} onChange={e => setMarkLoanId(e.target.value)} />
        </label>
        <button className="c-commit" disabled={!accountConnected || busy || !markLoanId}
          onClick={onMarkDefault}>
          {lendState.step === 'signing' ? 'SIGNING...' : 'MARK DEFAULT'}
        </button>
      </div>
      {lendState.step !== 'idle' && <button className="c-tab" style={{ marginTop: 10 }} onClick={onReset}>CLEAR</button>}
    </div>
  );
}
