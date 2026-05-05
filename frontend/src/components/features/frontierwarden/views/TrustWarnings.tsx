import { humanReadableWarning } from './trust-console-format';

interface TrustWarningsProps {
  warnings: string[];
}

export function TrustWarnings({ warnings }: TrustWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <>
      <div style={{
        marginBottom: 24,
        padding: '12px 16px',
        border: warnings.some(w => humanReadableWarning(w).critical)
          ? '1px solid rgba(239,68,68,0.3)'
          : '1px solid rgba(245,158,11,0.3)',
        background: warnings.some(w => humanReadableWarning(w).critical)
          ? 'rgba(239,68,68,0.04)'
          : 'rgba(245,158,11,0.04)',
      }}>
        <div className="c-stat__label" style={{
          color: warnings.some(w => humanReadableWarning(w).critical) ? 'var(--c-crimson)' : 'var(--c-amber)',
          marginBottom: 8,
        }}>
          PROOF FRESHNESS WARNINGS
        </div>
        {warnings.map((w, i) => {
          const { label, critical } = humanReadableWarning(w);
          return (
            <div key={i} style={{
              fontSize: 10,
              fontFamily: 'var(--c-mono)',
              color: critical ? 'var(--c-crimson)' : 'var(--c-amber)',
              lineHeight: 1.8,
              fontWeight: critical ? 700 : 400,
            }}>
              &gt; {label}
            </div>
          );
        })}
      </div>
      <div style={{
        marginBottom: 24,
        padding: '10px 14px',
        border: '1px solid var(--c-border)',
        background: 'rgba(8,13,20,0.5)',
        borderRadius: 4,
        fontSize: 11,
        color: 'var(--c-mid)',
        lineHeight: 1.6,
      }}>
        Decision is based on the latest indexed FrontierWarden protocol event. No newer protocol events have been observed yet.
      </div>
    </>
  );
}
