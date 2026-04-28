// Killboard — Center column · middle panel.
// Kill table with attestation hashes, ISK lost, verify status.
// First row shows hover tooltip (baked hi-fi state).

import { useState } from 'react';
import { FwPanel, ClsHeader, StatC } from './fw-atoms';
import type { FwData, FwKill } from './fw-data';

const FILTERS = ['ALL', 'TRIBE', 'NEAR', 'FRIENDLY'];

const COL_HEADERS = [
  { label: 'Time (Z)',    align: 'left' as const },
  { label: 'Victim · Ship', align: 'left' as const },
  { label: 'System',     align: 'left' as const },
  { label: 'ISK Lost',   align: 'right' as const },
  { label: 'Attestation',align: 'right' as const },
  { label: 'Verify',     align: 'right' as const },
];

interface KillRowProps { kill: FwKill; }

function KillRow({ kill }: KillRowProps) {
  const [hovered, setHovered] = useState(false);
  const active = hovered;
  const iskM = (kill.isk / 1_000_000).toFixed(1);
  const highIsk = kill.isk > 200_000_000;
  const time = kill.t.split('T')[1].replace('Z', '');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 110px 90px 100px 90px',
        gap: 12, padding: '8px 14px',
        borderBottom: '1px solid var(--b-05)',
        background: active ? 'rgba(0,210,255,0.05)' :
                    kill.friendly ? 'rgba(220,38,38,0.06)' : 'rgba(245,158,11,0.025)',
        borderLeft: active ? '3px solid var(--sui-cyan)' :
                    kill.friendly ? '3px solid var(--tribe-crimson)' :
                    '3px solid var(--frontier-amber)',
        boxShadow: active ? 'inset 0 0 30px rgba(0,210,255,0.04)' : 'none',
        position: 'relative', cursor: 'default', alignItems: 'center',
        transition: 'background 80ms ease-out',
      }}
    >
      <span className="fw-mono" style={{ fontSize: 11, color: 'var(--t-secondary)' }}>{time}</span>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="fw-mono" style={{ fontSize: 12, color: 'var(--t-primary)' }}>{kill.victim}</span>
        <span className="fw-mono" style={{ fontSize: 10, color: 'var(--t-muted)' }}>
          {kill.ship} · {kill.id} · {kill.attackers} attkr
        </span>
      </div>

      <span className="fw-mono" style={{ fontSize: 11, color: 'var(--alloy-silver)' }}>{kill.system}</span>

      <span className="fw-mono" style={{
        fontSize: 12, textAlign: 'right',
        color: highIsk ? 'var(--frontier-amber)' : 'var(--t-primary)',
        textShadow: highIsk ? '0 0 8px var(--frontier-amber-glow)' : 'none',
      }}>
        {iskM}<span style={{ color: 'var(--t-muted)' }}>M</span>
      </span>

      <span className="fw-mono" style={{
        fontSize: 9, textAlign: 'right',
        color: 'var(--t-muted)', letterSpacing: '0.05em',
      }}>
        {kill.hash}
      </span>

      <span className="fw-mono" style={{
        fontSize: 9, letterSpacing: '0.12em', textAlign: 'right',
        color: kill.verified ? 'var(--sui-cyan)' : 'var(--frontier-amber)',
        textShadow: kill.verified ? '0 0 8px var(--sui-cyan-glow)' : 'none',
      }}>
        {kill.verified ? '◢ VERIFIED' : '[UNVERIFIED]'}
      </span>

      {/* Hover tooltip */}
      {active && (
        <div style={{
          position: 'absolute', left: 14, top: '100%',
          marginTop: 4, zIndex: 10,
          background: 'var(--void-850)',
          border: '1px solid var(--sui-cyan)',
          padding: '12px 14px', width: 380,
          boxShadow: 'var(--glow-cyan), 0 14px 40px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
        }}>
          <div className="fw-mono" style={{
            fontSize: 9, color: 'var(--frontier-amber)', letterSpacing: '0.14em',
            borderBottom: '1px dashed var(--b-08)', paddingBottom: 4,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>◣ DOC-K1 · KILL DETAIL</span>
            <span style={{ color: 'var(--sui-cyan)' }}>{kill.id}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <StatC k="Final blow" v="K. Renn" sub="OBVL · ENT#0014" />
            <StatC k="ISK efficiency" v="98.2%" sub="vs hostile loss" color="var(--status-clear)" />
          </div>
          <div className="fw-mono" style={{ fontSize: 10, color: 'var(--t-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Witnesses: <span style={{ color: 'var(--standing-ally)' }}>3 ally</span>, 1 neutral · σ 0.04<br />
            Attestor: <span style={{ color: 'var(--t-primary)' }}>WRDN-7</span> · block 18,402,108
          </div>
        </div>
      )}
    </div>
  );
}

interface KillboardProps { data: FwData; }

export function Killboard({ data }: KillboardProps) {
  const [activeFilter, setActiveFilter] = useState(0);

  return (
    <FwPanel
      accentColor="var(--frontier-amber)"
      style={{
        borderLeft: 'none', borderRight: 'none',
        boxShadow: '0 -1px 0 var(--frontier-amber-glow)',
        overflow: 'visible',
      }}
    >
      <ClsHeader
        priority="HIGH"
        label="KILLBOARD · ATTESTATION INTERCEPTS"
        classification="LAST 30 MIN · 5 OF 47"
        right={
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map((f, i) => (
              <button key={f}
                onClick={() => setActiveFilter(i)}
                className="fw-mono"
                style={{
                  fontSize: 9, letterSpacing: '0.12em',
                  padding: '2px 6px', cursor: 'pointer',
                  color: activeFilter === i ? 'var(--void-900)' : 'var(--t-secondary)',
                  background: activeFilter === i ? 'var(--frontier-amber)' : 'transparent',
                  border: `1px solid ${activeFilter === i ? 'var(--frontier-amber)' : 'var(--b-08)'}`,
                  boxShadow: activeFilter === i ? 'var(--glow-amber)' : 'none',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      {/* Column header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 110px 90px 100px 90px',
        gap: 12, padding: '6px 14px',
        borderBottom: '1px solid var(--b-05)', flexShrink: 0,
      }}>
        {COL_HEADERS.map(h => (
          <span key={h.label} className="fw-data-label" style={{
            fontSize: 9, textAlign: h.align,
          }}>{h.label}</span>
        ))}
      </div>

      {/* Kill rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {data.kills.map((k, i) => (
          <KillRow key={k.id} kill={k} />
        ))}
      </div>
    </FwPanel>
  );
}
