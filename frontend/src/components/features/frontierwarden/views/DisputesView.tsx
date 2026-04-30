import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { fetchChallenges, fetchChallengeStats } from '../../../../lib/api';
import type { FraudChallengeRow, ChallengeStatsRow } from '../../../../types/api.types';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import { useDisputeActions } from '../../../../hooks/useDisputeActions';

const DEFAULT_ORACLE =
  import.meta.env.VITE_ORACLE_ADDRESS
  ?? '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';
const DEFAULT_ATTESTATION =
  import.meta.env.VITE_TRIBE_STANDING_ATTESTATION_ID
  ?? '0xdbcd4f81119c2713de0e5bd2e2a7342ac1fd7bd3214e01e2e8e38bf0554e8e88';
const MIN_CHALLENGE_STAKE = 500_000_000;

function shortId(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatMist(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(3)} SUI`;
  return `${value.toLocaleString()} MIST`;
}

interface DisputesViewProps {
  provenance?: Provenance;
}

export function DisputesView({ provenance }: DisputesViewProps = {}) {
  const { account, createChallenge, reset, resolveChallenge, state, voteChallenge } = useDisputeActions();
  const [rows, setRows] = useState<FraudChallengeRow[]>([]);
  const [stats, setStats] = useState<ChallengeStatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attestationId, setAttestationId] = useState(DEFAULT_ATTESTATION);
  const [oracleAddress, setOracleAddress] = useState(DEFAULT_ORACLE);
  const [evidence, setEvidence] = useState('manual-review');
  const [stakeMist, setStakeMist] = useState(MIN_CHALLENGE_STAKE);
  const [selectedChallenge, setSelectedChallenge] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    try {
      setLoadError(null);
      const [next, nextStats] = await Promise.all([
        fetchChallenges(50),
        fetchChallengeStats().catch(() => null),
      ]);
      setRows(next);
      setStats(nextStats);
      setSelectedChallenge(current => current || next.find(row => !row.resolved)?.challenge_id || next[0]?.challenge_id || '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'challenge feed failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  useEffect(() => {
    if (state.step !== 'done') return;
    const t = window.setTimeout(() => void loadRows(), 7_000);
    return () => window.clearTimeout(t);
  }, [loadRows, state.step, state.digest]);

  const activeCount = useMemo(() => rows.filter(row => !row.resolved).length, [rows]);
  const busy = state.step === 'signing';
  const attestationValid = /^0x[0-9a-fA-F]{64}$/.test(attestationId);
  const oracleValid = /^0x[0-9a-fA-F]{64}$/.test(oracleAddress);
  const canCreate = Boolean(account && attestationValid && oracleValid && evidence.trim() && stakeMist >= MIN_CHALLENGE_STAKE && !busy);
  const canAct = Boolean(account && selectedChallenge && !busy);

  return (
    <>
      <div className="c-view__title">Dispute Console</div>
      <LiveStatus
        loading={loading}
        live={rows.length > 0}
        error={loadError}
        provenance={provenance}
        liveText={`${activeCount} active challenges`}
        emptyText="No fraud challenges indexed"
      />

      {/* ── Challenge Stats Panel ─────────────────────────────────────── */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 1, marginBottom: 28,
          border: '1px solid var(--c-border)',
          background: 'var(--c-border)',
        }}>
          {[
            { k: 'Total',       v: stats.total.toString() },
            { k: 'Active',      v: stats.active.toString() },
            { k: 'Resolved',    v: stats.resolved.toString() },
            { k: 'Guilty',      v: stats.guilty_count.toString() },
            { k: 'Cleared',     v: stats.cleared_count.toString() },
            { k: 'Guilty Rate', v: stats.guilty_rate != null ? `${stats.guilty_rate.toFixed(1)}%` : '—' },
            { k: 'Total Slashed', v: formatMist(stats.total_slashed) },
          ].map(s => (
            <div key={s.k} style={{
              background: 'var(--c-surface)',
              padding: '14px 16px',
            }}>
              <div className="c-stat__label">{s.k}</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: 'var(--c-hi)',
                letterSpacing: '-0.02em', marginTop: 4,
              }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        maxWidth: 980,
        marginBottom: 28,
        padding: 20,
        border: '1px solid var(--c-border)',
        background: 'rgba(0,210,255,0.018)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Open Fraud Challenge</div>
        {!account && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div>
            <span className="c-sub">Connect the challenger wallet. Opening a challenge stakes 0.5 SUI minimum.</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          <label>
            <div className="c-policy__label">Attestation Object</div>
            <input
              className="c-input"
              value={attestationId}
              onChange={event => setAttestationId(event.target.value)}
              style={{ borderColor: attestationId && !attestationValid ? 'var(--c-crimson)' : '' }}
            />
          </label>
          <label>
            <div className="c-policy__label">Oracle Address</div>
            <input
              className="c-input"
              value={oracleAddress}
              onChange={event => setOracleAddress(event.target.value)}
              style={{ borderColor: oracleAddress && !oracleValid ? 'var(--c-crimson)' : '' }}
            />
          </label>
          <label>
            <div className="c-policy__label">Evidence Hash / Note</div>
            <input className="c-input" value={evidence} onChange={event => setEvidence(event.target.value)} />
          </label>
          <label>
            <div className="c-policy__label">Stake (MIST)</div>
            <input
              className="c-input"
              type="number"
              min={MIN_CHALLENGE_STAKE}
              step={1}
              value={stakeMist}
              onChange={event => setStakeMist(Number(event.target.value))}
            />
          </label>
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="c-commit"
            disabled={!canCreate}
            title={!account ? 'Connect challenger wallet' : 'Create fraud challenge'}
            onClick={() => void createChallenge({
              attestationId,
              oracleAddress,
              evidence,
              stakeMist: BigInt(stakeMist),
            })}
          >
            {busy ? 'SIGNING' : 'OPEN CHALLENGE'}
          </button>
          <span style={{ fontSize: 10, color: state.step === 'error' ? 'var(--c-crimson)' : 'var(--c-mid)' }}>
            {state.step === 'done' && state.digest
              ? `tx ${shortId(state.digest)}`
              : state.error ?? 'Challenge stake is paid by the connected wallet'}
          </span>
        </div>
      </div>

      <div style={{
        maxWidth: 980,
        marginBottom: 28,
        padding: 20,
        border: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.018)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Council Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 260px' }}>
            <div className="c-policy__label">Challenge</div>
            <select className="c-input" value={selectedChallenge} onChange={event => setSelectedChallenge(event.target.value)}>
              <option value="">Select challenge</option>
              {rows.map(row => (
                <option key={row.challenge_id} value={row.challenge_id}>
                  {shortId(row.challenge_id)} {row.resolved ? '(resolved)' : '(active)'}
                </option>
              ))}
            </select>
          </label>
          <button className="c-commit" disabled={!canAct} onClick={() => void voteChallenge({ challengeId: selectedChallenge, guilty: true })}>
            VOTE GUILTY
          </button>
          <button className="c-commit" disabled={!canAct} onClick={() => void voteChallenge({ challengeId: selectedChallenge, guilty: false })}>
            VOTE CLEAR
          </button>
          <button className="c-commit" disabled={!canAct} onClick={() => void resolveChallenge({ challengeId: selectedChallenge })}>
            RESOLVE
          </button>
        </div>
        <div className="c-sub" style={{ marginTop: 10 }}>
          Voting requires the connected wallet to be a council member. Resolving requires the challenge deadline to have passed.
        </div>
      </div>

      {rows.length === 0 && !loading && <div className="c-sub">No challenge rows indexed yet.</div>}
      {rows.length > 0 && (
        <table className="c-table">
          <thead>
            <tr>
              <th>Challenge</th>
              <th>Attestation</th>
              <th>Challenger</th>
              <th>Oracle</th>
              <th>Status</th>
              <th>Slash</th>
              <th style={{ textAlign: 'right' }}>Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.challenge_id} style={{
                cursor: 'pointer',
                background: hoveredRow === row.challenge_id
                  ? 'rgba(0,210,255,0.06)'
                  : selectedChallenge === row.challenge_id
                    ? 'rgba(0,210,255,0.04)'
                    : undefined,
              }} onClick={() => setSelectedChallenge(row.challenge_id)}
                onMouseEnter={() => setHoveredRow(row.challenge_id)}
                onMouseLeave={() => setHoveredRow(null)}>
                <td>
                  <div style={{ fontSize: 12 }}>{shortId(row.challenge_id)}</div>
                  <div className="c-sub">{row.created_at}</div>
                </td>
                <td>{shortId(row.attestation_id)}</td>
                <td>
                  <div style={{ fontSize: 11, fontFamily: 'var(--c-mono)' }}>{shortId(row.challenger)}</div>
                </td>
                <td>{shortId(row.oracle)}</td>
                <td style={{ color: row.resolved ? (row.guilty ? 'var(--c-crimson)' : 'var(--c-green)') : 'var(--c-amber)' }}>
                  {row.resolved ? (row.guilty ? 'GUILTY' : 'CLEARED') : 'OPEN'}
                </td>
                <td>{formatMist(row.slash_amount)}</td>
                <td style={{ textAlign: 'right', fontSize: 11 }}>
                  {row.resolved_tx ? shortId(row.resolved_tx) : shortId(row.created_tx)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.step !== 'idle' && (
        <button className="c-tab" style={{ marginTop: 18 }} onClick={reset}>CLEAR</button>
      )}
    </>
  );
}
