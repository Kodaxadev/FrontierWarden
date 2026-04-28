// GatePolicyStrip — Center column · bottom panel.
// Three gate-policy sliders (standing threshold / pirate index cap / toll bracket).
// Static hi-fi presentation only — real drag interaction is a prototype-pass concern.

import { FwPanel, ClsHeader, DocFootC, FwSlider } from './fw-atoms';
import type { FwData } from './fw-data';

const POLICIES = [
  {
    label: 'standing threshold',
    leftLabel: 'Enemy −1000',
    rightLabel: 'Ally +1000',
    value: 62,
    marker: '+62',
    color: 'var(--standing-ally)',
    note: <>pass at <span style={{ color: 'var(--standing-ally)' }}>+247</span> ▸ neutral or above</>,
  },
  {
    label: 'pirate index cap',
    leftLabel: 'Clean 0',
    rightLabel: 'Wanted 100',
    value: 73,
    marker: '73',
    color: 'var(--frontier-amber)',
    note: <>reject above <span style={{ color: 'var(--frontier-amber)' }}>73</span> ▸ deny gate</>,
  },
  {
    label: 'toll bracket',
    leftLabel: 'Free (Ally)',
    rightLabel: '10× (Enemy)',
    value: 28,
    marker: '2.0×',
    color: 'var(--sui-cyan)',
    note: <>neutral pass at <span style={{ color: 'var(--sui-cyan)' }}>2.0×</span> base · 14M/transit</>,
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GatePolicyStrip({ data: _data }: { data?: FwData } = {}) {
  return (
    <FwPanel
      accentColor="var(--sui-cyan)"
      style={{
        borderLeft: 'none', borderRight: 'none',
        boxShadow: '0 -1px 0 var(--sui-cyan-glow)',
      }}
    >
      <ClsHeader
        priority="MED"
        label="GATE POLICY · DRAFT EDIT"
        classification="GATE#7720 · UNCOMMITTED"
        accent="var(--sui-cyan)"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="fw-anno">SLIDERS — STATIC PRESENTATION</span>
            <span className="fw-mono" style={{
              fontSize: 9, letterSpacing: '0.14em',
              color: 'var(--void-900)', background: 'var(--sui-cyan)',
              padding: '4px 10px', boxShadow: 'var(--glow-cyan)',
              cursor: 'pointer',
            }}>
              ◢ SEAL &amp; COMMIT
            </span>
          </div>
        }
      />

      <div style={{
        padding: '14px 18px',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28,
      }}>
        {POLICIES.map(p => (
          <div key={p.label}>
            <div className="fw-data-label" style={{ marginBottom: 16 }}>{p.label}</div>
            <FwSlider
              leftLabel={p.leftLabel}
              rightLabel={p.rightLabel}
              value={p.value}
              marker={p.marker}
              color={p.color}
            />
            <div className="fw-mono" style={{ fontSize: 10, color: 'var(--t-secondary)', marginTop: 8 }}>
              {p.note}
            </div>
          </div>
        ))}
      </div>

      <DocFootC>
        <span>// gate_policy.draft</span>
        <span>EDITOR: VEX KORITH · UNSEALED</span>
      </DocFootC>
    </FwPanel>
  );
}
