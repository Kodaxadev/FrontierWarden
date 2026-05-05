import type { TrustAction } from '../../../../types/api.types';
import type { Preset } from './trust-console-types';
import { PRESETS } from './trust-console-types';

interface TrustInputPanelProps {
  action: TrustAction;
  subject: string;
  gateId: string;
  schemaId: string;
  minimumScore: number;
  busy: boolean;
  evalError: string | null;
  setAction: (action: TrustAction) => void;
  setSubject: (subject: string) => void;
  setGateId: (gateId: string) => void;
  setSchemaId: (schemaId: string) => void;
  setMinimumScore: (score: number) => void;
  onEvaluate: () => void;
}

export function TrustInputPanel({
  action,
  subject,
  gateId,
  schemaId,
  minimumScore,
  busy,
  evalError,
  setAction,
  setSubject,
  setGateId,
  setSchemaId,
  setMinimumScore,
  onEvaluate,
}: TrustInputPanelProps) {
  return (
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
          <option value="gate_access">Gate Access â€” gate_access</option>
          <option value="counterparty_risk">Counterparty Risk â€” counterparty_risk</option>
          <option value="bounty_trust">Bounty Trust â€” bounty_trust</option>
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

        {(action === 'counterparty_risk' || action === 'bounty_trust') && (
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
          onClick={onEvaluate}
        >
          {busy ? 'EVALUATING' : 'EVALUATE TRUST'}
        </button>

        {evalError && (
          <div style={{ marginTop: 16, color: 'var(--c-crimson)', fontSize: 11 }}>
            {evalError}
          </div>
        )}
    </section>
  );
}

export function TrustPresetStrip({ onApplyPreset }: { onApplyPreset: (preset: Preset) => void }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="c-stat__label" style={{ marginBottom: 8 }}>Demo Presets</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="c-filter"
            onClick={() => onApplyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="c-sub" style={{ marginTop: 6 }}>
        Demo presets use local/testnet fixture addresses.
      </div>
    </div>
  );
}
