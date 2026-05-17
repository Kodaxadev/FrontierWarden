// CombatEvidencePanel — surfaces native kill mails in a trust dossier.
//
// Layer model (ADR_KILLMAILS_AS_TRUST_EVIDENCE):
//   Layer 1 (Telemetry)  : native kill mail — what happened
//   Layer 2 (Oracle)     : SHIP_KILL attestation — oracle interpretation
//   Layer 3 (Policy)     : tenant/operator decides relevance
//
// This panel shows Layer 1 and notes when Layer 2 exists.
// It does NOT change scores, compute reputation, or issue attestations.

import { useEffect, useState } from 'react';
import { fetchCharacterKills, fetchCharacterLosses } from '../../../lib/api';
import type { KillMailItem } from '../../../types/api.types';

interface Props {
  /** EVM wallet address of the subject being viewed. */
  address: string | null | undefined;
}

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10) + ' ' + (iso.slice(11, 19) || '');
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Mini kill row ─────────────────────────────────────────────────────────────

function KillRow({ row, perspective }: { row: KillMailItem; perspective: 'killer' | 'victim' }) {
  const isKiller  = perspective === 'killer';
  const subjectDisplay = isKiller
    ? (row.killerName ?? shortAddr(row.killerAddress))
    : (row.victimName ?? shortAddr(row.victimAddress));
  const counterDisplay = isKiller
    ? (row.victimName ?? shortAddr(row.victimAddress))
    : (row.killerName ?? shortAddr(row.killerAddress));
  const counterTribe = isKiller ? row.victimTribe : row.killerTribe;

  return (
    <tr>
      <td style={{ minWidth: 90 }}>
        <div style={{ fontSize: 11, color: 'var(--c-mid)' }}>{fmtTimestamp(row.killTimestamp)}</div>
      </td>
      <td>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-hi)' }}>{subjectDisplay}</div>
      </td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--c-mid)', padding: '1px 4px', border: '1px solid var(--c-border)' }}>
          {isKiller ? '→' : '←'}
        </span>
      </td>
      <td>
        <div style={{ fontSize: 12, color: isKiller ? 'var(--c-frontier-crimson, #ef4444)' : 'var(--c-hi)' }}>
          {counterDisplay}
        </div>
        {counterTribe && (
          <div style={{ fontSize: 10, color: 'var(--c-mid)' }}>{counterTribe}</div>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>
          {row.solarSystemName ?? '—'}
        </span>
      </td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>
          {row.lossType ?? '—'}
        </span>
      </td>
    </tr>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '16px 0', fontSize: 11, color: 'var(--c-mid)' }}>
      {label} No kill mails indexed yet — the native kill mail poller may be disabled.
      SHIP_KILL attestations may still exist separately under Attestation Proofs.
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function CombatEvidencePanel({ address }: Props) {
  const [kills,    setKills]    = useState<KillMailItem[]>([]);
  const [losses,   setLosses]   = useState<KillMailItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [killsMore,  setKillsMore]  = useState(false);
  const [lossesMore, setLossesMore] = useState(false);

  useEffect(() => {
    if (!address || address.length < 10) {
      setKills([]);
      setLosses([]);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCharacterKills(address, 5).catch(() => null),
      fetchCharacterLosses(address, 5).catch(() => null),
    ]).then(([killsResp, lossesResp]) => {
      setKills(killsResp?.items ?? []);
      setLosses(lossesResp?.items ?? []);
      setKillsMore(!!killsResp?.nextCursor);
      setLossesMore(!!lossesResp?.nextCursor);
    }).catch(() => {
      setError('Combat data unavailable');
    }).finally(() => {
      setLoading(false);
    });
  }, [address]);

  if (!address || address.length < 10) return null;

  return (
    <div style={{ marginTop: 48 }}>

      {/* Section header */}
      <div className="c-view__title" style={{ marginBottom: 8 }}>
        Combat Evidence
      </div>

      {/* ADR-required copy */}
      <div style={{
        fontSize: 11, color: 'var(--c-mid)',
        padding: '8px 0 20px',
        borderBottom: '1px solid var(--c-border)',
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        Combat evidence is context, not an automatic reputation change.
        Tenant policy decides whether a kill is positive, negative, or irrelevant.
        Use attestations or policy actions to change trust.
        Native kill mails are combat telemetry — SHIP_KILL attestations are oracle/trust evidence.
      </div>

      {/* Endpoint unavailable */}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--c-mid)', marginBottom: 20 }}>
          {error}. SHIP_KILL attestations may still exist under Attestation Proofs.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ fontSize: 11, color: 'var(--c-mid)', marginBottom: 20 }}>
          Loading combat records…
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

          {/* ── Kills (as killer) ─────────────────── */}
          <div>
            <div className="c-stat__label" style={{ marginBottom: 12 }}>
              Kills as Killer · {kills.length}{killsMore ? '+' : ''}
            </div>
            {kills.length === 0 ? (
              <EmptyState label="No kills recorded." />
            ) : (
              <>
                <table className="c-table" style={{ marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Killer</th>
                      <th />
                      <th>Victim</th>
                      <th>System</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kills.map(row => (
                      <KillRow key={row.killMailId} row={row} perspective="killer" />
                    ))}
                  </tbody>
                </table>
                {killsMore && (
                  <div style={{ fontSize: 10, color: 'var(--c-mid)' }}>
                    More kills available — view full feed on the Killboard tab.
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Losses (as victim) ───────────────── */}
          <div>
            <div className="c-stat__label" style={{ marginBottom: 12 }}>
              Losses as Victim · {losses.length}{lossesMore ? '+' : ''}
            </div>
            {losses.length === 0 ? (
              <EmptyState label="No losses recorded." />
            ) : (
              <>
                <table className="c-table" style={{ marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Victim</th>
                      <th />
                      <th>Killer</th>
                      <th>System</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {losses.map(row => (
                      <KillRow key={row.killMailId} row={row} perspective="victim" />
                    ))}
                  </tbody>
                </table>
                {lossesMore && (
                  <div style={{ fontSize: 10, color: 'var(--c-mid)' }}>
                    More losses available — view full feed on the Killboard tab.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Operator action affordance — future flow, not yet wired */}
      <div style={{
        marginTop: 32, padding: '16px 20px',
        border: '1px dashed var(--c-border)',
        fontSize: 11, color: 'var(--c-mid)',
        lineHeight: 1.6,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--c-hi)' }}>Operator action: </span>
        To use combat records as trust evidence, create a SHIP_KILL attestation through your oracle,
        or configure a gate policy that references kill frequency as an input.
        Automatic score mutation from kill data is not supported — tenant policy governs interpretation.
      </div>

    </div>
  );
}
