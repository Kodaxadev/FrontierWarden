import { useMemo, useState } from 'react';
import { evaluateTrust } from '../../../../lib/api';
import type { FwData } from '../fw-data';
import type { TrustEvaluateResponse } from '../../../../types/api.types';

const DEFAULT_SUBJECT = '0x9cc038e5f0045dbf75ce191870fd7c483020d12bc23f3ebaef7a6f4f22d820e1';
const DEFAULT_GATE = '0xb63c9939e28db885392e68537336f85453392ac07d4590c029d1f65938733e36';

const shortId = (value: string) =>
  value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;

const formatMist = (mist: number | null) => {
  if (mist == null) return '-';
  if (mist === 0) return '0 SUI';
  return `${(mist / 1_000_000_000).toFixed(3)} SUI`;
};

const badgeClass = (result: TrustEvaluateResponse | null) => {
  if (!result) return 'c-badge--closed';
  if (result.decision === 'ALLOW_FREE') return 'c-badge--ok';
  if (result.decision === 'ALLOW_TAXED') return 'c-badge--toll';
  return 'c-badge--crit';
};

interface Props {
  data?: FwData;
}

export function TrustConsoleView({ data }: Props) {
  const firstGate = data?.policy?.gateId ?? data?.gates[0]?.sourceId ?? DEFAULT_GATE;
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [gateId, setGateId] = useState(firstGate);
  const [schemaId, setSchemaId] = useState('TRIBE_STANDING');
  const [result, setResult] = useState<TrustEvaluateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proofRows = useMemo(() => {
    if (!result) return [];
    return [
      ['Source', result.proof.source],
      ['Checkpoint', result.proof.checkpoint?.toString() ?? '-'],
      ['Schemas', result.proof.schemas.join(', ') || '-'],
      ['Attestations', result.proof.attestationIds.map(shortId).join(', ') || '-'],
      ['Tx Digests', result.proof.txDigests.map(shortId).join(', ') || '-'],
    ];
  }, [result]);

  const runEvaluation = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await evaluateTrust({
        entity: subject.trim(),
        action: 'gate_access',
        context: { gateId: gateId.trim(), schemaId: schemaId.trim() || undefined },
      });
      setResult(next);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="c-view__title">Trust Decision Console</div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: 32,
        alignItems: 'start',
      }}>
        <section style={{
          border: '1px solid var(--c-border)',
          background: 'rgba(8,13,20,0.72)',
          padding: 26,
        }}>
          <div className="c-stat__label">Subject Wallet</div>
          <input
            className="c-input"
            value={subject}
            onChange={event => setSubject(event.target.value)}
            spellCheck={false}
          />

          <div className="c-stat__label" style={{ marginTop: 18 }}>Gate ID</div>
          <input
            className="c-input"
            value={gateId}
            onChange={event => setGateId(event.target.value)}
            spellCheck={false}
          />

          <div className="c-stat__label" style={{ marginTop: 18 }}>Schema</div>
          <input
            className="c-input"
            value={schemaId}
            onChange={event => setSchemaId(event.target.value)}
            spellCheck={false}
          />

          <button
            className="c-commit"
            style={{ width: '100%', marginTop: 24 }}
            disabled={busy || !subject.trim() || !gateId.trim()}
            onClick={runEvaluation}
          >
            {busy ? 'EVALUATING' : 'EVALUATE TRUST'}
          </button>

          {error && (
            <div style={{ marginTop: 16, color: 'var(--c-crimson)', fontSize: 11 }}>
              {error}
            </div>
          )}
        </section>

        <section style={{
          border: '1px solid var(--c-border)',
          background: 'rgba(8,13,20,0.72)',
          minHeight: 360,
          padding: 26,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span className={`c-badge ${badgeClass(result)}`}>
              {result?.decision ?? 'NO DECISION'}
            </span>
            {result && (
              <span className="c-sub">
                {result.reason} / confidence {result.confidence.toFixed(2)}
              </span>
            )}
          </div>

          {result ? (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}>
                <Metric label="Allow" value={result.allow ? 'YES' : 'NO'} />
                <Metric label="Score" value={result.score?.toString() ?? '-'} />
                <Metric label="Threshold" value={result.threshold?.toString() ?? '-'} />
                <Metric label="Toll" value={formatMist(result.tollMist)} />
              </div>

              <div style={{ color: 'var(--c-hi)', fontSize: 12, lineHeight: 1.7, marginBottom: 24 }}>
                {result.explanation}
              </div>

              <div className="c-stat__label">Proof Bundle</div>
              {proofRows.map(([label, value]) => (
                <div className="c-kv" key={label}>
                  <div className="c-kv__k">{label}</div>
                  <div className="c-kv__v">{value}</div>
                </div>
              ))}
            </>
          ) : (
            <div className="c-sub">
              Submit a pilot and gate to receive a live indexed trust decision.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="c-stat__label">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-amber)' }}>
        {value}
      </div>
    </div>
  );
}
