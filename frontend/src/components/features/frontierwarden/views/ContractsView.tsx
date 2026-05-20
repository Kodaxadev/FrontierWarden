// ContractsView — contract queue with priority color coding

import { useCallback } from 'react';
import type { FwData, FwContract } from '../fw-data';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import { useSortable, sortArrow } from '../../../../hooks/useSortable';

type ContractSortKey = 'priority' | 'kind' | 'target' | 'bounty' | 'state';
const PRIORITY_RANK: Record<string, number> = { CRIT: 0, HIGH: 1, MED: 2, LOW: 3 };
const CONTRACT_ACCESSOR = (c: FwContract, key: ContractSortKey): string | number => {
  switch (key) {
    case 'priority': return PRIORITY_RANK[c.priority] ?? 4;
    case 'kind': return c.kind;
    case 'target': return c.target;
    case 'bounty': return parseFloat(c.bounty) || 0;
    case 'state': return c.state;
  }
};

type Priority = FwContract['priority'];

const PRIORITY_COLOR: Record<Priority, string> = {
  CRIT: 'var(--c-crimson)',
  HIGH: 'var(--c-amber)',
  MED:  'var(--c-mid)',
  LOW:  'var(--c-lo)',
};

const STATE_LABEL: Record<string, string> = {
  OPEN:    'c-badge--ok',
  CLAIMED: 'c-badge--claimed',
  EXPIRED: 'c-badge--expired',
};

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

export function ContractsView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const contractAccessor = useCallback(CONTRACT_ACCESSOR, []);
  const { sorted: contracts, sort: contractSort, toggle: toggleContractSort } = useSortable(data.contracts, 'priority' as ContractSortKey, 'asc', contractAccessor);

  return (
    <>
      <div className="c-view__title">Contract Queue</div>
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText="Live bounties"
        emptyText="No contracts indexed"
      />

      <table className="c-table">
        <thead>
          <tr>
            <th className="c-th--sort" onClick={() => toggleContractSort('priority')}>Priority{sortArrow(contractSort, 'priority')}</th>
            <th>Contract</th>
            <th className="c-th--sort" onClick={() => toggleContractSort('kind')}>Kind{sortArrow(contractSort, 'kind')}</th>
            <th className="c-th--sort" onClick={() => toggleContractSort('target')}>Target{sortArrow(contractSort, 'target')}</th>
            <th>Age</th>
            <th>Issuer</th>
            <th className="c-th--sort" onClick={() => toggleContractSort('bounty')} style={{ textAlign: 'right' }}>Bounty{sortArrow(contractSort, 'bounty')}</th>
            <th className="c-th--sort" onClick={() => toggleContractSort('state')} style={{ textAlign: 'right' }}>State{sortArrow(contractSort, 'state')}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.length === 0 && (
            <tr>
              <td colSpan={8} style={{
                padding: '48px 0', textAlign: 'center',
                fontSize: 11, color: 'var(--c-mid)',
              }}>
                No contracts indexed yet.
              </td>
            </tr>
          )}
          {contracts.map(c => (
            <tr key={c.id}>
              <td>
                <span style={{
                  display: 'inline-block',
                  width: 3, height: 32,
                  background: PRIORITY_COLOR[c.priority],
                  verticalAlign: 'middle', marginRight: 10,
                }} />
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  color: PRIORITY_COLOR[c.priority],
                }}>
                  {c.priority}
                </span>
              </td>
              <td>
                <div style={{ fontSize: 12 }}>{c.id}</div>
              </td>
              <td style={{ fontSize: 10, color: 'var(--c-mid)', letterSpacing: '0.08em' }}>
                {c.kind}
              </td>
              <td style={{ fontSize: 12 }}>{c.target}</td>
              <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>{c.age}</td>
              <td>
                <div style={{ fontSize: 10, color: 'var(--c-mid)', fontFamily: 'var(--c-mono)' }}>
                  {c.issuer ?? 'design'}
                </div>
                {c.tx && <div className="c-sub">{c.tx}</div>}
              </td>
              <td style={{
                textAlign: 'right', fontSize: 14, fontWeight: 700,
                color: 'var(--c-amber)', letterSpacing: '-0.02em',
              }}>
                {c.bounty}
              </td>
              <td style={{ textAlign: 'right' }}>
                <span className={`c-badge ${STATE_LABEL[c.state] ?? 'c-badge--claimed'}`}>
                  {c.state}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
