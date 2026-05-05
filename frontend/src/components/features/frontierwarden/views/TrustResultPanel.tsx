import { useMemo } from 'react';
import type { TrustEvaluateResponse } from '../../../../types/api.types';
import { badgeClass, formatMist, shortId } from './trust-console-format';
import { TrustWarnings } from './TrustWarnings';

interface TrustResultPanelProps {
  result: TrustEvaluateResponse | null;
  copied: boolean;
  onCopyJson: () => void;
}

export function TrustResultPanel({
  result,
  copied,
  onCopyJson,
}: TrustResultPanelProps) {
  const proofRows = useMemo(() => {
    if (!result) return [];
    return [
      ['Indexed Source', result.proof?.source ?? '-'],
      ['Proof Checkpoint', result.proof?.checkpoint?.toString() ?? '-'],
      ['Schema Evidence', result.proof?.schemas?.join(', ') || '-'],
      ['Attestation Objects', result.proof?.attestationIds?.map(shortId).join(', ') || '-'],
      ['Source Transactions', result.proof?.txDigests?.map(shortId).join(', ') || '-'],
    ];
  }, [result]);

  const warnings = result?.proof?.warnings ?? [];

  return (
    <section style={{
      border: '1px solid var(--c-border)',
      background: 'rgba(8,13,20,0.72)',
      minHeight: 360,
      padding: 26,
    }}>
      {result ? (
        <>
          <div style={{ marginBottom: 24 }}>
            <div className="c-stat__label" style={{ marginBottom: 8 }}>Live Proof Decision</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span className={`c-badge ${badgeClass(result)}`} style={{ fontSize: 11, padding: '5px 12px' }}>
                {result.decision}
              </span>
              <span className="c-sub">
                API {result.apiVersion}
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 16,
            }}>
              <div>
                <div className="c-stat__label">Allow</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: result.allow ? 'var(--c-green)' : 'var(--c-crimson)' }}>
                  {result.allow ? 'YES' : 'NO'}
                </div>
              </div>
              <div>
                <div className="c-stat__label">Confidence</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-amber)' }}>
                  {result.confidence.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="c-stat__label">Reason</div>
                <div style={{ fontSize: 11, color: 'var(--c-hi)', fontFamily: 'var(--c-mono)', marginTop: 4 }}>
                  {result.reason}
                </div>
              </div>
            </div>
          </div>

          <div style={{ color: 'var(--c-hi)', fontSize: 12, lineHeight: 1.7, marginBottom: 24, padding: '12px 16px', border: '1px solid var(--c-border)', background: 'rgba(8,13,20,0.5)' }}>
            {result.explanation}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}>
            <Metric label="Score" value={result.score?.toString() ?? '-'} />
            <Metric label="Threshold" value={result.threshold?.toString() ?? '-'} />
            {result.action === 'gate_access' && (
              <Metric label="Toll" value={formatMist(result.tollMist ?? null)} />
            )}
          </div>

          <TrustWarnings warnings={warnings} />

          <div className="c-stat__label" style={{ marginBottom: 12 }}>Proof Bundle</div>
          {proofRows.map(([label, value]) => (
            <div className="c-kv" key={label}>
              <div className="c-kv__k">{label}</div>
              <div className="c-kv__v">{value}</div>
            </div>
          ))}

          <details style={{ marginTop: 24 }}>
            <summary className="c-sub" style={{ cursor: 'pointer', userSelect: 'none' }}>
              Show raw JSON
            </summary>
            <div style={{ position: 'relative', marginTop: 8 }}>
              <button
                className="c-filter"
                style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, padding: '3px 8px' }}
                onClick={onCopyJson}
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <pre style={{
                fontSize: 10,
                fontFamily: 'var(--c-mono)',
                color: 'var(--c-mid)',
                overflow: 'auto',
                maxHeight: 400,
                padding: 16,
                border: '1px solid var(--c-border)',
                background: 'rgba(5,10,15,0.8)',
                margin: 0,
              }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </details>
        </>
      ) : (
        <div style={{ marginTop: 40 }}>
          <div className="c-stat__label" style={{ marginBottom: 10 }}>Awaiting Evaluation</div>
          <div className="c-sub" style={{ lineHeight: 1.7 }}>
            Choose a demo preset or enter a subject wallet and policy context to receive a live indexed trust decision.
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="c-stat__label">{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-amber)' }}>
        {value}
      </div>
    </div>
  );
}
