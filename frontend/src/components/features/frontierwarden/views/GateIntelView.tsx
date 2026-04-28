// GateIntelView — full-width gate network table
// Filter: ALL | OPEN | CAMPED | TOLL | CLOSED

import { useEffect, useState } from 'react';
import { fetchGatePassages } from '../../../../lib/api';
import type { GatePassageRow } from '../../../../types/api.types';
import type { FwData, FwGate } from '../fw-data';

type GateFilter = 'ALL' | 'open' | 'camped' | 'toll' | 'closed';
const FILTERS: GateFilter[] = ['ALL', 'open', 'camped', 'toll', 'closed'];

function statusBadge(s: FwGate['status']) {
  return <span className={`c-badge c-badge--${s}`}>{s.toUpperCase()}</span>;
}

function shortAddr(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatMist(value: number | null): string {
  if (!value) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} SUI`;
  return `${value.toLocaleString()} MIST`;
}

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
}

export function GateIntelView({ data, live = false, loading = false, error = null }: Props) {
  const [filter, setFilter] = useState<GateFilter>('ALL');
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [passages, setPassages] = useState<GatePassageRow[]>([]);
  const [passageError, setPassageError] = useState<string | null>(null);
  const [passageLoading, setPassageLoading] = useState(false);

  const gates = filter === 'ALL'
    ? data.gates
    : data.gates.filter(g => g.status === filter);
  const selectedGate = gates.find(g => g.id === selectedGateId) ?? gates[0] ?? null;

  useEffect(() => {
    if (!selectedGateId && gates[0]) setSelectedGateId(gates[0].id);
  }, [gates, selectedGateId]);

  useEffect(() => {
    if (!live || !selectedGate?.sourceId) {
      setPassages([]);
      setPassageError(null);
      setPassageLoading(false);
      return;
    }

    let cancelled = false;
    setPassageLoading(true);
    fetchGatePassages(selectedGate.sourceId, 8)
      .then(rows => {
        if (!cancelled) {
          setPassages(rows);
          setPassageError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setPassages([]);
          setPassageError(err instanceof Error ? err.message : 'fetch failed');
        }
      })
      .finally(() => {
        if (!cancelled) setPassageLoading(false);
      });

    return () => { cancelled = true; };
  }, [live, selectedGate?.sourceId]);

  return (
    <>
      <div className="c-view__title">Gate Network Intercept</div>
      <div className="c-sub" style={{ marginBottom: 12 }}>
        {loading
          ? 'SYNCING INDEXER'
          : live
            ? 'LIVE DEVNET INDEXER'
            : error
              ? 'DESIGN FALLBACK - INDEXER OFFLINE'
              : 'DESIGN FALLBACK - NO LIVE GATE EVENTS'}
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
            <th>Gate</th>
            <th>Route</th>
            <th>Status</th>
            <th>Policy</th>
            <th>Toll</th>
            <th>Traffic / h</th>
            <th>Checkpoint</th>
            <th style={{ textAlign: 'right' }}>Threat</th>
          </tr>
        </thead>
        <tbody>
          {gates.map(g => (
            <tr
              key={g.id}
              onClick={() => setSelectedGateId(g.id)}
              style={{ cursor: 'pointer' }}
            >
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
              <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>
                {g.checkpoint ?? '-'}
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

      {selectedGate && (
        <div style={{
          marginTop: 28,
          borderTop: '1px solid var(--c-border)',
          paddingTop: 18,
        }}>
          <div className="c-view__title" style={{ marginBottom: 12 }}>
            Passage Feed / {selectedGate.id}
          </div>

          {!live && (
            <div className="c-sub" style={{ padding: '12px 0 4px' }}>
              Live passage feed appears when the devnet indexer has gate events.
            </div>
          )}

          {live && passageLoading && (
            <div className="c-sub" style={{ padding: '12px 0 4px' }}>LOADING PASSAGES</div>
          )}

          {live && passageError && (
            <div className="c-sub" style={{ padding: '12px 0 4px', color: 'var(--c-crimson)' }}>
              {passageError}
            </div>
          )}

          {live && !passageLoading && !passageError && passages.length === 0 && (
            <div className="c-sub" style={{ padding: '12px 0 4px' }}>
              No recent passages indexed for this gate.
            </div>
          )}

          {live && passages.length > 0 && (
            <table className="c-table">
              <thead>
                <tr>
                  <th>Traveler</th>
                  <th>Decision</th>
                  <th>Score</th>
                  <th>Toll</th>
                  <th>Epoch</th>
                  <th style={{ textAlign: 'right' }}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {passages.map(p => (
                  <tr key={`${p.tx_digest}-${p.checkpoint_seq}`}>
                    <td>{shortAddr(p.traveler)}</td>
                    <td>{p.allowed ? statusBadge('open') : statusBadge('camped')}</td>
                    <td>{p.score ?? '-'}</td>
                    <td>{formatMist(p.toll_paid)}</td>
                    <td>{p.epoch}</td>
                    <td style={{ textAlign: 'right' }}>{shortAddr(p.tx_digest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
