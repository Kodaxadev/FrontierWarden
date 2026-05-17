// KillboardView — kill feed with attestation hashes

import { useState } from 'react';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import type { FwData } from '../fw-data';

// Hostile/friendly filters omitted — relationship data not present in SHIP_KILL attestations.
type KillFilter = 'ALL';

function luxLabel(lux: number) {
  if (lux >= 1_000_000_000) return `${(lux / 1e9).toFixed(2)}B`;
  return `${(lux / 1e6).toFixed(1)}M`;
}

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

export function KillboardView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const [filter] = useState<KillFilter>('ALL');

  const kills = data.kills.filter(_k => filter === 'ALL');

  const totalLux = kills.reduce((s, k) => s + k.lux, 0);
  const verified = kills.filter(k => k.verified).length;

  return (
    <>
      <div className="c-view__title">Killboard · Attestation Intercepts</div>

      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText="Live ship kills"
        emptyText="No kills indexed"
      />

      {/* Schema disclaimer */}
      <div style={{
        fontSize: 11, color: 'var(--c-mid)',
        padding: '8px 0 20px',
        borderBottom: '1px solid var(--c-border)',
        marginBottom: 20,
      }}>
        Killboard entries are oracle attestations, not full combat telemetry.
        Ship type, system, and attacker count require a richer kill schema.
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 1, marginBottom: 32,
        border: '1px solid var(--c-border)',
        background: 'var(--c-border)',
      }}>
        {[
          { k: 'Kill Attestations', v: kills.length.toString() },
          { k: 'LUX Destroyed',     v: luxLabel(totalLux) },
          { k: 'Verified',          v: `${verified} / ${kills.length}` },
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

      {kills.length === 0 && (
        <div style={{
          padding: '48px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--c-mid)',
        }}>
          No kills match the current filter.
        </div>
      )}

      {kills.length > 0 && (
      <table className="c-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Victim</th>
            <th>LUX Lost</th>
            <th>Issuer</th>
            <th>Attestation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {kills.map(k => {
            const highLux = k.lux > 200_000_000;
            const time = k.t?.includes('T') ? k.t.split('T')[1]?.replace('Z', '') ?? '--:--:--' : '--:--:--';
            const victimIsName = k.victimWallet !== undefined;
            return (
              <tr key={k.id}>
                <td>
                  <div style={{ fontSize: 12 }}>{time}</div>
                  <div className="c-sub">{k.id}</div>
                </td>
                <td>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-hi)' }}>
                    {k.victim}
                  </div>
                  {victimIsName && k.victimWallet && (
                    <div className="c-sub" style={{ fontFamily: 'var(--c-mono)' }}>
                      {k.victimWallet}
                    </div>
                  )}
                  {k.victimCorp && (
                    <div className="c-sub">{k.victimCorp}</div>
                  )}
                </td>
                <td>
                  <div className={`c-kill-isk${highLux ? ' c-kill-isk--large' : ''}`}
                    style={{ color: highLux ? 'var(--c-amber)' : 'var(--c-hi)', fontSize: highLux ? 18 : 13 }}>
                    {luxLabel(k.lux)}
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 10, color: 'var(--c-mid)', fontFamily: 'var(--c-mono)' }}>
                    {k.issuer ?? '—'}
                  </span>
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
      )}
    </>
  );
}
