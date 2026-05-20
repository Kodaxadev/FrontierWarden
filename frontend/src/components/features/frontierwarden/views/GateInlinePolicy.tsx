// GateInlinePolicy — P0 fix: inline policy controls accessible from gate context.
// Shows current policy + quick-adjust threshold/toll without navigating to Settings.
// Does NOT duplicate the full PolicyView — just the read + quick-edit surface.

import type { FwPolicy, FwGate } from '../fw-data';
import { formatLux } from '../../../../lib/format';

interface Props {
  gate: FwGate;
  policy: FwPolicy | undefined;
  onNavigatePolicy: () => void;
}

function shortId(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function GateInlinePolicy({ gate, policy, onNavigatePolicy }: Props) {
  const hasPolicyForGate = policy && policy.gateId === gate.sourceId;

  return (
    <section style={{
      marginTop: 24,
      padding: 16,
      border: '1px solid var(--c-border)',
      background: 'rgba(232,120,42,0.02)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div className="c-stat__label">Policy Context</div>
        <button
          onClick={onNavigatePolicy}
          style={{
            all: 'unset', cursor: 'pointer',
            fontSize: 10, color: 'var(--c-amber)',
            letterSpacing: '0.06em',
          }}
        >
          OPEN FULL EDITOR →
        </button>
      </div>

      {hasPolicyForGate ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
        }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.08em', marginBottom: 4 }}>
              STANDING THRESHOLD
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-hi)' }}>
              {policy.allyThreshold}
            </div>
            <div style={{ fontSize: 10, color: 'var(--c-mid)', marginTop: 2 }}>
              Pilots below this score are denied passage
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.08em', marginBottom: 4 }}>
              BASE TOLL
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-hi)' }}>
              {policy.baseTollMist === 0 ? 'FREE' : formatLux(policy.baseTollMist)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--c-mid)', marginTop: 2 }}>
              Charged to pilots who pass the threshold
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.08em', marginBottom: 4 }}>
              POLICY SOURCE
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-mid)' }}>
              {shortId(policy.gateId)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--c-mid)', marginTop: 2 }}>
              Checkpoint {policy.checkpoint}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--c-mid)', lineHeight: 1.6 }}>
          {policy ? (
            <>
              Active policy is for gate <strong>{shortId(policy.gateId)}</strong>,
              not this gate ({shortId(gate.sourceId ?? gate.id)}).
              Open the full editor to switch or create a policy for this gate.
            </>
          ) : (
            'No policy indexed. Open the full editor to provision a GatePolicy.'
          )}
        </div>
      )}
    </section>
  );
}
