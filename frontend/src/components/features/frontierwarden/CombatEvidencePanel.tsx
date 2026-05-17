// CombatEvidencePanel — surfaces native kill mails and advisory risk signals in a trust dossier.
//
// Layer model (ADR_KILLMAILS_AS_TRUST_EVIDENCE):
//   Layer 1 (Telemetry)  : native kill mail — what happened
//   Layer 2 (Oracle)     : SHIP_KILL attestation — oracle interpretation
//   Layer 3 (Policy)     : tenant/operator decides relevance
//
// This panel shows Layer 1 telemetry, notes when Layer 2 exists, and derives
// advisory signals that operators can read as context. It does NOT change scores,
// loan caps, gate access, or issue attestations. Tenant policy governs all interpretation.

import { useEffect, useState } from 'react';
import { fetchCharacterKills, fetchCharacterLosses } from '../../../lib/api';
import type { KillMailItem } from '../../../types/api.types';

interface Props {
  /** EVM wallet address of the subject being viewed. */
  address: string | null | undefined;
  /** Count of non-revoked SHIP_KILL attestations for this address (Layer 2 signal). */
  shipKillAttestationCount?: number;
}

// ── Advisory signal types ─────────────────────────────────────────────────────

interface CombatSignal {
  label: string;
  value: string;
  /** neutral: grey | advisory: amber (worth noting, not good/bad) | info: hi (positive context) */
  type: 'neutral' | 'advisory' | 'info';
  note?: string;
}

function deriveCombatSignals(
  kills: KillMailItem[],
  losses: KillMailItem[],
  killsMore: boolean,
  lossesMore: boolean,
  shipKillAttestationCount: number,
): CombatSignal[] {
  const signals: CombatSignal[] = [];
  const totalKills  = kills.length;
  const totalLosses = losses.length;
  const totalCombat = totalKills + totalLosses;

  signals.push({
    label: 'Kills on Record',
    value: killsMore  ? `${totalKills}+`  : String(totalKills),
    type:  'neutral',
    note:  'most recent indexed',
  });
  signals.push({
    label: 'Losses on Record',
    value: lossesMore ? `${totalLosses}+` : String(totalLosses),
    type:  'neutral',
    note:  'most recent indexed',
  });

  // Ratio only when the full window is visible (no truncation) and there's enough data
  if (totalCombat >= 3 && !killsMore && !lossesMore) {
    const ratio = totalLosses === 0
      ? (totalKills > 0 ? '∞' : '—')
      : (totalKills / totalLosses).toFixed(2);
    signals.push({
      label: 'Kill / Loss Ratio',
      value: ratio,
      type:  'info',
      note:  `${totalKills} kills · ${totalLosses} losses (full recent window)`,
    });
  }

  // Profile characterisation — advisory label only, no value judgment
  if (totalCombat === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'No combat evidence indexed',
      type:  'neutral',
    });
  } else if (totalKills >= 3 && totalLosses === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'Combat-heavy · no losses on record',
      type:  'advisory',
      note:  'Advisory only — tenant policy decides relevance',
    });
  } else if (totalLosses >= 3 && totalKills === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'High recent loss activity',
      type:  'advisory',
      note:  'Advisory only — may be relevant for collateral context',
    });
  } else if (totalLosses >= 3) {
    signals.push({
      label: 'Combat Profile',
      value: 'High recent loss activity',
      type:  'advisory',
      note:  'Advisory only — tenant policy decides relevance',
    });
  } else {
    signals.push({
      label: 'Combat Profile',
      value: 'Active combat record',
      type:  'neutral',
    });
  }

  // Layer 2: SHIP_KILL oracle attestations
  signals.push({
    label: 'SHIP_KILL Attested',
    value: shipKillAttestationCount > 0
      ? `${shipKillAttestationCount} oracle attestation${shipKillAttestationCount !== 1 ? 's' : ''}`
      : 'None on record',
    type: shipKillAttestationCount > 0 ? 'info' : 'neutral',
    note: shipKillAttestationCount > 0
      ? 'Layer 2: oracle-interpreted kill evidence — separate from telemetry'
      : 'No SHIP_KILL oracle attestations found for this address',
  });

  return signals;
}

// ── Signal chip ───────────────────────────────────────────────────────────────

function SignalChip({ signal }: { signal: CombatSignal }) {
  const color = signal.type === 'advisory'
    ? 'var(--c-amber)'
    : signal.type === 'info'
      ? 'var(--c-hi)'
      : 'var(--c-mid)';
  return (
    <div style={{
      padding: '10px 14px',
      border: `1px solid ${signal.type === 'advisory' ? 'rgba(245,158,11,0.3)' : 'var(--c-border)'}`,
      background: signal.type === 'advisory' ? 'rgba(245,158,11,0.04)' : 'transparent',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-lo)', marginBottom: 4 }}>
        {signal.label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: '-0.01em' }}>
        {signal.value}
      </div>
      {signal.note && (
        <div style={{ fontSize: 10, color: 'var(--c-lo)', marginTop: 4, lineHeight: 1.5 }}>
          {signal.note}
        </div>
      )}
    </div>
  );
}

// ── Mini kill row ─────────────────────────────────────────────────────────────

function KillRow({ row, perspective }: { row: KillMailItem; perspective: 'killer' | 'victim' }) {
  const isKiller       = perspective === 'killer';
  const subjectDisplay = isKiller
    ? (row.killerName ?? shortAddr(row.killerAddress))
    : (row.victimName ?? shortAddr(row.victimAddress));
  const counterDisplay = isKiller
    ? (row.victimName ?? shortAddr(row.victimAddress))
    : (row.killerName ?? shortAddr(row.killerAddress));
  const counterTribe   = isKiller ? row.victimTribe : row.killerTribe;

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
        <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>{row.solarSystemName ?? '—'}</span>
      </td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>{row.lossType ?? '—'}</span>
      </td>
    </tr>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10) + ' ' + (iso.slice(11, 19) || '');
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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

export function CombatEvidencePanel({ address, shipKillAttestationCount = 0 }: Props) {
  const [kills,      setKills]      = useState<KillMailItem[]>([]);
  const [losses,     setLosses]     = useState<KillMailItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
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

  const signals = deriveCombatSignals(kills, losses, killsMore, lossesMore, shipKillAttestationCount);

  return (
    <div style={{ marginTop: 48 }}>

      {/* ── Section header ────────────────────────── */}
      <div className="c-view__title" style={{ marginBottom: 8 }}>Combat Evidence</div>

      {/* ── ADR-required copy ─────────────────────── */}
      <div style={{
        fontSize: 11, color: 'var(--c-mid)',
        padding: '8px 0 20px',
        borderBottom: '1px solid var(--c-border)',
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        Combat history is context, not an automatic reputation change.
        Tenant policy decides whether this activity is positive, negative, or irrelevant.
        Credit and access decisions should use explicit policy or attestations.{' '}
        Native kill mails are combat telemetry (Layer 1) — SHIP_KILL attestations are oracle/trust evidence (Layer 2).
      </div>

      {/* ── Error state ───────────────────────────── */}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--c-mid)', marginBottom: 20 }}>
          {error}. SHIP_KILL attestations may still exist under Attestation Proofs.
        </div>
      )}

      {/* ── Loading ───────────────────────────────── */}
      {loading && (
        <div style={{ fontSize: 11, color: 'var(--c-mid)', marginBottom: 20 }}>
          Loading combat records…
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Advisory signals ──────────────────── */}
          <div style={{ marginBottom: 32 }}>
            <div className="c-stat__label" style={{ marginBottom: 12 }}>
              Advisory Signals · context only, no automatic action
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {signals.map(s => <SignalChip key={s.label} signal={s} />)}
            </div>
          </div>

          {/* ── Kill / loss tables ────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>

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
                        <th>Time</th><th>Killer</th><th /><th>Victim</th><th>System</th><th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kills.map(row => <KillRow key={row.killMailId} row={row} perspective="killer" />)}
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
                        <th>Time</th><th>Victim</th><th /><th>Killer</th><th>System</th><th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {losses.map(row => <KillRow key={row.killMailId} row={row} perspective="victim" />)}
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

          {/* ── Credit context ────────────────────── */}
          <div style={{
            marginBottom: 24, padding: '16px 20px',
            border: '1px solid var(--c-border)',
            background: 'rgba(245,158,11,0.02)',
          }}>
            <div className="c-stat__label" style={{ marginBottom: 10 }}>Credit Context</div>
            <div style={{ fontSize: 11, color: 'var(--c-mid)', lineHeight: 1.7 }}>
              Recent losses may be relevant for collateral review by a lending operator.{' '}
              No automatic loan-cap change is applied from combat data.{' '}
              Loan caps and credit limits are set by explicit attestation or operator policy, not by kill mail telemetry.
            </div>
          </div>

          {/* ── Future policy placeholders ────────── */}
          <div style={{
            marginBottom: 32, padding: '16px 20px',
            border: '1px dashed var(--c-border)',
            fontSize: 11, color: 'var(--c-lo)',
            lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 600, color: 'var(--c-mid)', marginBottom: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Example tenant policy hooks · not active
            </div>
            {[
              'Losses in last 7d > N → flag for manual review',
              'Kill / loss ratio < 0.5 → require additional collateral context',
              'SHIP_KILL attested kills > 0 → count as positive trust evidence',
              'Kills against allied tribe → configurable signal (positive / negative / ignored)',
            ].map(rule => (
              <div key={rule} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                <span style={{ opacity: 0.4, marginTop: 1 }}>☐</span>
                <span>{rule}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, color: 'var(--c-lo)' }}>
              Policy rules are tenant-scoped and configured via operator console — not global reputation judgments.
              See <code>codex/tenant-combat-policy-design</code> for future design.
            </div>
          </div>
        </>
      )}

      {/* ── Operator action affordance ────────────── */}
      <div style={{
        padding: '16px 20px',
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
