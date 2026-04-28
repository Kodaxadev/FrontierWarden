// DispositionMatrix — Right column · middle panel.
// 4×5 cross-tribe disposition scores with heat-map coloring and hover tooltip.

import { useState } from 'react';
import { FwPanel, ClsHeader } from './fw-atoms';
import type { FwData } from './fw-data';

const COLS: Array<{ key: keyof FwData['matrix'][number]; label: string }> = [
  { key: 'vsObsidian', label: 'Obsd' },
  { key: 'vsCrimson',  label: 'Crmn' },
  { key: 'vsRen',      label: 'Ren'  },
  { key: 'vsHollow',   label: 'Holw' },
  { key: 'vsVoidken',  label: 'Vdkn' },
];

function cellColor(v: number): string {
  if (v >= 200)  return 'var(--standing-ally)';
  if (v >= 50)   return '#5d9bff';
  if (v >= -50)  return 'var(--alloy-silver)';
  if (v >= -300) return 'var(--frontier-amber)';
  return 'var(--tribe-crimson)';
}

function cellAlpha(v: number): string {
  return Math.min(99, Math.abs(v) / 12).toFixed(0).padStart(2, '0');
}

interface MatrixCellProps {
  value: number; rowIdx: number; colIdx: number;
}

function MatrixCell({ value, rowIdx, colIdx }: MatrixCellProps) {
  const [hovered, setHovered] = useState(false);
  const c = cellColor(value);

  return (
    <td style={{ padding: 0, position: 'relative' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          margin: 1, height: 30,
          background: hovered ? 'var(--void-700)' : `${c}${cellAlpha(value)}`,
          border: hovered ? '1px solid var(--sui-cyan)' : '1px solid var(--b-05)',
          boxShadow: hovered ? 'var(--glow-cyan)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: c, fontFamily: 'var(--f-mono)', fontSize: 11,
          cursor: 'default',
          transition: 'background 80ms ease-out',
          position: 'relative',
        }}
      >
        {value > 0 ? `+${value}` : value}
        {hovered && (
          <div style={{
            position: 'absolute',
            top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4, zIndex: 10,
            background: 'var(--void-850)',
            border: '1px solid var(--sui-cyan)',
            padding: '8px 10px', width: 200,
            textAlign: 'left',
            boxShadow: 'var(--glow-cyan)',
            pointerEvents: 'none',
          }}>
            <div className="fw-mono" style={{ fontSize: 9, color: 'var(--frontier-amber)', letterSpacing: '0.14em' }}>
              ◣ INTERCEPT · row {rowIdx + 1} / col {colIdx + 1}
            </div>
            <div className="fw-mono" style={{ fontSize: 11, color: c, marginTop: 2 }}>
              {value > 0 ? `+${value}` : value}
            </div>
            <div className="fw-mono" style={{ fontSize: 9, color: 'var(--t-secondary)', marginTop: 4, lineHeight: 1.5 }}>
              σ ±{Math.round(Math.abs(value) * 0.04)} · n={Math.round(Math.abs(value) * 0.9)}<br />
              upd <span style={{ color: 'var(--t-muted)' }}>06:48:09Z</span>
            </div>
          </div>
        )}
      </div>
    </td>
  );
}

interface DispositionMatrixProps { data: FwData; }

export function DispositionMatrix({ data }: DispositionMatrixProps) {
  return (
    <FwPanel style={{ borderTop: '1px solid var(--b-08)', borderLeft: 'none', borderRight: 'none' }}>
      <ClsHeader
        priority="MED"
        label="DISPOSITION MATRIX"
        classification="DOC-D1 · NORMALIZED"
        accent="var(--alloy-silver)"
        right={<span className="fw-anno" style={{ fontSize: 9 }}>HOVER → SCORE + UPD</span>}
      />

      <div style={{ padding: '10px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--f-mono)', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '4px 4px',
                color: 'var(--frontier-amber)', fontWeight: 400, fontSize: 9, letterSpacing: '0.14em',
              }}>
                TRIBE \ SYND
              </th>
              {COLS.map(c => (
                <th key={String(c.key)} style={{
                  textAlign: 'center', padding: '4px 4px',
                  color: 'var(--t-secondary)', fontWeight: 400, fontSize: 10, letterSpacing: '0.05em',
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? 'rgba(0,210,255,0.05)' : 'transparent' }}>
                <td style={{
                  padding: '6px 4px',
                  color: ri === 0 ? 'var(--sui-cyan)' : 'var(--t-primary)',
                  fontSize: 10, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                }}>
                  {row.tribe}
                </td>
                {COLS.map((c, ci) => (
                  <MatrixCell
                    key={String(c.key)}
                    value={row[c.key] as number}
                    rowIdx={ri}
                    colIdx={ci}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Legend */}
        <div className="fw-mono" style={{
          fontSize: 9, color: 'var(--t-muted)', marginTop: 6,
          letterSpacing: '0.05em', display: 'flex', gap: 14,
        }}>
          <span><span style={{ color: 'var(--standing-ally)' }}>■</span> ally</span>
          <span><span style={{ color: 'var(--alloy-silver)' }}>■</span> neutral</span>
          <span><span style={{ color: 'var(--frontier-amber)' }}>■</span> hostile</span>
          <span><span style={{ color: 'var(--tribe-crimson)' }}>■</span> KOS</span>
        </div>
      </div>
    </FwPanel>
  );
}
