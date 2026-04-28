// GateIntel — Left column · middle panel (largest left panel).
// Gate network intercept: 5 gates with status, policy, toll, traffic.
// Second gate (camped) shows hover tooltip drilldown as baked-in hi-fi state.

import { useState } from 'react';
import { FwPanel, ClsHeader, FwGateGlyph } from './fw-atoms';
import type { FwData, FwGate } from './fw-data';

function gateStatusColor(status: FwGate['status']): string {
  switch (status) {
    case 'open':   return 'var(--status-clear)';
    case 'camped': return 'var(--status-camped)';
    case 'closed': return 'var(--t-muted)';
    default:       return 'var(--frontier-amber)';
  }
}

interface GateRowProps { gate: FwGate; index: number; }

function GateRow({ gate, index }: GateRowProps) {
  const [hovered, setHovered] = useState(false);
  const sColor = gateStatusColor(gate.status);
  const isActive = hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--b-05)',
        background: isActive ? 'rgba(0,210,255,0.06)' :
                    gate.status === 'camped' ? 'rgba(220,38,38,0.06)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--sui-cyan)' :
                    gate.status === 'camped' ? '3px solid var(--tribe-crimson)' :
                    '3px solid transparent',
        boxShadow: isActive ? 'inset 0 0 30px rgba(0,210,255,0.04)' : 'none',
        position: 'relative', cursor: 'default',
        transition: 'background 80ms ease-out, border-left 80ms ease-out',
      }}
    >
      {/* Classification micro-label */}
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 8,
        color: 'var(--frontier-amber)', letterSpacing: '0.16em', marginBottom: 3,
      }}>
        ◤ DOC-G{index + 1} · ATTEST 0x{(0x9a3 + index * 13).toString(16)}…f1 · LEVEL: TRIBE
      </div>

      {/* Gate ID + route + status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FwGateGlyph status={gate.status} />
          <span className="fw-mono" style={{ fontSize: 12, color: 'var(--t-primary)' }}>{gate.id}</span>
          <span className="fw-mono" style={{ fontSize: 10, color: 'var(--t-muted)' }}>
            {gate.from} → {gate.to}
          </span>
        </div>
        <span className="fw-mono" style={{
          fontSize: 9, letterSpacing: '0.12em',
          color: sColor, padding: '2px 6px',
          background: `${sColor}15`, border: `1px solid ${sColor}50`,
          boxShadow: `0 0 10px ${sColor}25`,
        }}>
          {gate.status.toUpperCase()}
        </span>
      </div>

      {/* Policy / toll / traffic metrics */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10, marginTop: 6,
      }}>
        <div>
          <div className="fw-data-label" style={{ fontSize: 8 }}>POLICY</div>
          <div className="fw-mono" style={{ fontSize: 11, color: 'var(--alloy-silver)' }}>{gate.policy}</div>
        </div>
        <div>
          <div className="fw-data-label" style={{ fontSize: 8 }}>TOLL</div>
          <div className="fw-mono" style={{
            fontSize: 11,
            color: gate.toll === '0' ? 'var(--status-clear)' : 'var(--frontier-amber)',
          }}>×{gate.toll}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="fw-data-label" style={{ fontSize: 8 }}>TRAFFIC/H</div>
          <div className="fw-mono" style={{ fontSize: 11, color: 'var(--t-primary)' }}>{gate.traffic}</div>
        </div>
      </div>

      {/* Hostile presence warning */}
      {gate.threat && (
        <div className="fw-mono" style={{
          marginTop: 6, fontSize: 10,
          color: 'var(--tribe-crimson)',
          textShadow: '0 0 8px var(--tribe-crimson-glow)',
        }}>
          ▲ HOSTILE PRESENCE: {gate.threat}
        </div>
      )}

      {/* Hover tooltip — policy drilldown */}
      {isActive && (
        <div style={{
          position: 'absolute', right: 12, top: '100%',
          marginTop: 4, zIndex: 10,
          background: 'var(--void-850)',
          border: '1px solid var(--sui-cyan)',
          padding: '10px 12px', width: 240,
          boxShadow: 'var(--glow-cyan), 0 14px 40px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
        }}>
          <div className="fw-mono" style={{
            fontSize: 9, color: 'var(--frontier-amber)', letterSpacing: '0.14em',
            borderBottom: '1px dashed var(--b-08)', paddingBottom: 4,
          }}>◣ INTERCEPT · POLICY DRILLDOWN</div>
          <div className="fw-mono" style={{ fontSize: 10, color: 'var(--t-primary)', lineHeight: 1.6, marginTop: 6 }}>
            Toll bracket: <span style={{ color: 'var(--frontier-amber)' }}>NEUTRAL+</span><br />
            Min standing: <span style={{ color: 'var(--alloy-silver)' }}>−200</span><br />
            Pirate-idx cap: <span style={{ color: 'var(--alloy-silver)' }}>73</span><br />
            Confidence: <span style={{ color: 'var(--status-clear)' }}>0.94</span>
          </div>
          <div className="fw-mono" style={{
            fontSize: 8, color: 'var(--t-muted)', letterSpacing: '0.12em',
            marginTop: 6, paddingTop: 4, borderTop: '1px dashed var(--b-08)',
          }}>
            0x9c…f201 · K. Renn · 22m ago
          </div>
        </div>
      )}
    </div>
  );
}

interface GateIntelProps { data: FwData; }

export function GateIntel({ data }: GateIntelProps) {
  return (
    <FwPanel
      accentColor="var(--frontier-amber)"
      style={{ borderLeft: 'none', borderRight: 'none', overflow: 'visible' }}
    >
      <ClsHeader
        priority="HIGH"
        label="GATE NETWORK INTERCEPT"
        classification="HOP RADIUS 2"
        right={
          <span className="fw-anno" style={{ fontSize: 9 }}>HOVER → POLICY DRILLDOWN</span>
        }
      />
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {data.gates.map((g, i) => (
          <GateRow key={g.id} gate={g} index={i} />
        ))}
      </div>
    </FwPanel>
  );
}
