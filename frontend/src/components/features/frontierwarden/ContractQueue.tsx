// ContractQueue — Right column · top panel.
// Five contracts: priority badge, kind+target, bounty, state.

import { FwPanel, ClsHeader } from './fw-atoms';
import type { FwData, FwContract } from './fw-data';

function priorityColor(p: FwContract['priority']): string {
  switch (p) {
    case 'CRIT': return 'var(--tribe-crimson)';
    case 'HIGH': return 'var(--frontier-amber)';
    case 'MED':  return 'var(--alloy-silver)';
    default:     return 'var(--t-muted)';
  }
}

function stateColor(s: string): string {
  switch (s) {
    case 'OPEN':    return 'var(--sui-cyan)';
    case 'CLAIMED': return 'var(--alloy-silver)';
    default:        return 'var(--t-muted)';
  }
}

interface ContractQueueProps { data: FwData; }

export function ContractQueue({ data }: ContractQueueProps) {
  return (
    <FwPanel style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
      <ClsHeader
        priority="HIGH"
        label="CONTRACT INTERCEPTS"
        classification="DOC-C1 · 5 OF 22"
        right={
          <span className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)' }}>
            HICK·5 MAX
          </span>
        }
      />

      {data.contracts.map((c, i) => {
        const pColor = priorityColor(c.priority);
        const sColor = stateColor(c.state);
        return (
          <div key={c.id} style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr 90px 70px',
            gap: 10, padding: '8px 12px',
            borderBottom: i < data.contracts.length - 1 ? '1px dashed var(--b-08)' : 'none',
            borderLeft: `3px solid ${pColor}`,
            background: c.priority === 'CRIT' ? 'rgba(239,68,68,0.06)' : 'transparent',
            alignItems: 'center',
            opacity: c.state === 'EXPIRED' ? 0.5 : 1,
          }}>
            {/* Priority badge */}
            <span className="fw-mono" style={{
              fontSize: 9, letterSpacing: '0.12em',
              color: pColor, textAlign: 'center',
              padding: '2px 4px',
              border: `1px solid ${pColor}50`,
              background: `${pColor}15`,
            }}>
              {c.priority}
            </span>

            {/* Kind + target */}
            <div>
              <div className="fw-mono" style={{ fontSize: 11, color: 'var(--t-primary)' }}>
                {c.kind} · <span style={{ color: 'var(--frontier-amber)' }}>{c.target}</span>
              </div>
              <div className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)' }}>
                {c.id} · age {c.age}
              </div>
            </div>

            {/* Bounty */}
            <span className="fw-mono" style={{
              fontSize: 12, textAlign: 'right', color: 'var(--alloy-gold)',
              textShadow: '0 0 8px rgba(251,191,36,0.3)',
            }}>
              {c.bounty}
            </span>

            {/* State */}
            <span className="fw-mono" style={{
              fontSize: 9, letterSpacing: '0.12em', textAlign: 'right', color: sColor,
            }}>
              {c.state}
            </span>
          </div>
        );
      })}
    </FwPanel>
  );
}
