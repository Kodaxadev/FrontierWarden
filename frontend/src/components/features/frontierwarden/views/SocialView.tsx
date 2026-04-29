// SocialView — operator workflows for profiles, vouches, loans, and oracle registration.
import { useCallback, useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { fetchVouches, fetchGivenVouches, fetchProfileByOwner } from '../../../../lib/api';
import type { VouchRow, ProfileRow } from '../../../../types/api.types';
import { LiveStatus } from '../LiveStatus';
import { useProfileCreate } from '../../../../hooks/useProfileCreate';
import { useVouchActions } from '../../../../hooks/useVouchActions';
import { useLendingActions } from '../../../../hooks/useLendingActions';
import { useOracleRegister } from '../../../../hooks/useOracleRegister';
import { ORACLE_MIN_STAKE_MIST, SYSTEM_MIN_STAKE_MIST } from '../../../../lib/tx-oracle-register';

const shortId = (v: string) => v.length <= 14 ? v : `${v.slice(0, 6)}…${v.slice(-4)}`;
const formatSui = (mist: number) => `${(mist / 1e9).toFixed(3)} SUI`;

// ── shared status line ───────────────────────────────────────────────────────
function StatusLine({ step, digest, error }: { step: string; digest: string | null; error: string | null }) {
  if (step === 'idle') return null;
  if (step === 'signing') return <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>Waiting for wallet…</span>;
  if (step === 'done')    return <span style={{ fontSize: 10, color: 'var(--c-green)' }}>✓ tx {digest ? shortId(digest) : ''}</span>;
  return <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{error}</span>;
}

export function SocialView() {
  // ── profile ─────────────────────────────────────────────────────────────────
  const { account, createProfile, state: profState, reset: profReset } = useProfileCreate();

  // ── vouch ───────────────────────────────────────────────────────────────────
  const { createVouch, redeemVouch, state: vouchState, reset: vouchReset } = useVouchActions();
  const [profileId,   setProfileId]   = useState('');
  const [vouchee,     setVouchee]     = useState('');
  const [vouchStake,  setVouchStake]  = useState(1_000_000_000);
  const [vouchObjId,  setVouchObjId]  = useState('');

  // ── lending ─────────────────────────────────────────────────────────────────
  const { repayLoan, markDefault, state: lendState, reset: lendReset } = useLendingActions();
  const [loanId,        setLoanId]        = useState('');
  const [repaymentMist, setRepaymentMist] = useState(1_000_000_000);
  const [markLoanId,    setMarkLoanId]    = useState('');

  // ── oracle registration ──────────────────────────────────────────────────────
  const { registerOracle, state: oracleState, reset: oracleReset } = useOracleRegister();
  const [oracleName,    setOracleName]    = useState('');
  const [oracleSchemas, setOracleSchemas] = useState('');
  const [isSystemOracle, setIsSystemOracle] = useState(false);
  const [teeVerified,   setTeeVerified]   = useState(false);
  const [teeHash,       setTeeHash]       = useState('none');
  const minStake = isSystemOracle ? SYSTEM_MIN_STAKE_MIST : ORACLE_MIN_STAKE_MIST;

  // ── profile lookup (for post-create_profile UX) ─────────────────────────────
  const [myProfile,     setMyProfile]     = useState<ProfileRow | null>(null);
  const [profileLookup, setProfileLookup] = useState(false);

  const lookupProfile = useCallback(async () => {
    if (!account) return;
    setProfileLookup(true);
    try {
      const p = await fetchProfileByOwner(account.address);
      setMyProfile(p);
      if (p) setProfileId(p.profile_id);
    } catch { /* silent */ }
    finally { setProfileLookup(false); }
  }, [account]);

  // Auto-lookup on wallet connect
  useEffect(() => { void lookupProfile(); }, [lookupProfile]);

  // Re-lookup 8s after profile creation (indexer lag)
  useEffect(() => {
    if (profState.step !== 'done') return;
    const t = window.setTimeout(() => void lookupProfile(), 8_000);
    return () => window.clearTimeout(t);
  }, [profState.step, profState.digest, lookupProfile]);

  // ── vouch feed ───────────────────────────────────────────────────────────────
  const [receivedVouches, setReceivedVouches] = useState<VouchRow[]>([]);
  const [givenVouches,    setGivenVouches]    = useState<VouchRow[]>([]);
  const [feedLoading,     setFeedLoading]     = useState(false);

  const loadVouches = useCallback(async () => {
    if (!account) return;
    setFeedLoading(true);
    try {
      const [received, given] = await Promise.all([
        fetchVouches(account.address, 20),
        fetchGivenVouches(account.address, 20),
      ]);
      setReceivedVouches(received);
      setGivenVouches(given);
    } catch { /* silent */ }
    finally { setFeedLoading(false); }
  }, [account]);

  useEffect(() => { void loadVouches(); }, [loadVouches]);

  const busy = profState.step === 'signing' || vouchState.step === 'signing'
    || lendState.step === 'signing' || oracleState.step === 'signing';

  const addrValid = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);
  const objValid  = (s: string) => /^0x[0-9a-fA-F]{1,64}$/.test(s);

  return (
    <>
      <div className="c-view__title">Social &amp; Protocol Actions</div>
      <LiveStatus loading={false} live={!!account} liveText={account ? `Wallet ${shortId(account.address)}` : 'No wallet connected'} emptyText="Connect a wallet to sign transactions" />

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(0,210,255,0.018)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Create Reputation Profile</div>
        <div className="c-sub" style={{ marginBottom: 12 }}>Creates a SBT-style profile for the connected wallet. One profile per address.</div>
        {!account && <div style={{ marginBottom: 10 }}><div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div></div>}
        {myProfile && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,210,255,0.04)', border: '1px solid var(--c-border)', fontSize: 11 }}>
            <span className="c-stat__label">Profile found · </span>
            <span style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{myProfile.profile_id}</span>
            <span className="c-sub"> (auto-filled below)</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button className="c-commit" disabled={!account || busy} onClick={() => void createProfile()}>
            {profState.step === 'signing' ? 'SIGNING…' : 'CREATE PROFILE'}
          </button>
          <button className="c-tab" disabled={!account || profileLookup} onClick={() => void lookupProfile()}>
            {profileLookup ? 'LOOKING UP…' : 'LOOKUP MY PROFILE'}
          </button>
          <StatusLine {...profState} />
          {profState.step !== 'idle' && <button className="c-tab" onClick={profReset}>CLEAR</button>}
        </div>
      </div>

      {/* ── Vouch ───────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Create Vouch</div>
        <div className="c-sub" style={{ marginBottom: 12 }}>Voucher must have CREDIT score ≥ 300. Stake is locked until the vouch expires or defaults.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
          <label>
            <div className="c-policy__label">Your Profile Object ID</div>
            <input className="c-input" placeholder="0x…" value={profileId} onChange={e => setProfileId(e.target.value)}
              style={{ borderColor: profileId && !objValid(profileId) ? 'var(--c-crimson)' : '' }} />
          </label>
          <label>
            <div className="c-policy__label">Vouchee Address</div>
            <input className="c-input" placeholder="0x…" value={vouchee} onChange={e => setVouchee(e.target.value)}
              style={{ borderColor: vouchee && !addrValid(vouchee) ? 'var(--c-crimson)' : '' }} />
          </label>
          <label>
            <div className="c-policy__label">Stake (MIST)</div>
            <input className="c-input" type="number" min={1} value={vouchStake} onChange={e => setVouchStake(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button className="c-commit"
            disabled={!account || busy || !objValid(profileId) || !addrValid(vouchee) || vouchStake <= 0}
            onClick={() => void createVouch({ voucherProfileId: profileId, voucheeAddress: vouchee, stakeMist: BigInt(vouchStake) })}>
            {vouchState.step === 'signing' ? 'SIGNING…' : 'CREATE VOUCH'}
          </button>
          <StatusLine {...vouchState} />
        </div>
        <div style={{ marginTop: 16, borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
          <div className="c-policy__label" style={{ marginBottom: 8 }}>Redeem Expired Vouch</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ flex: 1 }}>
              <div className="c-policy__label">Vouch Object ID (you are vouchee)</div>
              <input className="c-input" placeholder="0x…" value={vouchObjId} onChange={e => setVouchObjId(e.target.value)} />
            </label>
            <button className="c-commit" disabled={!account || busy || !vouchObjId}
              onClick={() => void redeemVouch({ vouchId: vouchObjId })}>
              {vouchState.step === 'signing' ? 'SIGNING…' : 'REDEEM'}
            </button>
          </div>
        </div>
        {vouchState.step !== 'idle' && <button className="c-tab" style={{ marginTop: 10 }} onClick={vouchReset}>CLEAR</button>}
      </div>

      {/* ── Loan ────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Loan Management</div>
        <div className="c-sub" style={{ marginBottom: 12 }}>Repay an active loan or mark an overdue loan as defaulted. Loan issuance requires a multi-party flow (lender + borrower vouch).</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <label>
            <div className="c-policy__label">Loan Object ID</div>
            <input className="c-input" placeholder="0x…" value={loanId} onChange={e => setLoanId(e.target.value)} />
          </label>
          <label>
            <div className="c-policy__label">Repayment (MIST)</div>
            <input className="c-input" type="number" min={1} value={repaymentMist} onChange={e => setRepaymentMist(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="c-commit" disabled={!account || busy || !loanId || repaymentMist <= 0}
            onClick={() => void repayLoan({ loanId, repaymentMist: BigInt(repaymentMist) })}>
            {lendState.step === 'signing' ? 'SIGNING…' : 'REPAY LOAN'}
          </button>
          <StatusLine {...lendState} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <div className="c-policy__label">Loan Object ID (mark defaulted)</div>
            <input className="c-input" placeholder="0x…" value={markLoanId} onChange={e => setMarkLoanId(e.target.value)} />
          </label>
          <button className="c-commit" disabled={!account || busy || !markLoanId}
            onClick={() => void markDefault({ loanId: markLoanId })}>
            {lendState.step === 'signing' ? 'SIGNING…' : 'MARK DEFAULT'}
          </button>
        </div>
        {lendState.step !== 'idle' && <button className="c-tab" style={{ marginTop: 10 }} onClick={lendReset}>CLEAR</button>}
      </div>

      {/* ── Oracle Registration ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(0,210,255,0.018)' }}>
        <div className="c-stat__label" style={{ marginBottom: 10 }}>Register Oracle</div>
        <div className="c-sub" style={{ marginBottom: 12 }}>
          Stakes {isSystemOracle ? '0.1' : '1'} SUI minimum from wallet. OracleCapability is transferred to sender.
          Schemas can also be added later via the Oracle tab.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
          <label>
            <div className="c-policy__label">Oracle Name</div>
            <input className="c-input" placeholder="my-oracle" value={oracleName} onChange={e => setOracleName(e.target.value)} />
          </label>
          <label>
            <div className="c-policy__label">Initial Schemas (comma-separated)</div>
            <input className="c-input" placeholder="GATE_HOSTILE,GATE_CAMPED" value={oracleSchemas} onChange={e => setOracleSchemas(e.target.value)} />
          </label>
          <label>
            <div className="c-policy__label">TEE Attestation Hash</div>
            <input className="c-input" placeholder="none" value={teeHash} onChange={e => setTeeHash(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={isSystemOracle} onChange={e => setIsSystemOracle(e.target.checked)} />
            System Oracle (0.1 SUI stake)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={teeVerified} onChange={e => setTeeVerified(e.target.checked)} />
            TEE Verified
          </label>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="c-commit" disabled={!account || busy || !oracleName.trim()}
            onClick={() => void registerOracle({
              name: oracleName.trim(),
              initialSchemas: oracleSchemas.split(',').map(s => s.trim()).filter(Boolean),
              stakeMist: minStake,
              teeVerified,
              teeAttestationHash: teeHash || 'none',
              isSystemOracle,
            })}>
            {oracleState.step === 'signing' ? 'SIGNING…' : 'REGISTER ORACLE'}
          </button>
          <StatusLine {...oracleState} />
          {oracleState.step !== 'idle' && <button className="c-tab" onClick={oracleReset}>CLEAR</button>}
        </div>
      </div>

      {/* ── Vouch Feeds ─────────────────────────────────────────────────────── */}
      {!account && <div className="c-sub">Connect wallet to see vouch history.</div>}
      {account && feedLoading && <div className="c-sub">Loading vouches…</div>}

      {/* Vouches backing you — vouchee side, useful for redeem */}
      <div className="c-view__title" style={{ marginBottom: 10 }}>Vouches Backing You</div>
      {account && !feedLoading && receivedVouches.length === 0 && (
        <div className="c-sub" style={{ marginBottom: 16 }}>No vouches received by this wallet.</div>
      )}
      {receivedVouches.length > 0 && (
        <table className="c-table" style={{ marginBottom: 24 }}>
          <thead><tr><th>Vouch ID</th><th>From (voucher)</th><th>Stake</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>
            {receivedVouches.map(row => (
              <tr key={row.vouch_id} style={{ opacity: row.redeemed ? 0.45 : 1 }}>
                <td><div style={{ fontSize: 12 }}>{shortId(row.vouch_id)}</div><div className="c-sub">{row.created_at}</div></td>
                <td>{shortId(row.voucher)}</td>
                <td style={{ color: 'var(--c-amber)' }}>{formatSui(row.stake_amount)}</td>
                <td style={{ textAlign: 'right', color: row.redeemed ? 'var(--c-mid)' : 'var(--c-green)' }}>
                  {row.redeemed ? 'REDEEMED' : 'ACTIVE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Vouches you gave — voucher side, useful for tracking defaults */}
      <div className="c-view__title" style={{ marginBottom: 10 }}>Vouches You've Given</div>
      {account && !feedLoading && givenVouches.length === 0 && (
        <div className="c-sub">No vouches issued by this wallet.</div>
      )}
      {givenVouches.length > 0 && (
        <table className="c-table">
          <thead><tr><th>Vouch ID</th><th>To (vouchee)</th><th>Stake</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>
            {givenVouches.map(row => (
              <tr key={row.vouch_id} style={{ opacity: row.redeemed ? 0.45 : 1 }}>
                <td><div style={{ fontSize: 12 }}>{shortId(row.vouch_id)}</div><div className="c-sub">{row.created_at}</div></td>
                <td>{shortId(row.vouchee)}</td>
                <td style={{ color: 'var(--c-amber)' }}>{formatSui(row.stake_amount)}</td>
                <td style={{ textAlign: 'right', color: row.redeemed ? 'var(--c-mid)' : 'var(--c-green)' }}>
                  {row.redeemed ? 'REDEEMED' : 'ACTIVE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
