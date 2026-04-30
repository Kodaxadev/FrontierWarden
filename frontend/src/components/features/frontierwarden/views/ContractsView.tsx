// ContractsView — contract queue with priority color coding

import type { FwData, FwContract } from '../fw-data';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';

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
            <th>Priority</th>
            <th>Contract</th>
            <th>Kind</th>
            <th>Target</th>
            <th>Age</th>
            <th>Issuer</th>
            <th style={{ textAlign: 'right' }}>Bounty</th>
            <th style={{ textAlign: 'right' }}>State</th>
          </tr>
        </thead>
        <tbody>
          {data.contracts.length === 0 && (
            <tr>
              <td colSpan={8} style={{
                padding: '48px 0', textAlign: 'center',
                fontSize: 11, color: 'var(--c-mid)',
              }}>
                No contracts indexed yet.
              </td>
            </tr>
          )}
          {data.contracts.map(c => (
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
