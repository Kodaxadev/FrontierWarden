// OracleView — oracle console: issue/revoke attestations + schema registry management.
// Issue attestation: gas station (deployer key) signs directly — no wallet needed.
// Revoke, register schema, deprecate schema: direct wallet TX (oracle/admin wallet).

import { useCallback, useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { fetchAttestationFeed, fetchSchemas, fetchOracles, issueAttestation } from '../../../../lib/api';
import type { AttestationFeedRow, SchemaRow, OracleRow } from '../../../../types/api.types';
import { LiveStatus } from '../LiveStatus';
import { useSchemaActions } from '../../../../hooks/useSchemaActions';
import { useRevokeAttestation } from '../../../../hooks/useRevokeAttestation';

// Schemas the deployer oracle is authorized to issue.
const AUTHORIZED_SCHEMAS = [
  'TRIBE_STANDING',
  'CREDIT',
  'GATE_HOSTILE', 'GATE_CAMPED', 'GATE_CLEAR', 'GATE_TOLL',
  'HEAT_TRAP', 'ROUTE_VERIFIED', 'SYSTEM_CONTESTED',
  'SHIP_KILL', 'PLAYER_BOUNTY',
] as const;

const ORACLE_ADDRESS =
  import.meta.env.VITE_ORACLE_ADDRESS
  ?? '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';

const DEFAULT_EXPIRY = 200;

function shortId(v: string) {
  return v.length <= 14 ? v : `${v.slice(0, 6)}...${v.slice(-4)}`;
}

interface IssueResult { digest: string; attestationId: string | null }

export function OracleView() {
  // ── gas-station issue (no wallet needed) ────────────────────────────────────
  const [schemaId, setSchemaId]       = useState<string>(AUTHORIZED_SCHEMAS[0]);
  const [subject, setSubject]         = useState('');
  const [value, setValue]             = useState(500);
  const [expiry, setExpiry]           = useState(DEFAULT_EXPIRY);
  const [submitting, setSubmitting]   = useState(false);
  const [result, setResult]           = useState<IssueResult | null>(null);
  const [issueError, setIssueError]   = useState<string | null>(null);

  // ── revoke attestation (wallet TX) ───────────────────────────────────────────
  const { account, revokeAttestation, state: revokeState, reset: revokeReset } = useRevokeAttestation();
  const [revokeId, setRevokeId] = useState('');

  // ── schema registry (wallet TX) ─────────────────────────────────────────────
  const { registerSchema, deprecateSchema, state: schemaState, reset: schemaReset } = useSchemaActions();
  const [regSchemaId,  setRegSchemaId]  = useState('');
  const [regVersion,   setRegVersion]   = useState(1);
  const [regResolver,  setRegResolver]  = useState('');
  const [regRevocable, setRegRevocable] = useState(true);
  const [depOldId,     setDepOldId]     = useState('');
  const [depNewId,     setDepNewId]     = useState('');

  const [feed, setFeed]               = useState<AttestationFeedRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [schemas, setSchemas]         = useState<SchemaRow[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [oracles, setOracles]         = useState<OracleRow[]>([]);
  const [oraclesLoading, setOraclesLoading] = useState(true);

  const loadSchemas = useCallback(async () => {
    try { setSchemas(await fetchSchemas(50)); } catch { /* silent */ }
    finally { setSchemasLoading(false); }
  }, []);

  const loadOracles = useCallback(async () => {
    try { setOracles(await fetchOracles(50)); } catch { /* silent */ }
    finally { setOraclesLoading(false); }
  }, []);

  const loadFeed = useCallback(async () => {
    try {
      const rows = await fetchAttestationFeed({ limit: 15 });
      setFeed(rows);
    } catch {
      // silent — feed is decorative
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => { void loadFeed(); }, [loadFeed]);
  useEffect(() => { void loadSchemas(); }, [loadSchemas]);
  useEffect(() => { void loadOracles(); }, [loadOracles]);
  // Refresh schemas index after a successful register/deprecate
  useEffect(() => {
    if (schemaState.step === 'done') setTimeout(() => void loadSchemas(), 6000);
  }, [schemaState.step, loadSchemas]);

  const subjectValid = /^0x[0-9a-fA-F]{64}$/.test(subject);
  const canIssue = subjectValid && value >= 0 && expiry > 0 && !submitting;

  async function handleIssue() {
    if (!canIssue) return;
    setSubmitting(true);
    setResult(null);
    setIssueError(null);
    try {
      const r = await issueAttestation({
        schema_id:          schemaId,
        subject,
        value,
        expiration_epochs:  expiry,
      });
      setResult(r);
      // Refresh feed after a short delay for indexer to catch up
      setTimeout(() => void loadFeed(), 6000);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="c-view__title">Oracle Console</div>
      <LiveStatus
        loading={false}
        live={true}
        liveText={`Oracle · ${shortId(ORACLE_ADDRESS)}`}
        emptyText="Oracle offline"
      />

      {/* ── Status strip ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 32, flexWrap: 'wrap',
        marginBottom: 28, padding: '12px 16px',
        border: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.012)',
        fontSize: 11,
      }}>
        <div>
          <div className="c-stat__label">Oracle Address</div>
          <div style={{ color: 'var(--c-hi)', fontFamily: 'monospace', marginTop: 3 }}>
            {ORACLE_ADDRESS}
          </div>
        </div>
        <div>
          <div className="c-stat__label">Authorized Schemas</div>
          <div style={{ color: 'var(--c-mid)', marginTop: 3 }}>
            {AUTHORIZED_SCHEMAS.join(' · ')}
          </div>
        </div>
      </div>

      {/* ── Issue Attestation form ──────────────────────────────────────── */}
      <div style={{
        maxWidth: 760, marginBottom: 36,
        padding: 20, border: '1px solid var(--c-border)',
        background: 'rgba(0,210,255,0.018)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Issue Attestation</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <label>
            <div className="c-policy__label">Schema</div>
            <select
              className="c-input"
              value={schemaId}
              onChange={e => setSchemaId(e.target.value)}
            >
              {AUTHORIZED_SCHEMAS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            <div className="c-policy__label">Subject Address</div>
            <input
              className="c-input"
              placeholder="0x…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{ borderColor: subject && !subjectValid ? 'var(--c-crimson)' : '' }}
            />
          </label>
          <label>
            <div className="c-policy__label">Value</div>
            <input className="c-input" type="number" min={0} step={1}
              value={value} onChange={e => setValue(Number(e.target.value))} />
          </label>
          <label>
            <div className="c-policy__label">Expiry (epochs)</div>
            <input className="c-input" type="number" min={1} step={1}
              value={expiry} onChange={e => setExpiry(Number(e.target.value))} />
          </label>
        </div>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="c-commit"
            disabled={!canIssue}
            title={!subjectValid ? 'Enter a valid 0x address' : 'Issue attestation via oracle node'}
            onClick={() => void handleIssue()}
          >
            {submitting ? 'ISSUING…' : 'ISSUE ATTESTATION'}
          </button>
          {result && (
            <span style={{ fontSize: 10, color: 'var(--c-green)' }}>
              ✓ issued · tx {shortId(result.digest)}
              {result.attestationId ? ` · obj ${shortId(result.attestationId)}` : ''}
            </span>
          )}
          {issueError && (
            <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{issueError}</span>
          )}
        </div>
      </div>

      {/* ── Revoke Attestation ──────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 28, padding: 20, border: '1px solid var(--c-border)', background: 'rgba(255,80,80,0.018)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Revoke Attestation</div>
        <div className="c-sub" style={{ marginBottom: 12 }}>Caller must be the attestation issuer. Schema must have revocable = true.</div>
        {!account && <div style={{ marginBottom: 10 }}><div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div></div>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <div className="c-policy__label">Attestation Object ID</div>
            <input className="c-input" placeholder="0x…" value={revokeId} onChange={e => setRevokeId(e.target.value)}
              style={{ borderColor: revokeId && !/^0x[0-9a-fA-F]+$/.test(revokeId) ? 'var(--c-crimson)' : '' }} />
          </label>
          <button className="c-commit" disabled={!account || !revokeId || revokeState.step === 'signing'}
            onClick={() => void revokeAttestation({ attestationId: revokeId })}>
            {revokeState.step === 'signing' ? 'SIGNING…' : 'REVOKE'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, display: 'flex', gap: 16, alignItems: 'center' }}>
          {revokeState.step === 'done' && <span style={{ color: 'var(--c-green)' }}>&#10003; revoked &middot; tx {shortId(revokeState.digest ?? '')}</span>}
          {revokeState.step === 'error' && <span style={{ color: 'var(--c-crimson)' }}>{revokeState.error}</span>}
          {revokeState.step !== 'idle' && <button className="c-tab" onClick={revokeReset}>CLEAR</button>}
        </div>
      </div>

      {/* ── Schema Registry ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 28, padding: 20, border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Schema Registry</div>
        <div className="c-sub" style={{ marginBottom: 14 }}>Admin only. Schema IDs are ASCII strings (e.g. GATE_HOSTILE). Connect the deployer/governance wallet.</div>
        {!account && <div style={{ marginBottom: 12 }}><div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div></div>}
        <div className="c-policy__label" style={{ marginBottom: 8 }}>Register Schema</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 12 }}>
          <label>
            <div className="c-policy__label">Schema ID</div>
            <input className="c-input" placeholder="MY_SCHEMA" value={regSchemaId} onChange={e => setRegSchemaId(e.target.value.toUpperCase())} />
          </label>
          <label>
            <div className="c-policy__label">Version</div>
            <input className="c-input" type="number" min={1} value={regVersion} onChange={e => setRegVersion(Number(e.target.value))} />
          </label>
          <label>
            <div className="c-policy__label">Resolver (optional)</div>
            <input className="c-input" placeholder="0x… or leave blank" value={regResolver} onChange={e => setRegResolver(e.target.value)} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, cursor: 'pointer', marginTop: 20 }}>
            <input type="checkbox" checked={regRevocable} onChange={e => setRegRevocable(e.target.checked)} />
            Revocable
          </label>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
          <button className="c-commit" disabled={!account || !regSchemaId.trim() || schemaState.step === 'signing'}
            onClick={() => void registerSchema({ schemaId: regSchemaId.trim(), version: regVersion, resolver: regResolver.trim() || null, revocable: regRevocable })}>
            {schemaState.step === 'signing' ? 'SIGNING…' : 'REGISTER SCHEMA'}
          </button>
          {schemaState.step === 'done' && <span style={{ fontSize: 10, color: 'var(--c-green)' }}>&#10003; tx {shortId(schemaState.digest ?? '')}</span>}
          {schemaState.step === 'error' && <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{schemaState.error}</span>}
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
          <div className="c-policy__label" style={{ marginBottom: 8 }}>Deprecate Schema</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: 1 }}>
              <div className="c-policy__label">Old Schema ID</div>
              <input className="c-input" placeholder="OLD_SCHEMA" value={depOldId} onChange={e => setDepOldId(e.target.value.toUpperCase())} />
            </label>
            <label style={{ flex: 1 }}>
              <div className="c-policy__label">Replacement Schema ID</div>
              <input className="c-input" placeholder="NEW_SCHEMA" value={depNewId} onChange={e => setDepNewId(e.target.value.toUpperCase())} />
            </label>
            <button className="c-commit" disabled={!account || !depOldId.trim() || !depNewId.trim() || schemaState.step === 'signing'}
              onClick={() => void deprecateSchema({ oldSchemaId: depOldId.trim(), newSchemaId: depNewId.trim() })}>
              {schemaState.step === 'signing' ? 'SIGNING…' : 'DEPRECATE'}
            </button>
          </div>
        </div>
        {schemaState.step !== 'idle' && <button className="c-tab" style={{ marginTop: 12 }} onClick={schemaReset}>CLEAR STATUS</button>}
      </div>

      {/* ── Registered Schemas index ───────────────────────────────────── */}
      <div className="c-view__title" style={{ marginBottom: 10 }}>
        Registered Schemas
        <button className="c-tab" style={{ marginLeft: 14 }} onClick={() => void loadSchemas()}>REFRESH</button>
      </div>
      {schemasLoading && <div className="c-sub">Loading…</div>}
      {!schemasLoading && schemas.length === 0 && <div className="c-sub">No schemas indexed yet.</div>}
      {schemas.length > 0 && (
        <table className="c-table" style={{ marginBottom: 28 }}>
          <thead><tr><th>Schema ID</th><th>Ver</th><th>Resolver</th><th>Deprecated By</th><th style={{ textAlign: 'right' }}>Registered At</th></tr></thead>
          <tbody>
            {schemas.map(s => (
              <tr key={s.schema_id} style={{ opacity: s.deprecated_by ? 0.45 : 1 }}>
                <td style={{ color: 'var(--c-hi)', fontFamily: 'monospace' }}>{s.schema_id}</td>
                <td>{s.version}</td>
                <td style={{ fontSize: 11, color: 'var(--c-mid)' }}>{s.resolver ? shortId(s.resolver) : '—'}</td>
                <td style={{ fontSize: 11, color: s.deprecated_by ? 'var(--c-crimson)' : 'var(--c-mid)' }}>
                  {s.deprecated_by ? shortId(s.deprecated_by) : 'active'}
                </td>
                <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--c-mid)' }}>
                  {s.registered_at ? new Date(s.registered_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Registered Oracles index ───────────────────────────────────── */}
      <div className="c-view__title" style={{ marginBottom: 10 }}>
        Registered Oracles
        <button className="c-tab" style={{ marginLeft: 14 }} onClick={() => void loadOracles()}>REFRESH</button>
      </div>
      {oraclesLoading && <div className="c-sub">Loading…</div>}
      {!oraclesLoading && oracles.length === 0 && <div className="c-sub">No oracles indexed yet.</div>}
      {oracles.length > 0 && (
        <table className="c-table" style={{ marginBottom: 28 }}>
          <thead><tr><th>Name</th><th>Address</th><th>TEE</th><th>System</th><th style={{ textAlign: 'right' }}>Registered At</th></tr></thead>
          <tbody>
            {oracles.map(o => (
              <tr key={o.oracle_address}>
                <td style={{ color: 'var(--c-hi)' }}>{o.name}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{shortId(o.oracle_address)}</td>
                <td style={{ color: o.tee_verified ? 'var(--c-green)' : 'var(--c-mid)', fontSize: 11 }}>
                  {o.tee_verified ? '✓ TEE' : '—'}
                </td>
                <td style={{ color: o.is_system_oracle ? 'var(--c-amber)' : 'var(--c-mid)', fontSize: 11 }}>
                  {o.is_system_oracle ? 'system' : 'third-party'}
                </td>
                <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--c-mid)' }}>
                  {o.registered_at ? new Date(o.registered_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Recent attestation feed ─────────────────────────────────────── */}
      <div className="c-view__title" style={{ marginBottom: 10 }}>Recent Attestations</div>
      {feedLoading && <div className="c-sub">Loading…</div>}
      {!feedLoading && feed.length === 0 && (
        <div className="c-sub">No attestations indexed yet.</div>
      )}
      {feed.length > 0 && (
        <table className="c-table">
          <thead>
            <tr>
              <th>Schema</th>
              <th>Subject</th>
              <th>Value</th>
              <th>Issuer</th>
              <th style={{ textAlign: 'right' }}>Tx</th>
            </tr>
          </thead>
          <tbody>
            {feed.map(row => (
              <tr key={row.attestation_id} style={{ opacity: row.revoked ? 0.45 : 1 }}>
                <td>
                  <div style={{ fontSize: 12 }}>{row.schema_id}</div>
                  <div className="c-sub">{shortId(row.attestation_id)}</div>
                </td>
                <td>{shortId(row.subject)}</td>
                <td style={{ color: 'var(--c-amber)' }}>{row.value}</td>
                <td style={{ color: 'var(--c-mid)', fontSize: 11 }}>{shortId(row.issuer)}</td>
                <td style={{ textAlign: 'right', fontSize: 11 }}>{shortId(row.issued_tx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
