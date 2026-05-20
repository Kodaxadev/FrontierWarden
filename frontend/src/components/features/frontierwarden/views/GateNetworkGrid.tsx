// GateNetworkGrid — P0 fix: multi-gate overview for tribe network operators.
// Compact card grid showing all gates at a glance with status, binding, traffic, threat.
// Clicking a card selects that gate in the parent GateIntelView.
// P2: Gate grouping — operators can tag gates into named corridors and filter by group.

import { useState, useMemo } from 'react';
import type { FwGate, FwContract, FwData } from '../fw-data';
import { GateBindingStatusBadge } from './GateBindingStatusBadge';
import type { GateGroupMap } from '../../../../hooks/useGateGroups';

interface Props {
  data: FwData;
  selectedGateId: string | null;
  onSelectGate: (gateId: string) => void;
  /** Gate-to-group map from useGateGroups. */
  groups: GateGroupMap;
  /** All group labels in use. */
  groupLabels: string[];
  /** Assign a gate to a group (empty string removes). */
  onSetGroup: (gateId: string, label: string) => void;
}

const STATUS_COLOR: Record<FwGate['status'], string> = {
  open: 'var(--c-green, #5ee28a)',
  camped: 'var(--c-crimson, #ff5568)',
  toll: 'var(--c-amber, #E8782A)',
  closed: 'var(--c-mid)',
};

/** P3: Active bounties whose target matches a gate's route systems. */
function gateBounties(gate: FwGate, contracts: FwContract[]): FwContract[] {
  const open = contracts.filter(c => c.state === 'OPEN');
  if (open.length === 0) return [];
  const systems = [gate.from.toLowerCase(), gate.to.toLowerCase()];
  return open.filter(c => systems.some(s => c.target.toLowerCase().includes(s)));
}

function threatBrief(gate: FwGate): string | null {
  if (gate.threat) return gate.threat;
  if (gate.status === 'camped') return 'HOSTILE PRESENCE';
  if (gate.status === 'closed') return 'LOCKDOWN';
  return null;
}

export function GateNetworkGrid({ data, selectedGateId, onSelectGate, groups, groupLabels, onSetGroup }: Props) {
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [editingGateId, setEditingGateId] = useState<string | null>(null);
  const [newGroupInput, setNewGroupInput] = useState('');

  const allGates = data.gates;
  const bountyMap = useMemo(() => {
    const m = new Map<string, FwContract[]>();
    for (const g of allGates) m.set(g.id, gateBounties(g, data.contracts));
    return m;
  }, [allGates, data.contracts]);
  const gates = groupFilter ? allGates.filter(g => groups[g.id] === groupFilter) : allGates;
  const totalTraffic = gates.reduce((sum, g) => sum + g.traffic, 0);
  const campedCount = gates.filter(g => g.status === 'camped').length;
  const unboundCount = gates.filter(g => !g.binding || g.binding.bindingStatus === 'unbound').length;

  function assignGroup(gateId: string, label: string) {
    onSetGroup(gateId, label);
    setEditingGateId(null);
    setNewGroupInput('');
  }

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

      {/* Group filter pills */}
      {groupLabels.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, marginBottom: 14,
          flexWrap: 'wrap', alignItems: 'center',
          fontSize: 10, letterSpacing: '0.06em',
        }}>
          <span style={{ color: 'var(--c-mid)', marginRight: 4 }}>CORRIDORS:</span>
          <button
            className={`c-filter${groupFilter === null ? ' c-filter--active' : ''}`}
            style={{ fontSize: 10, padding: '3px 10px' }}
            onClick={() => setGroupFilter(null)}
          >
            ALL
          </button>
          {groupLabels.map(label => (
            <button
              key={label}
              className={`c-filter${groupFilter === label ? ' c-filter--active' : ''}`}
              style={{ fontSize: 10, padding: '3px 10px' }}
              onClick={() => setGroupFilter(prev => prev === label ? null : label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
            const bounties = bountyMap.get(gate.id) ?? [];
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

                {/* P3: Active bounties on this route */}
                {bounties.length > 0 && (
                  <div style={{
                    marginTop: 6, paddingTop: 4,
                    fontSize: 9, color: 'var(--c-amber)', letterSpacing: '0.04em',
                    display: 'flex', gap: 6, alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 700 }}>{bounties.length} BOUNTY{bounties.length > 1 ? 'S' : ''}</span>
                    <span style={{ color: 'var(--c-mid)' }}>
                      {bounties.slice(0, 2).map(b => b.bounty).join(', ')}
                      {bounties.length > 2 ? ` +${bounties.length - 2}` : ''}
                    </span>
                  </div>
                )}

                {/* Group tag */}
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editingGateId === gate.id ? (
                    <GroupEditor
                      labels={groupLabels}
                      currentLabel={groups[gate.id] ?? ''}
                      newGroupInput={newGroupInput}
                      onNewGroupInputChange={setNewGroupInput}
                      onSelect={label => assignGroup(gate.id, label)}
                      onCancel={() => { setEditingGateId(null); setNewGroupInput(''); }}
                    />
                  ) : groups[gate.id] ? (
                    <span
                      onClick={e => { e.stopPropagation(); setEditingGateId(gate.id); }}
                      style={{
                        fontSize: 9, padding: '1px 6px',
                        background: 'rgba(232,120,42,0.08)',
                        border: '1px solid rgba(232,120,42,0.18)',
                        color: 'var(--c-amber)', cursor: 'pointer',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {groups[gate.id]}
                    </span>
                  ) : (
                    <span
                      onClick={e => { e.stopPropagation(); setEditingGateId(gate.id); }}
                      style={{
                        fontSize: 9, color: 'var(--c-lo)', cursor: 'pointer',
                        letterSpacing: '0.04em',
                      }}
                    >
                      + group
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Inline group picker — shows existing labels as quick-pick buttons + free-text input. */
function GroupEditor({
  labels, currentLabel, newGroupInput, onNewGroupInputChange, onSelect, onCancel,
}: {
  labels: string[];
  currentLabel: string;
  newGroupInput: string;
  onNewGroupInputChange: (v: string) => void;
  onSelect: (label: string) => void;
  onCancel: () => void;
}) {
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {labels.map(l => (
        <button
          key={l}
          onClick={() => onSelect(l)}
          style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, padding: '1px 6px',
            background: l === currentLabel ? 'var(--c-amber)' : 'rgba(232,120,42,0.08)',
            color: l === currentLabel ? '#0a0806' : 'var(--c-amber)',
            border: '1px solid rgba(232,120,42,0.18)',
          }}
        >
          {l}
        </button>
      ))}
      <input
        autoFocus
        value={newGroupInput}
        onChange={e => onNewGroupInputChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && newGroupInput.trim()) onSelect(newGroupInput.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="new corridor..."
        className="c-input"
        style={{ width: 100, fontSize: 9, padding: '2px 6px', height: 18 }}
      />
      {currentLabel && (
        <button
          onClick={() => onSelect('')}
          style={{
            all: 'unset', cursor: 'pointer', fontSize: 9,
            color: 'var(--c-mid)', padding: '1px 4px',
          }}
        >
          clear
        </button>
      )}
      <button
        onClick={onCancel}
        style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: 'var(--c-mid)' }}
      >
        cancel
      </button>
    </div>
  );
}
