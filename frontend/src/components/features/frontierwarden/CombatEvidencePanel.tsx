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
import { deriveCombatSignals } from './combat-signals';
import { SignalChip, KillRow, EmptyState } from './KillRow';

interface Props {
  /** EVM wallet address of the subject being viewed. */
  address: string | null | undefined;
  /** Count of non-revoked SHIP_KILL attestations for this address (Layer 2 signal). */
  shipKillAttestationCount?: number;
}

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
