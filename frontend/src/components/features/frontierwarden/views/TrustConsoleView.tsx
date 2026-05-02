import { useEffect, useMemo, useState } from 'react';
import { evaluateTrust, fetchEveIdentity } from '../../../../lib/api';
import type { FwData } from '../fw-data';
import type { TrustEvaluateResponse, TrustAction } from '../../../../types/api.types';
import type { EveIdentity } from '../../../../types/api.types';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import { useProfileCreate } from '../../../../hooks/useProfileCreate';

const DEFAULT_SUBJECT = '0x9cc038e5f0045dbf75ce191870fd7c483020d12bc23f3ebaef7a6f4f22d820e1';
const DEFAULT_GATE = '0xb63c9939e28db885392e68537336f85453392ac07d4590c029d1f65938733e36';

const shortId = (value: string) =>
  value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;

const ACTION_LABELS: Record<TrustAction, string> = {
  gate_access: 'Gate Access',
  counterparty_risk: 'Counterparty Risk',
};

function humanReadableWarning(raw: string): { label: string; critical: boolean } {
  if (raw.startsWith('ATTESTATION_UNDER_CHALLENGE:')) {
    return { label: `Attestation is under fraud challenge: ${raw.split(':')[1]}`, critical: true };
  }
  if (raw.startsWith('ATTESTATION_REVOKED')) {
    return { label: 'Attestation has been revoked', critical: true };
  }
  if (raw.startsWith('INDEXER_LAST_EVENT_STALE_SECONDS:')) {
    const secs = raw.split(':')[1];
    return { label: `Indexer has not seen a new event for ${secs} seconds`, critical: false };
  }
  if (raw.startsWith('PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:')) {
    const delta = raw.split(':')[1];
    return { label: `Proof checkpoint is behind latest indexed checkpoint (delta: ${Number(delta).toLocaleString()})`, critical: false };
  }
  if (raw === 'PROOF_CHECKPOINT_UNKNOWN') {
    return { label: 'Proof checkpoint could not be determined', critical: false };
  }
  if (raw === 'INDEXER_CHECKPOINT_UNKNOWN') {
    return { label: 'Indexer checkpoint could not be determined', critical: false };
  }
  return { label: raw, critical: false };
}

const formatMist = (mist: number | null | undefined) => {
  if (mist == null) return '-';
  if (mist === 0) return '0 SUI';
  return `${(mist / 1_000_000_000).toFixed(3)} SUI`;
};

const badgeClass = (result: TrustEvaluateResponse | null) => {
  if (!result) return 'c-badge--closed';
  switch (result.decision) {
    case 'ALLOW_FREE':
    case 'ALLOW':
      return 'c-badge--ok';
    case 'ALLOW_TAXED':
      return 'c-badge--toll';
    case 'DENY':
      return 'c-badge--crit';
    case 'INSUFFICIENT_DATA':
      return 'c-badge--closed';
    default:
      return 'c-badge--closed';
  }
};

interface Preset {
  label: string;
  action: TrustAction;
  subject: string;
  gateId?: string;
  schemaId: string;
  minimumScore?: number;
}

const PRESETS: Preset[] = [
  {
    label: 'Fixture: Gate Ally Pass',
    action: 'gate_access',
    subject: DEFAULT_SUBJECT,
    gateId: DEFAULT_GATE,
    schemaId: 'TRIBE_STANDING',
  },
  {
    label: 'Fixture: Gate No Standing',
    action: 'gate_access',
    subject: '0x0000000000000000000000000000000000000000000000000000000000000000',
    gateId: DEFAULT_GATE,
    schemaId: 'TRIBE_STANDING',
  },
  {
    label: 'Fixture: Counterparty Risk',
    action: 'counterparty_risk',
    subject: DEFAULT_SUBJECT,
    schemaId: 'TRIBE_STANDING',
    minimumScore: 500,
  },
];

interface Props {
  data?: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
}

export function TrustConsoleView({ data, live = false, loading = false, error = null }: Props) {
  const { account } = useProfileCreate();
  const firstGate = data?.policy?.gateId ?? data?.gates[0]?.sourceId ?? DEFAULT_GATE;
  const [action, setAction] = useState<TrustAction>('gate_access');
  const [subject, setSubject] = useState(() => account?.address ?? DEFAULT_SUBJECT);
  const [gateId, setGateId] = useState(firstGate);
  const [schemaId, setSchemaId] = useState('TRIBE_STANDING');
  const [minimumScore, setMinimumScore] = useState(500);
  const [result, setResult] = useState<TrustEvaluateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [eveIdentity, setEveIdentity] = useState<EveIdentity | null>(null);
  const [eveIdentityLoading, setEveIdentityLoading] = useState(false);

  // Resolve EVE identity for the subject address
  useEffect(() => {
    const addr = subject.trim();
    if (!addr || addr.length < 64) { setEveIdentity(null); setEveIdentityLoading(false); return; }
    setEveIdentityLoading(true);
    fetchEveIdentity(addr)
      .then(setEveIdentity)
      .catch(() => setEveIdentity(null))
      .finally(() => setEveIdentityLoading(false));
  }, [subject]);

  const proofRows = useMemo(() => {
    if (!result) return [];
    return [
      ['Source', result.proof?.source ?? '-'],
      ['Checkpoint', result.proof?.checkpoint?.toString() ?? '-'],
      ['Schemas', result.proof?.schemas?.join(', ') || '-'],
      ['Attestations', result.proof?.attestationIds?.map(shortId).join(', ') || '-'],
      ['Tx Digests', result.proof?.txDigests?.map(shortId).join(', ') || '-'],
    ];
  }, [result]);

  const warnings = result?.proof?.warnings ?? [];
  const hasWarnings = warnings.length > 0;

  const runEvaluation = async () => {
    setBusy(true);
    setEvalError(null);
    try {
      const next = await evaluateTrust({
        entity: subject.trim(),
        action,
        context: {
          gateId: action === 'gate_access' ? gateId.trim() : undefined,
          schemaId: schemaId.trim() || undefined,
          minimumScore: action === 'counterparty_risk' ? minimumScore : undefined,
        },
      });
      setResult(next);
    } catch (err) {
      setResult(null);
      setEvalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    setAction(preset.action);
    setSubject(preset.subject);
    if (preset.gateId) setGateId(preset.gateId);
    setSchemaId(preset.schemaId);
    if (preset.minimumScore != null) setMinimumScore(preset.minimumScore);
    setResult(null);
    setEvalError(null);
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available
    }
  };

  return (
    <>
      <div className="c-view__title">Trust Decision Console</div>
      <div className="c-sub" style={{ marginTop: -16, marginBottom: 24 }}>
        Evaluate gate access or counterparty risk from indexed Sui testnet proof.
      </div>
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        liveText="Trust API connected"
        emptyText="Trust API unavailable"
      />

      {/* EVE Identity Strip */}
      {(eveIdentityLoading || eveIdentity?.identity_status === 'resolved') && (
        <div style={{ marginBottom: 24, padding: '14px 18px', border: '1px solid rgba(0,210,255,0.3)', background: 'rgba(0,210,255,0.08)', borderRadius: 4, fontSize: 12 }}>
          <div className="c-stat__label" style={{ marginBottom: 8, color: 'var(--c-hi)' }}>EVE Identity</div>
          {eveIdentityLoading && <div className="c-sub">Resolving…</div>}
          {!eveIdentityLoading && eveIdentity && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'monospace' }}>
              {eveIdentity.character_name && <span><span className="c-policy__label">Character:</span> <strong style={{ color: 'var(--c-hi)' }}>{eveIdentity.character_name}</strong></span>}
              {eveIdentity.tenant && <span><span className="c-policy__label">Tenant:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tenant}</span></span>}
              {eveIdentity.tribe_id && <span><span className="c-policy__label">Tribe:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id}</span></span>}
              {eveIdentity.character_id && <span><span className="c-policy__label">Char ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.character_id)}</span></span>}
            </div>
          )}
        </div>
      )}

      {/* Presets */}
      <div style={{ marginBottom: 24 }}>
        <div className="c-stat__label" style={{ marginBottom: 8 }}>Demo Presets</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="c-filter"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="c-sub" style={{ marginTop: 6 }}>
          Demo presets use local/testnet fixture addresses.
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: 32,
        alignItems: 'start',
      }}>
        {/* Input Panel */}
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

          <div className="c-stat__label" style={{ marginTop: 18 }}>Action</div>
          <select
            className="c-input"
            value={action}
            onChange={event => setAction(event.target.value as TrustAction)}
            style={{ display: 'block', width: '100%', cursor: 'pointer' }}
          >
            <option value="gate_access">Gate Access — gate_access</option>
            <option value="counterparty_risk">Counterparty Risk — counterparty_risk</option>
          </select>

          {action === 'gate_access' && (
            <>
              <div className="c-stat__label" style={{ marginTop: 18 }}>Gate ID</div>
              <input
                className="c-input"
                value={gateId}
                onChange={event => setGateId(event.target.value)}
                spellCheck={false}
              />
            </>
          )}

          {action === 'counterparty_risk' && (
            <>
              <div className="c-stat__label" style={{ marginTop: 18 }}>Minimum Score</div>
              <input
                className="c-input"
                type="number"
                value={minimumScore}
                onChange={event => setMinimumScore(parseInt(event.target.value, 10) || 0)}
              />
            </>
          )}

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
            disabled={busy || !subject.trim() || (action === 'gate_access' && !gateId.trim())}
            onClick={runEvaluation}
          >
            {busy ? 'EVALUATING' : 'EVALUATE TRUST'}
          </button>

          {evalError && (
            <div style={{ marginTop: 16, color: 'var(--c-crimson)', fontSize: 11 }}>
              {evalError}
            </div>
          )}
        </section>

        {/* Result Panel */}
        <section style={{
          border: '1px solid var(--c-border)',
          background: 'rgba(8,13,20,0.72)',
          minHeight: 360,
          padding: 26,
        }}>
          {result ? (
            <>
              {/* Decision Header */}
              <div style={{ marginBottom: 24 }}>
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

              {/* Explanation */}
              <div style={{ color: 'var(--c-hi)', fontSize: 12, lineHeight: 1.7, marginBottom: 24, padding: '12px 16px', border: '1px solid var(--c-border)', background: 'rgba(8,13,20,0.5)' }}>
                {result.explanation}
              </div>

              {/* EVE Character Identity */}
              {eveIdentity?.identity_status === 'resolved' && (
                <div style={{ marginBottom: 24, padding: '14px 18px', border: '1px solid rgba(0,210,255,0.25)', background: 'rgba(0,210,255,0.06)', borderRadius: 4 }}>
                  <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-hi)' }}>EVE Character Identity</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontFamily: 'monospace', fontSize: 12 }}>
                    {eveIdentity.character_name && (
                      <div><span className="c-policy__label">Character:</span> <strong style={{ color: 'var(--c-hi)' }}>{eveIdentity.character_name}</strong></div>
                    )}
                    {eveIdentity.tenant && (
                      <div><span className="c-policy__label">Tenant:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tenant}</span></div>
                    )}
                    {eveIdentity.tribe_id && (
                      <div><span className="c-policy__label">Tribe:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id}</span></div>
                    )}
                    {eveIdentity.character_id && (
                      <div><span className="c-policy__label">Char ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.character_id)}</span></div>
                    )}
                    {eveIdentity.item_id && (
                      <div><span className="c-policy__label">Item ID:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.item_id}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Score / Threshold */}
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

              {/* Warning Banner */}
              {hasWarnings && (
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
                      INDEXER / PROOF WARNINGS
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
                          ▸ {label}
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
              )}

              {/* Proof Bundle */}
              <div className="c-stat__label" style={{ marginBottom: 12 }}>Proof Bundle</div>
              {proofRows.map(([label, value]) => (
                <div className="c-kv" key={label}>
                  <div className="c-kv__k">{label}</div>
                  <div className="c-kv__v">{value}</div>
                </div>
              ))}

              {/* Raw JSON Toggle */}
              <details style={{ marginTop: 24 }}>
                <summary className="c-sub" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Show raw JSON
                </summary>
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <button
                    className="c-filter"
                    style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, padding: '3px 8px' }}
                    onClick={copyJson}
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
            <div className="c-sub" style={{ marginTop: 40 }}>
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
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-amber)' }}>
        {value}
      </div>
    </div>
  );
}
