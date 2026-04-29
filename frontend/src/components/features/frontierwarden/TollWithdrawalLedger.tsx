import type { TollWithdrawalRow } from '../../../types/api.types';

interface Props {
  error: string | null;
  rows: TollWithdrawalRow[];
}

const formatSui = (mist: number) =>
  mist === 0 ? '0 SUI' : `${(mist / 1_000_000_000).toFixed(3)} SUI`;

const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

export function TollWithdrawalLedger({ error, rows }: Props) {
  return (
    <div style={{
      maxWidth: 900,
      marginTop: 24,
      border: '1px solid var(--c-border)',
      background: 'rgba(255,255,255,0.018)',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)' }}>
        <div className="c-stat__label">Toll Withdrawal Ledger</div>
      </div>
      {error ? (
        <div className="c-sub" style={{ padding: 20, color: 'var(--c-crimson)' }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="c-sub" style={{ padding: 20 }}>
          No indexed withdrawals for this gate yet.
        </div>
      ) : rows.map(row => (
        <div key={`${row.tx_digest}:${row.event_seq}`} className="c-kv" style={{ padding: '10px 20px' }}>
          <span className="c-kv__k">{formatSui(row.amount_mist)}</span>
          <span className="c-kv__v">
            {shortId(row.owner)} · tx {shortId(row.tx_digest)}
          </span>
        </div>
      ))}
    </div>
  );
}
