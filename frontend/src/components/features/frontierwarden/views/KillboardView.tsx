// KillboardView — native EVE Frontier kill mail feed
//
// Primary source: GET /kill-mails (native combat telemetry)
// Secondary signal: ATTESTED badge when a related SHIP_KILL attestation covers the same victim address.
// Conservative match — does not mean this exact kill mail was verified by the oracle.
//
// Kill mails are combat telemetry — not trust scores and not reputation judgments.
// SHIP_KILL attestations are a separate oracle/trust evidence layer.

import { useCallback } from 'react';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import type { FwData, FwKill } from '../fw-data';
import { useSortable, sortArrow } from '../../../../hooks/useSortable';

type KillSortKey = 'time' | 'victim' | 'killer' | 'system' | 'lossType';
const KILL_ACCESSOR = (k: FwKill, key: KillSortKey): string | number => {
  switch (key) {
    case 'time': return k.t;
    case 'victim': return k.victim;
    case 'killer': return k.killer ?? '';
    case 'system': return k.system;
    case 'lossType': return k.lossType ?? '';
  }
};

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const t = iso.includes('T') ? iso.split('T')[1] : iso;
  return (t ?? iso).replace('Z', '').slice(0, 8);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function uniqueSystems(kills: FwData['kills']): number {
  return new Set(kills.map(k => k.system).filter(s => s && s !== 'unknown')).size;
}

export function KillboardView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const killAccessor = useCallback(KILL_ACCESSOR, []);
  const { sorted: kills, sort: killSort, toggle: toggleKillSort } = useSortable(data.kills, 'time' as KillSortKey, 'desc', killAccessor);
  const attestedCount = kills.filter(k => k.attested).length;
  const systemCount = uniqueSystems(kills);

  return (
    <>
      <div className="c-view__title">Killboard · Native Kill Feed</div>

      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText="Live kill mails"
        emptyText="No kill mails indexed"
      />

      {/* Telemetry disclaimer */}
      <div style={{
        fontSize: 11, color: 'var(--c-mid)',
        padding: '8px 0 20px',
        borderBottom: '1px solid var(--c-border)',
        marginBottom: 20,
      }}>
        Native kill mails are combat telemetry, not reputation judgments.
        SHIP_KILL attestations are a separate oracle/trust evidence layer — ATTESTED indicates a related attestation covers the same victim address, not that this exact kill mail was verified.
      </div>

      {/* Poller-not-yet-running notice */}
      {!live && !loading && kills.length === 0 && !error && (
        <div style={{
          padding: '32px 24px',
          border: '1px solid var(--c-border)',
          marginBottom: 24,
          fontSize: 12, color: 'var(--c-mid)',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--c-hi)', marginBottom: 8 }}>
            No kill mails indexed yet
          </div>
          The native kill mail poller is disabled by default.
          Once enabled and the table populates, recent kills will appear here.
          SHIP_KILL attestations may still exist separately as trust evidence
          and are visible under the Proofs tab.
        </div>
      )}

      {/* Summary bar */}
      {kills.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1, marginBottom: 32,
          border: '1px solid var(--c-border)',
          background: 'var(--c-border)',
        }}>
          {[
            { k: 'Kill Mails',    v: kills.length.toString() },
            { k: 'Systems',       v: systemCount.toString() },
            { k: 'Attested',      v: `${attestedCount} / ${kills.length}` },
          ].map(s => (
            <div key={s.k} style={{ background: 'var(--c-surface)', padding: '16px 20px' }}>
              <div className="c-stat__label">{s.k}</div>
              <div style={{
                fontSize: 24, fontWeight: 700, color: 'var(--c-hi)',
                letterSpacing: '-0.02em', marginTop: 4,
              }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Endpoint error */}
      {error && (
        <div style={{
          padding: '16px 20px', marginBottom: 24,
          border: '1px solid var(--c-border)',
          fontSize: 12, color: 'var(--c-mid)',
        }}>
          Kill mail feed unavailable: {error}.
          SHIP_KILL attestations may still exist as trust evidence under Proofs.
        </div>
      )}

      {kills.length > 0 && (
        <table className="c-table">
          <thead>
            <tr>
              <th className="c-th--sort" onClick={() => toggleKillSort('time')}>Time{sortArrow(killSort, 'time')}</th>
              <th className="c-th--sort" onClick={() => toggleKillSort('killer')}>Killer{sortArrow(killSort, 'killer')}</th>
              <th className="c-th--sort" onClick={() => toggleKillSort('victim')}>Victim{sortArrow(killSort, 'victim')}</th>
              <th className="c-th--sort" onClick={() => toggleKillSort('system')}>System{sortArrow(killSort, 'system')}</th>
              <th className="c-th--sort" onClick={() => toggleKillSort('lossType')}>Loss Type{sortArrow(killSort, 'lossType')}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {kills.map(k => {
              const date = fmtDate(k.t);
              const time = fmtTime(k.t);
              return (
                <tr key={k.id}>
                  <td>
                    <div style={{ fontSize: 12 }}>{time}</div>
                    {date && <div className="c-sub">{date}</div>}
                  </td>

                  {/* Killer */}
                  <td>
                    {k.killer ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-hi)' }}>
                          {k.killer}
                        </div>
                        {k.killerWallet && (
                          <div className="c-sub" style={{ fontFamily: 'var(--c-mono)' }}>
                            {k.killerWallet}
                          </div>
                        )}
                        {k.killerCorp && (
                          <div className="c-sub">{k.killerCorp}</div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>—</span>
                    )}
                  </td>

                  {/* Victim */}
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-frontier-crimson, var(--c-hi))' }}>
                      {k.victim}
                    </div>
                    {k.victimWallet && (
                      <div className="c-sub" style={{ fontFamily: 'var(--c-mono)' }}>
                        {k.victimWallet}
                      </div>
                    )}
                    {k.victimCorp && (
                      <div className="c-sub">{k.victimCorp}</div>
                    )}
                  </td>

                  {/* System */}
                  <td>
                    <span style={{ fontSize: 12, color: k.system !== 'unknown' ? 'var(--c-hi)' : 'var(--c-mid)' }}>
                      {k.system}
                    </span>
                  </td>

                  {/* Loss type */}
                  <td>
                    <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>
                      {k.lossType ?? '—'}
                    </span>
                  </td>

                  {/* Attestation badge */}
                  <td>
                    {k.attested
                      ? <span className="c-badge c-badge--ok">ATTESTED</span>
                      : <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>—</span>
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
