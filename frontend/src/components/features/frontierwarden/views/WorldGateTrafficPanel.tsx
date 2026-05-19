// WorldGateTrafficPanel — advisory world gate intelligence.
//
// Shows indexed traffic, topology links, and recent jump events for the world
// gate bound to the selected FW gate policy.
//
// ADVISORY ONLY — no enforcement decisions are made here. All activity windows
// use indexer-observed insertion time, not authoritative on-chain event
// timestamps. Labeled explicitly in the UI.

import { useEffect, useState } from 'react';
import type {
  WorldGateSummaryResponse,
  WorldGateActivityResponse,
  WorldGateJumpsResponse,
} from '../../../../types/api.types';
import {
  fetchWorldGateSummary,
  fetchWorldGateActivity,
  fetchWorldGateJumps,
} from '../../../../lib/api';
import { InfoTooltip } from '../InfoTooltip';
import { HELP } from '../operator-help';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrafficState {
  summary:  WorldGateSummaryResponse | null;
  activity: WorldGateActivityResponse | null;
  jumps:    WorldGateJumpsResponse | null;
  loading:  boolean;
  error:    string | null;
}

const EMPTY: TrafficState = {
  summary: null, activity: null, jumps: null, loading: false, error: null,
};

interface Props {
  /** On-chain world gate object ID. Null when no world gate is bound to the selected policy. */
  worldGateId: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorldGateTrafficPanel({ worldGateId }: Props) {
  const [state, setState] = useState<TrafficState>(EMPTY);

  useEffect(() => {
    if (!worldGateId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    Promise.all([
      fetchWorldGateSummary(worldGateId),
      fetchWorldGateActivity(worldGateId),
      fetchWorldGateJumps(worldGateId, 10),
    ])
      .then(([summary, activity, jumps]) => {
        if (!cancelled) setState({ summary, activity, jumps, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            ...EMPTY,
            error: err instanceof Error ? err.message : 'fetch failed',
          });
        }
      });

    return () => { cancelled = true; };
  }, [worldGateId]);

  const sectionStyle: React.CSSProperties = {
    marginTop: 36,
    paddingTop: 24,
    borderTop: '2px solid var(--c-border)',
  };

  const titleStyle: React.CSSProperties = { marginBottom: 12 };

  // ── No world gate bound ───────────────────────────────────────────────────

  if (!worldGateId) {
    return (
      <div style={sectionStyle}>
        <div className="c-view__title" style={titleStyle}>World Gate Intelligence</div>
        <div className="c-sub">
          No world gate linked to this policy. Bind a world gate via the operator panel to see
          topology and indexed observed traffic.
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (state.loading) {
    return (
      <div style={sectionStyle}>
        <div className="c-view__title" style={titleStyle}>
          World Gate Intelligence · {shortId(worldGateId)}
        </div>
        <div className="c-sub">Loading world gate data…</div>
      </div>
    );
  }

  // ── Endpoint error ────────────────────────────────────────────────────────

  if (state.error) {
    return (
      <div style={sectionStyle}>
        <div className="c-view__title" style={titleStyle}>
          World Gate Intelligence · {shortId(worldGateId)}
        </div>
        <div className="c-sub" style={{ color: 'var(--c-crimson)' }}>
          {state.error}
        </div>
        <div className="c-sub" style={{ marginTop: 4 }}>
          The world gate traffic API may be unavailable or this gate has not yet been indexed.
        </div>
      </div>
    );
  }

  // ── Gate not found in index ───────────────────────────────────────────────

  if (!state.summary && !state.loading) {
    return (
      <div style={sectionStyle}>
        <div className="c-view__title" style={titleStyle}>
          World Gate Intelligence · {shortId(worldGateId)}
        </div>
        <div className="c-sub">
          World gate not found in the indexer. It may not have been observed yet or the
          world event cursor is still cold-starting from checkpoint 308264360.
        </div>
      </div>
    );
  }

  const { summary, activity, jumps } = state;

  // ── Populated panel ───────────────────────────────────────────────────────

  return (
    <div style={sectionStyle}>
      <div className="c-view__title" style={titleStyle}>
        World Gate Intelligence · {shortId(worldGateId)}
      </div>

      {/* ── Gate header ──────────────────────────────────────────────────── */}
      {summary && (
        <div>
          <div className="c-kv">
            <span className="c-kv__k">Gate ID</span>
            <span className="c-kv__v" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {summary.gate_id}
            </span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Status</span>
            <span
              className="c-kv__v"
              style={{ color: summary.status === 'online' ? 'var(--c-green)' : 'var(--c-mid)' }}
            >
              {summary.status.toUpperCase()}
            </span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">World / Item</span>
            <span className="c-kv__v" style={{ fontSize: 11 }}>
              {summary.tenant} · {summary.item_id.toLocaleString()}
            </span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">FW Extension</span>
            <span
              className="c-kv__v"
              style={{ color: summary.fw_extension_active ? 'var(--c-green)' : 'var(--c-mid)' }}
            >
              {summary.fw_extension_active ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
        </div>
      )}

      {/* ── Observed traffic counts ───────────────────────────────────────── */}
      {activity && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div className="c-stat__label">Observed Traffic</div>
            <InfoTooltip concept={HELP.activityWindow} />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}>
            {[
              { value: activity.jump_count_1h,         label: 'Jumps 1h' },
              { value: activity.jump_count_24h,         label: 'Jumps 24h' },
              { value: activity.jump_count_7d,          label: 'Jumps 7d' },
              { value: activity.unique_characters_24h,  label: 'Characters 24h' },
            ].map(({ value, label }) => (
              <div
                key={label}
                style={{
                  padding: '10px 8px',
                  border: '1px solid var(--c-border)',
                  background: 'rgba(232,120,42,0.018)',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: value > 0 ? 'var(--c-amber)' : 'var(--c-mid)',
                }}>
                  {value}
                </div>
                <div className="c-stat__label" style={{ marginBottom: 0, marginTop: 4 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--c-lo)', marginTop: 8, letterSpacing: '0.04em' }}>
            ⚠ Indexed activity window — not authoritative on-chain event timestamps.
            Windows reflect when the indexer observed each event.
          </div>
        </div>
      )}

      {/* ── Linked gates ─────────────────────────────────────────────────── */}
      {summary && (
        <div style={{ marginTop: 20 }}>
          <div className="c-stat__label" style={{ marginBottom: 8 }}>
            Linked Gates ({summary.link_count})
          </div>

          {summary.active_links.length === 0 ? (
            <div className="c-sub">
              No active links indexed yet.
              {!summary.is_linked && (
                <> GateLinkedEvent records are indexed as they are observed on Stillness/testnet.</>
              )}
            </div>
          ) : (
            <table className="c-table">
              <thead>
                <tr>
                  <th>Destination Gate</th>
                  <th>World · Item</th>
                  <th style={{ textAlign: 'right' }}>Linked at Checkpoint</th>
                </tr>
              </thead>
              <tbody>
                {summary.active_links.map(link => (
                  <tr key={link.destination_gate_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {link.destination_gate_id}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>
                      {link.destination_gate_tenant} · {link.destination_gate_item_id.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--c-mid)' }}>
                      {link.linked_at_checkpoint.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Recent indexed jumps ──────────────────────────────────────────── */}
      {jumps && (
        <div style={{ marginTop: 20 }}>
          <div className="c-stat__label" style={{ marginBottom: 8 }}>
            Recent Indexed Jumps
          </div>

          {jumps.jumps.length === 0 ? (
            <div className="c-sub">
              No jumps indexed yet.
              {activity && activity.jump_count_24h === 0 && (
                <> No recorded traffic at this gate in the last 24 hours.</>
              )}
              {' '}JumpEvent records are indexed as they are observed on Stillness/testnet.
              {activity && activity.jump_count_24h === 0 && activity.jump_count_7d === 0 && (
                <> The world event cursor may still be backfilling from checkpoint 308264360.</>
              )}
            </div>
          ) : (
            <table className="c-table">
              <thead>
                <tr>
                  <th>Character</th>
                  <th>Direction</th>
                  <th>Checkpoint</th>
                  <th style={{ textAlign: 'right' }}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {jumps.jumps.map(j => {
                  const isOutbound = j.source_gate_id === worldGateId;
                  return (
                    <tr key={`${j.tx_digest}-${j.checkpoint}`}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {shortId(j.character_id)}
                      </td>
                      <td style={{
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        color: isOutbound ? 'var(--c-amber)' : 'var(--c-green)',
                      }}>
                        {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>
                        {j.checkpoint.toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color: 'var(--c-mid)' }}>
                        {shortId(j.tx_digest)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
