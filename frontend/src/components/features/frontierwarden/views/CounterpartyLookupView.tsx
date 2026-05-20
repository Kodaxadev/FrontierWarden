// CounterpartyLookupView — P0 creditor tool: wallet search → dossier pull-up.
// Fetches identity, trust evaluation, vouches, and attestations for any address.

import { useCallback, useEffect, useState } from 'react';
import {
  evaluateTrust,
  fetchEveIdentity,
  fetchVouches,
  fetchGivenVouches,
  fetchScores,
  fetchProfileByOwner,
  fetchAttestations,
} from '../../../../lib/api';
import { normalizeSuiAddress } from '../../../../lib/format';
import type {
  EveIdentity,
  TrustEvaluateResponse,
  VouchRow,
  ProfileRow,
  AttestationRow,
  ScoreRow,
} from '../../../../types/api.types';
import { LoadingSkeleton } from '../LoadingSkeleton';

interface Props {
  onAddToWatchlist?: (address: string, label: string) => void;
  isOnWatchlist?: (address: string) => boolean;
}

function shortAddr(v: string): string {
  if (v.length <= 14) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

interface CounterpartyDossier {
  identity: EveIdentity | null;
  profile: ProfileRow | null;
  scores: ScoreRow[];
  trustResult: TrustEvaluateResponse | null;
  receivedVouches: VouchRow[];
  givenVouches: VouchRow[];
  attestations: AttestationRow[];
}

const EMPTY_DOSSIER: CounterpartyDossier = {
  identity: null, profile: null, scores: [],
  trustResult: null, receivedVouches: [], givenVouches: [], attestations: [],
};

const LOOKUP_HISTORY_KEY = 'fw:lookup-history';
const MAX_HISTORY = 10;

interface LookupHistoryEntry {
  address: string;
  label: string;
  timestamp: string;
}

function loadHistory(): LookupHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(LOOKUP_HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function saveHistory(entries: LookupHistoryEntry[]) {
  localStorage.setItem(LOOKUP_HISTORY_KEY, JSON.stringify(entries));
}

export function CounterpartyLookupView({ onAddToWatchlist, isOnWatchlist }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<CounterpartyDossier>(EMPTY_DOSSIER);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<LookupHistoryEntry[]>(loadHistory);

  const runLookup = useCallback(async () => {
    const address = query.trim();
    if (!address || address.length < 10) { setError('Enter a valid wallet address.'); return; }
    setLoading(true);
    setError(null);
    setSearched(true);
    const normalized = normalizeSuiAddress(address);

    try {
      const [identity, profile, receivedVouches, givenVouches] = await Promise.all([
        fetchEveIdentity(normalized).catch(() => null),
        fetchProfileByOwner(normalized).catch(() => null),
        fetchVouches(normalized, 20).catch(() => [] as VouchRow[]),
        fetchGivenVouches(normalized, 20).catch(() => [] as VouchRow[]),
      ]);

      // Parallel second wave — scores need profile_id, attestations need subject
      const [scores, trustResult, attestations] = await Promise.all([
        profile ? fetchScores(profile.profile_id).catch(() => [] as ScoreRow[]) : Promise.resolve([] as ScoreRow[]),
        evaluateTrust({ entity: normalized, action: 'counterparty_risk', context: { schemaId: 'TRIBE_STANDING', minimumScore: 0 } }).catch(() => null),
        fetchAttestations(normalized, { limit: 50 }).catch(() => [] as AttestationRow[]),
      ]);

      setDossier({ identity, profile, scores, trustResult, receivedVouches, givenVouches, attestations });

      // Record in lookup history
      const entry: LookupHistoryEntry = {
        address: normalized,
        label: identity?.character_name ?? shortAddr(normalized),
        timestamp: new Date().toISOString(),
      };
      setHistory(prev => {
        const next = [entry, ...prev.filter(h => h.address !== normalized)].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDossier(EMPTY_DOSSIER);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const name = dossier.identity?.character_name;
  const tribe = dossier.identity?.tribe_name;
  const topScore = dossier.scores.length > 0 ? Math.max(...dossier.scores.map(s => s.value)) : null;
  const activeAttestations = dossier.attestations.filter(a => !a.revoked);
  const alreadyWatched = isOnWatchlist?.(query.trim()) ?? false;

  return (
    <>
      <div className="c-view__title">Counterparty Lookup</div>
      <div className="c-sub" style={{ marginBottom: 16 }}>
        Enter a wallet address to pull up their full credit dossier — identity, scores, vouches, attestations, and trust evaluation.
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          className="c-input"
          style={{ flex: 1, fontSize: 13 }}
          placeholder="0x... wallet address"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void runLookup(); }}
        />
        <button className="c-commit" disabled={loading || !query.trim()} onClick={() => void runLookup()}>
          {loading ? 'SEARCHING...' : 'LOOKUP'}
        </button>
      </div>

      {/* Recent lookups */}
      {history.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.08em', marginRight: 4 }}>RECENT:</span>
          {history.map(h => (
            <button
              key={h.address}
              className="c-tab"
              style={{ fontSize: 10 }}
              onClick={() => { setQuery(h.address); }}
            >
              {h.label}
            </button>
          ))}
          <button className="c-tab" style={{ fontSize: 9, color: 'var(--c-mid)' }} onClick={() => { setHistory([]); localStorage.removeItem(LOOKUP_HISTORY_KEY); }}>
            CLEAR
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--c-border)', color: 'var(--c-crimson)', fontSize: 12, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading && <LoadingSkeleton variant="stats" />}

      {searched && !loading && !error && (
        <div style={{ display: 'grid', gap: 20 }}>

          {/* Identity header */}
          <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="c-stat__label" style={{ marginBottom: 6 }}>Subject</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-hi)' }}>
                  {name ?? shortAddr(query.trim())}
                </div>
                <div className="c-sub" style={{ marginTop: 4, fontFamily: 'var(--c-mono)' }}>
                  {query.trim()}
                </div>
                {tribe && <div className="c-sub" style={{ marginTop: 4 }}>Tribe: {tribe}</div>}
                {dossier.identity?.tenant && <div className="c-sub">Tenant: {dossier.identity.tenant}</div>}
                {dossier.profile && <div className="c-sub">Profile: {shortAddr(dossier.profile.profile_id)}</div>}
              </div>
              {onAddToWatchlist && (
                <button
                  className="c-commit"
                  style={{ fontSize: 10, padding: '6px 12px' }}
                  disabled={alreadyWatched}
                  onClick={() => onAddToWatchlist(query.trim(), name ?? shortAddr(query.trim()))}
                >
                  {alreadyWatched ? 'ON WATCHLIST' : '+ WATCHLIST'}
                </button>
              )}
            </div>
          </section>

          {/* Quick stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 1, border: '1px solid var(--c-border)', background: 'var(--c-border)',
          }}>
            {[
              { k: 'Top Score', v: topScore !== null ? topScore.toString() : '—' },
              { k: 'Trust Decision', v: dossier.trustResult?.decision ?? '—' },
              { k: 'Confidence', v: dossier.trustResult ? `${Math.round(dossier.trustResult.confidence * 100)}%` : '—' },
              { k: 'Vouches Received', v: dossier.receivedVouches.length.toString() },
              { k: 'Vouches Given', v: dossier.givenVouches.length.toString() },
              { k: 'Attestations', v: `${activeAttestations.length} active` },
            ].map(s => (
              <div key={s.k} style={{ background: 'var(--c-surface)', padding: '14px 16px' }}>
                <div className="c-stat__label">{s.k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-hi)', letterSpacing: '-0.02em', marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Trust evaluation detail */}
          {dossier.trustResult && (
            <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
              <div className="c-stat__label" style={{ marginBottom: 10 }}>Trust Evaluation · counterparty_risk</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <KV label="Decision" value={dossier.trustResult.decision} color={dossier.trustResult.allow ? 'var(--c-green, #5ee28a)' : 'var(--c-crimson)'} />
                <KV label="Score" value={dossier.trustResult.score?.toString() ?? '—'} />
                <KV label="Threshold" value={dossier.trustResult.threshold?.toString() ?? '—'} />
                <KV label="Reason" value={dossier.trustResult.reason} />
              </div>
              <div className="c-sub" style={{ marginTop: 10 }}>{dossier.trustResult.explanation}</div>
            </section>
          )}

          {/* Scores */}
          {dossier.scores.length > 0 && (
            <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
              <div className="c-stat__label" style={{ marginBottom: 10 }}>Indexed Scores</div>
              <table className="c-table">
                <thead>
                  <tr><th>Schema</th><th>Value</th><th>Issuer</th><th style={{ textAlign: 'right' }}>Checkpoint</th></tr>
                </thead>
                <tbody>
                  {dossier.scores.map(s => (
                    <tr key={`${s.schema_id}-${s.issuer}`}>
                      <td style={{ fontSize: 12 }}>{s.schema_id}</td>
                      <td style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-amber)' }}>{s.value}</td>
                      <td style={{ fontSize: 10, color: 'var(--c-mid)', fontFamily: 'var(--c-mono)' }}>{shortAddr(s.issuer)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--c-mid)' }}>{s.last_checkpoint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Vouches */}
          <VouchSection title="Vouches Received" vouches={dossier.receivedVouches} emptyText="No vouches received." />
          <VouchSection title="Vouches Given" vouches={dossier.givenVouches} emptyText="No vouches given." />

          {/* Attestations */}
          {dossier.attestations.length > 0 && (
            <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
              <div className="c-stat__label" style={{ marginBottom: 10 }}>Attestations ({activeAttestations.length} active / {dossier.attestations.length} total)</div>
              <table className="c-table">
                <thead>
                  <tr><th>Schema</th><th>Value</th><th>Issuer</th><th>Status</th><th style={{ textAlign: 'right' }}>Tx</th></tr>
                </thead>
                <tbody>
                  {dossier.attestations.map(a => (
                    <tr key={a.attestation_id}>
                      <td style={{ fontSize: 12 }}>{a.schema_id}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: a.revoked ? 'var(--c-mid)' : 'var(--c-amber)' }}>{a.value}</td>
                      <td style={{ fontSize: 10, color: 'var(--c-mid)', fontFamily: 'var(--c-mono)' }}>{shortAddr(a.issuer)}</td>
                      <td>
                        <span className={`c-badge ${a.revoked ? 'c-badge--expired' : 'c-badge--ok'}`}>
                          {a.revoked ? 'REVOKED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 10, fontFamily: 'var(--c-mono)', color: 'var(--c-mid)' }}>{shortAddr(a.issued_tx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

        </div>
      )}
    </>
  );
}

function KV({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="c-stat__label">{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--c-hi)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function VouchSection({ title, vouches, emptyText }: { title: string; vouches: VouchRow[]; emptyText: string }) {
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>{title} ({vouches.length})</div>
      {vouches.length === 0 ? (
        <div className="c-sub">{emptyText}</div>
      ) : (
        <table className="c-table">
          <thead>
            <tr><th>Voucher</th><th>Vouchee</th><th>Stake</th><th>Status</th><th style={{ textAlign: 'right' }}>Created</th></tr>
          </thead>
          <tbody>
            {vouches.map(v => (
              <tr key={v.vouch_id}>
                <td style={{ fontSize: 10, fontFamily: 'var(--c-mono)' }}>{shortAddr(v.voucher)}</td>
                <td style={{ fontSize: 10, fontFamily: 'var(--c-mono)' }}>{shortAddr(v.vouchee)}</td>
                <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-amber)' }}>{formatMist(v.stake_amount)}</td>
                <td>
                  <span className={`c-badge ${v.redeemed ? 'c-badge--expired' : 'c-badge--ok'}`}>
                    {v.redeemed ? 'REDEEMED' : 'ACTIVE'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontSize: 10, color: 'var(--c-mid)' }}>{v.created_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatMist(value: number | null): string {
  if (!value) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} SUI`;
  return `${value.toLocaleString()} MIST`;
}
