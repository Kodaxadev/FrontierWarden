// GateIntelView - Gate Operations workflow around existing gate panels.

import { useEffect, useState } from 'react';
import { fetchGatePassages } from '../../../../lib/api';
import { SUI_NETWORK } from '../../../../lib/network';
import type { GatePassageRow } from '../../../../types/api.types';
import { useCheckPassage } from '../../../../hooks/useCheckPassage';
import { LiveStatus } from '../LiveStatus';
import type { FwData, FwGate } from '../fw-data';
import type { Provenance } from '../LiveStatus';
import { GateBindingStatusBadge } from './GateBindingStatusBadge';
import { OperatorBindingPanel } from './OperatorBindingPanel';
import { WorldGateTrafficPanel } from './WorldGateTrafficPanel';
import { TopologyWarningBanner } from './TopologyWarningBanner';
import { GateOperationsOverview } from './GateOperationsOverview';
import { GatePassageAttemptPanel } from './GatePassageAttemptPanel';

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

function gateTime(value: string | null | undefined): string {
  if (!value) return '--:--:--';
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().split('T')[1].replace('Z', '');
  }
  const [, time] = value.split('T');
  return time?.replace('Z', '') ?? value;
}

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

export function GateIntelView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const [filter, setFilter] = useState<GateFilter>('ALL');
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [passages, setPassages] = useState<GatePassageRow[]>([]);
  const [passageError, setPassageError] = useState<string | null>(null);
  const [passageLoading, setPassageLoading] = useState(false);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [lastSponsoredAt, setLastSponsoredAt] = useState<string | null>(null);
  const {
    account,
    state: passageState,
    attestationId,
    attestationLoading,
    attestationError,
    checkPassage,
    reset: resetPassage,
  } = useCheckPassage();

  const gates = filter === 'ALL' ? data.gates : data.gates.filter(g => g.status === filter);
  const selectedGate = gates.find(g => g.id === selectedGateId) ?? gates[0] ?? null;

  async function copyDiagnostics() {
    if (!passageState.trace) return;
    await navigator.clipboard.writeText(JSON.stringify(passageState.trace, null, 2));
    setDiagnosticsCopied(true);
    window.setTimeout(() => setDiagnosticsCopied(false), 1600);
  }

  useEffect(() => {
    if (passageState.step === 'done') setLastSponsoredAt(new Date().toLocaleTimeString());
  }, [passageState.step, passageState.digest]);

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
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText={`Live ${SUI_NETWORK} gates`}
        emptyText="No gates indexed"
      />

      <GateOperationsOverview data={data} selectedGate={selectedGate} />

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

      {gates.length > 0 ? (
        <table className="c-table">
          <thead>
            <tr>
              <th>GatePolicy</th>
              <th>Route</th>
              <th>Status</th>
              <th>Binding</th>
              <th>Policy</th>
              <th>Toll</th>
              <th>Traffic / h</th>
              <th>Checkpoint</th>
              <th style={{ textAlign: 'right' }}>Threat</th>
            </tr>
          </thead>
          <tbody>
            {gates.map(g => (
              <tr key={g.id} onClick={() => setSelectedGateId(g.id)} style={{ cursor: 'pointer' }}>
                <td>
                  <div style={{ fontSize: 12 }}>{g.id}</div>
                  <div className="c-sub">{gateTime(g.updated)}</div>
                </td>
                <td style={{ color: 'var(--c-mid)', fontSize: 11 }}>
                  {g.from} <span style={{ color: 'var(--c-lo)' }}>-&gt;</span> {g.to}
                </td>
                <td>{statusBadge(g.status)}</td>
                <td><GateBindingStatusBadge binding={g.binding} compact /></td>
                <td style={{ color: 'var(--c-mid)', fontSize: 11 }}>{g.policy}</td>
                <td style={{ color: g.toll === '0' ? 'var(--c-green)' : 'var(--c-amber)', fontSize: 12 }}>
                  {g.toll === '0' ? 'FREE' : g.toll}
                </td>
                <td style={{ fontSize: 13, letterSpacing: '-0.02em' }}>{g.traffic}</td>
                <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>{g.checkpoint ?? '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  {g.threat
                    ? <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{g.threat}</span>
                    : <span style={{ color: 'var(--c-lo)', fontSize: 10 }}>-</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 11, color: 'var(--c-mid)' }}>
          No gates match the current filter.
        </div>
      )}

      {selectedGate && (
        <>
          <section style={{ marginTop: 36, paddingTop: 24, borderTop: '2px solid var(--c-border)' }}>
            <div className="c-view__title" style={{ marginBottom: 12 }}>
              Traffic and Passage Feed / {selectedGate.id}
            </div>
            <div className="c-sub" style={{ marginBottom: 12 }}>
              Traffic/activity is advisory context. Binding state:{' '}
              <GateBindingStatusBadge binding={selectedGate.binding} />
            </div>
            <PassageFeed
              live={live}
              loading={passageLoading}
              error={passageError}
              rows={passages}
              shortAddr={shortAddr}
            />
          </section>

          {selectedGate.sourceId && <OperatorBindingPanel gatePolicyId={selectedGate.sourceId} />}
          <TopologyWarningBanner binding={selectedGate.binding} />
          <WorldGateTrafficPanel worldGateId={selectedGate.binding?.worldGateId ?? null} />
          <GatePassageAttemptPanel
            selectedGate={selectedGate}
            accountAddress={account?.address ?? null}
            passageState={passageState}
            attestationId={attestationId}
            attestationLoading={attestationLoading}
            attestationError={attestationError}
            diagnosticsCopied={diagnosticsCopied}
            lastSponsoredAt={lastSponsoredAt}
            onCheckPassage={() => void checkPassage()}
            onResetPassage={resetPassage}
            onCopyDiagnostics={() => void copyDiagnostics()}
            shortAddr={shortAddr}
          />
        </>
      )}
    </>
  );
}

function PassageFeed({
  live,
  loading,
  error,
  rows,
  shortAddr,
}: {
  live: boolean;
  loading: boolean;
  error: string | null;
  rows: GatePassageRow[];
  shortAddr: (value: string) => string;
}) {
  if (!live) return <div className="c-sub" style={{ padding: '12px 0 4px' }}>Live passage feed appears when the indexer has gate events.</div>;
  if (loading) return <div className="c-sub" style={{ padding: '12px 0 4px' }}>Loading passages...</div>;
  if (error) return <div className="c-sub" style={{ padding: '12px 0 4px', color: 'var(--c-crimson)' }}>{error}</div>;
  if (rows.length === 0) return <div className="c-sub" style={{ padding: '12px 0 4px' }}>No recent passages indexed for this gate.</div>;

  return (
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
        {rows.map(p => (
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
  );
}
