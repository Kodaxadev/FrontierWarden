import type { SponsoredState } from '../../../../hooks/useSponsoredTransaction';

interface SponsoredPassageStatusProps {
  state: SponsoredState;
  copied: boolean;
  successAt: string | null;
  onCopyDiagnostics: () => void;
  shortAddr: (value: string) => string;
}

export function SponsoredPassageStatus({
  state,
  copied,
  successAt,
  onCopyDiagnostics,
  shortAddr,
}: SponsoredPassageStatusProps) {
  const trace = state.trace;

  if (state.step === 'done' && state.digest) {
    return (
      <div style={{ marginTop: 12, fontSize: 10, color: 'var(--c-green)' }}>
        Last sponsored passage executed - tx {shortAddr(state.digest)}
        {trace?.executeResultKind ? ` - result ${trace.executeResultKind}` : ''}
        {successAt ? ` - ${successAt}` : ''}
      </div>
    );
  }

  if (state.step !== 'error' || !trace) return null;

  return (
    <div style={{
      marginTop: 14,
      paddingTop: 12,
      borderTop: '1px solid var(--c-border)',
      display: 'grid',
      gap: 8,
    }}>
      <div className="c-kv">
        <span className="c-kv__k">Error Class</span>
        <span className="c-kv__v" style={{ color: 'var(--c-amber)' }}>
          {trace.errorClass ?? 'unknown_wallet_failure'}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Trace ID</span>
        <span className="c-kv__v">{trace.traceId}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="c-filter" type="button" onClick={onCopyDiagnostics}>
          COPY DIAGNOSTICS
        </button>
        <span className="c-sub">
          {copied
            ? 'SANITIZED TRACE COPIED'
            : 'No tx bytes, signatures, keys, or session tokens included.'}
        </span>
      </div>
    </div>
  );
}
