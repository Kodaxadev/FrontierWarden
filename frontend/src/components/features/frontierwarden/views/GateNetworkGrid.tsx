// GateNetworkGrid — P0 fix: multi-gate overview for tribe network operators.
// Compact card grid showing all gates at a glance with status, binding, traffic, threat.
// Clicking a card selects that gate in the parent GateIntelView.

import type { FwGate, FwData } from '../fw-data';
import { GateBindingStatusBadge } from './GateBindingStatusBadge';

interface Props {
  data: FwData;
  selectedGateId: string | null;
  onSelectGate: (gateId: string) => void;
}

const STATUS_COLOR: Record<FwGate['status'], string> = {
  open: 'var(--c-green, #5ee28a)',
  camped: 'var(--c-crimson, #ff5568)',
  toll: 'var(--c-amber, #E8782A)',
  closed: 'var(--c-mid)',
};

function threatBrief(gate: FwGate): string | null {
  if (gate.threat) return gate.threat;
  if (gate.status === 'camped') return 'HOSTILE PRESENCE';
  if (gate.status === 'closed') return 'LOCKDOWN';
  return null;
}

export function GateNetworkGrid({ data, selectedGateId, onSelectGate }: Props) {
  const gates = data.gates;
  const totalTraffic = gates.reduce((sum, g) => sum + g.traffic, 0);
  const campedCount = gates.filter(g => g.status === 'camped').length;
  const unboundCount = gates.filter(g => !g.binding || g.binding.bindingStatus === 'unbound').length;

  return (
    <section style={{ marginBottom: 24 }}>
      {/* Network summary strip */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 16, padding: '10px 0',
        borderBottom: '1px solid var(--c-border)',
        fontSize: 11, color: 'var(--c-mid)', letterSpacing: '0.06em',
      }}>
        <span><strong style={{ color: 'var(--c-hi)', fontSize: 16 }}>{gates.length}</strong> GATES</span>
        <span><strong style={{ color: 'var(--c-hi)', fontSize: 16 }}>{totalTraffic}</strong> TRAFFIC/H</span>
        {campedCount > 0 && (
          <span><strong style={{ color: 'var(--c-crimson)', fontSize: 16 }}>{campedCount}</strong> CAMPED</span>
        )}
        {unboundCount > 0 && (
          <span><strong style={{ color: 'var(--c-amber)', fontSize: 16 }}>{unboundCount}</strong> UNBOUND</span>
        )}
      </div>

      {gates.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 11, color: 'var(--c-mid)' }}>
          No gates indexed. Connect wallet and check policy authority.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 10,
        }}>
          {gates.map(gate => {
            const isSelected = gate.id === selectedGateId;
            const threat = threatBrief(gate);
            return (
              <button
                key={gate.id}
                onClick={() => onSelectGate(gate.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'block',
                  padding: '12px 14px',
                  border: `1px solid ${isSelected ? 'var(--c-amber)' : 'var(--c-border)'}`,
                  background: isSelected ? 'rgba(232,120,42,0.06)' : 'rgba(255,255,255,0.012)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Gate ID + status badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--c-hi)', fontWeight: 700 }}>{gate.id}</span>
                  <span className={`c-badge c-badge--${gate.status}`} style={{ fontSize: 9 }}>
                    {gate.status.toUpperCase()}
                  </span>
                </div>

                {/* Route */}
                <div style={{ fontSize: 10, color: 'var(--c-mid)', marginBottom: 8 }}>
                  {gate.from} → {gate.to}
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--c-mid)' }}>
                  <span>
                    <strong style={{ color: STATUS_COLOR[gate.status], fontSize: 13 }}>{gate.traffic}</strong> /h
                  </span>
                  <span>
                    Toll: <strong style={{ color: gate.toll === '0' ? 'var(--c-green)' : 'var(--c-amber)' }}>
                      {gate.toll === '0' ? 'FREE' : gate.toll}
                    </strong>
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    <GateBindingStatusBadge binding={gate.binding} compact />
                  </span>
                </div>

                {/* Threat line */}
                {threat && (
                  <div style={{
                    marginTop: 6, paddingTop: 6,
                    borderTop: '1px solid rgba(255,85,104,0.15)',
                    fontSize: 9, color: 'var(--c-crimson)', letterSpacing: '0.04em',
                  }}>
                    ⚠ {threat}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
