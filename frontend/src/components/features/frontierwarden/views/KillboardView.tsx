// KillboardView — kill feed with attestation hashes

import { useState } from 'react';
import type { FwData } from '../fw-data';

type KillFilter = 'ALL' | 'HOSTILE' | 'FRIENDLY';
const FILTERS: KillFilter[] = ['ALL', 'HOSTILE', 'FRIENDLY'];

function iskLabel(isk: number) {
  if (isk >= 1_000_000_000) return `${(isk / 1e9).toFixed(2)}B`;
  return `${(isk / 1e6).toFixed(1)}M`;
}

interface Props { data: FwData; }

export function KillboardView({ data }: Props) {
  const [filter, setFilter] = useState<KillFilter>('ALL');

  const kills = data.kills.filter(k => {
    if (filter === 'FRIENDLY') return k.friendly === true;
    if (filter === 'HOSTILE')  return !k.friendly;
    return true;
  });

  const totalIsk   = kills.reduce((s, k) => s + k.isk, 0);
  const hostile    = kills.filter(k => !k.friendly).length;
  const verified   = kills.filter(k => k.verified).length;

  return (
    <>
      <div className="c-view__title">Killboard · Attestation Intercepts</div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1, marginBottom: 32,
        border: '1px solid var(--c-border)',
        background: 'var(--c-border)',
      }}>
        {[
          { k: 'Total Kills',     v: kills.length.toString() },
          { k: 'Hostile',         v: hostile.toString() },
          { k: 'ISK Destroyed',   v: iskLabel(totalIsk) },
          { k: 'Verified',        v: `${verified} / ${kills.length}` },
        ].map(s => (
          <div key={s.k} style={{
            background: 'var(--c-surface)',
            padding: '16px 20px',
          }}>
            <div className="c-stat__label">{s.k}</div>
            <div style={{
              fontSize: 24, fontWeight: 700, color: 'var(--c-hi)',
              letterSpacing: '-0.02em', marginTop: 4,
            }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="c-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`c-filter${filter === f ? ' c-filter--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <table className="c-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Victim</th>
            <th>System</th>
            <th>ISK Lost</th>
            <th>Attestation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {kills.map(k => {
            const highIsk = k.isk > 200_000_000;
            const time = k.t.split('T')[1].replace('Z', '');
            return (
              <tr key={k.id}>
                <td>
                  <div style={{ fontSize: 12 }}>{time}</div>
                  <div className="c-sub">{k.id}</div>
                </td>
                <td>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: k.friendly ? 'var(--c-crimson)' : 'var(--c-hi)',
                    ...(k.friendly ? { textShadow: '0 0 8px rgba(239,68,68,0.4)' } : {}),
                  }}>
                    {k.victim}
                  </div>
                  <div className="c-sub">{k.ship} · {k.attackers} atk</div>
                </td>
                <td>
                  <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>{k.system}</span>
                </td>
                <td>
                  <div className={`c-kill-isk${highIsk ? ' c-kill-isk--large' : ''}`}
                    style={{ color: highIsk ? 'var(--c-amber)' : 'var(--c-hi)', fontSize: highIsk ? 18 : 13 }}>
                    {iskLabel(k.isk)}
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.04em', fontFamily: 'var(--c-mono)' }}>
                    {k.hash.slice(0, 18)}…
                  </span>
                </td>
                <td>
                  {k.verified
                    ? <span className="c-badge c-badge--ok">VERIFIED</span>
                    : <span className="c-badge c-badge--toll">PENDING</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
