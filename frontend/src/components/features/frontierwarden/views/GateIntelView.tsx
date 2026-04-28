// GateIntelView — full-width gate network table
// Filter: ALL | OPEN | CAMPED | TOLL | CLOSED

import { useState } from 'react';
import type { FwData, FwGate } from '../fw-data';

type GateFilter = 'ALL' | 'open' | 'camped' | 'toll' | 'closed';
const FILTERS: GateFilter[] = ['ALL', 'open', 'camped', 'toll', 'closed'];

function statusBadge(s: FwGate['status']) {
  return <span className={`c-badge c-badge--${s}`}>{s.toUpperCase()}</span>;
}

interface Props { data: FwData; }

export function GateIntelView({ data }: Props) {
  const [filter, setFilter] = useState<GateFilter>('ALL');

  const gates = filter === 'ALL'
    ? data.gates
    : data.gates.filter(g => g.status === filter);

  return (
    <>
      <div className="c-view__title">Gate Network Intercept</div>

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
            <th>Gate</th>
            <th>Route</th>
            <th>Status</th>
            <th>Policy</th>
            <th>Toll</th>
            <th>Traffic / h</th>
            <th style={{ textAlign: 'right' }}>Threat</th>
          </tr>
        </thead>
        <tbody>
          {gates.map(g => (
            <tr key={g.id}>
              <td>
                <div style={{ fontSize: 12 }}>{g.id}</div>
                <div className="c-sub">{g.updated.split('T')[1].replace('Z','')}</div>
              </td>
              <td style={{ color: 'var(--c-mid)', fontSize: 11 }}>
                {g.from} <span style={{ color: 'var(--c-lo)' }}>→</span> {g.to}
              </td>
              <td>{statusBadge(g.status)}</td>
              <td style={{ color: 'var(--c-mid)', fontSize: 11 }}>{g.policy}</td>
              <td style={{
                color: g.toll === '0' ? 'var(--c-green)' : 'var(--c-amber)',
                fontSize: 12,
              }}>
                {g.toll === '0' ? 'FREE' : g.toll}
              </td>
              <td style={{ fontSize: 13, letterSpacing: '-0.02em' }}>
                {g.traffic}
              </td>
              <td style={{ textAlign: 'right' }}>
                {g.threat
                  ? <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{g.threat}</span>
                  : <span style={{ color: 'var(--c-lo)', fontSize: 10 }}>—</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {gates.length === 0 && (
        <div style={{
          padding: '48px 0', textAlign: 'center',
          fontSize: 11, color: 'var(--c-mid)',
        }}>
          No gates match the current filter.
        </div>
      )}
    </>
  );
}
