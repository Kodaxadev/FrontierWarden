// PolicyView — gate policy editor + toll withdrawal

import { useEffect, useMemo, useState } from 'react';
import { useWallets } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import type { UiWallet } from '@wallet-standard/ui';
import { fetchGateWithdrawals } from '../../../../lib/api';
import { useUpdateGatePolicy } from '../../../../hooks/useUpdateGatePolicy';
import { useWithdrawTolls } from '../../../../hooks/useWithdrawTolls';
import { gatePolicyConfigReady, missingGatePolicyConfig } from '../../../../lib/tx-gate-policy';
import { GateAdminTransferPanel } from '../GateAdminTransferPanel';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import { TollWithdrawalLedger } from '../TollWithdrawalLedger';
import type { FwData } from '../fw-data';
import type { TollWithdrawalRow } from '../../../../types/api.types';
import { FALLBACK_POLICIES } from '../policy-fixtures';

const ADMIN_WALLET =
  import.meta.env.VITE_GATE_ADMIN_OWNER
  ?? '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';
const EVE_WALLET_NAME = 'Eve Vault';
const EVE_SPONSORED_FEATURE = 'evefrontier:sponsoredTransaction';
// wallet.features is IdentifierArray (readonly string[]) — use .includes(), not `in`
const isEveWallet = (wallet: UiWallet) =>
  wallet.name.toLowerCase().includes('eve vault')
  || wallet.features.includes(EVE_SPONSORED_FEATURE);
const isNotSlush = (wallet: UiWallet) =>
  !wallet.name.toLowerCase().includes('slush');
const eveWalletModalOptions = {
  sortFn: (a: UiWallet, b: UiWallet) => Number(isEveWallet(b)) - Number(isEveWallet(a)),
};

const POLICIES = FALLBACK_POLICIES;
interface Props { data?: FwData; live?: boolean; loading?: boolean; error?: string | null; provenance?: Provenance; }
const formatSui = (mist: number) =>
  mist === 0 ? '0 SUI' : `${(mist / 1_000_000_000).toFixed(3)} SUI`;
const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

export function PolicyView({ data, live = false, loading = false, error = null, provenance }: Props = {}) {
  const { account, state: txState, updatePolicy } = useUpdateGatePolicy();
  const { state: wdState, withdrawTolls, reset: resetWd } = useWithdrawTolls();
  const wallets = useWallets().filter(isNotSlush);
  const policy = data?.policy;
  const [draftThreshold, setDraftThreshold] = useState(policy?.allyThreshold ?? 62);
  const [draftTollMist, setDraftTollMist] = useState(policy?.baseTollMist ?? 0);
  const [withdrawals, setWithdrawals] = useState<TollWithdrawalRow[]>([]);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const pilot = data?.pilot;
  const selectedGate = data?.gates.find(g => g.sourceId === policy?.gateId) ?? data?.gates[0];
  const standingProof = data?.proofs.find(p => p.schema === 'TRIBE_STANDING')
    ?? data?.proofs.find(p => p.schema === 'CREDIT')
    ?? data?.proofs[0];
  const threshold = policy?.allyThreshold ?? 62;
  const score = pilot?.score ?? 847;
  const allowed = score >= threshold;
  const tollMist = allowed ? (policy?.baseTollMist ?? 0) : 0;
  const decision = allowed ? (tollMist > 0 ? 'TOLL' : 'ALLOW') : 'DENY';
  const missingConfig = useMemo(() => missingGatePolicyConfig(), []);
  const configReady = gatePolicyConfigReady();
  const draftValid = Number.isInteger(draftThreshold)
    && draftThreshold >= 0
    && Number.isInteger(draftTollMist)
    && draftTollMist >= 0;
  const txBusy = ['building', 'sponsoring', 'signing', 'executing'].includes(txState.step);
  const wdBusy = ['building', 'sponsoring', 'signing', 'executing'].includes(wdState.step);
  const adminConnected = account?.address.toLowerCase() === ADMIN_WALLET.toLowerCase();
  const eveWallets = wallets.filter(isEveWallet);
  const detectedWallets = eveWallets.length > 0 ? eveWallets : wallets;
  const connectModalOptions = eveWallets.length > 0 ? eveWalletModalOptions : {};
  const connectLabel = 'CONNECT WALLET';
  const detectedWalletText = detectedWallets.length > 0
    ? detectedWallets.map(wallet => wallet.name).join(', ')
    : 'No browser wallets detected';
  const canCommit = Boolean(account && adminConnected && policy && configReady && draftValid && !txBusy);
  const disabledReason = !account
    ? 'Connect wallet to update policy'
    : !adminConnected
      ? `Select admin wallet ${shortId(ADMIN_WALLET)}`
    : !policy
      ? 'No live gate policy is selected'
      : !configReady
        ? `Missing ${missingConfig.join(', ')}`
        : !draftValid
          ? 'Draft values must be non-negative integers'
          : txBusy
            ? `Transaction ${txState.step}`
            : 'Ready to commit';

  useEffect(() => {
    if (!policy) return;
    setDraftThreshold(policy.allyThreshold);
    setDraftTollMist(policy.baseTollMist);
  }, [policy?.allyThreshold, policy?.baseTollMist]);

  useEffect(() => {
    if (!policy?.gateId) {
      setWithdrawals([]);
      return;
    }

    let cancelled = false;
    fetchGateWithdrawals(policy.gateId, 5)
      .then(rows => {
        if (!cancelled) {
          setWithdrawals(rows);
          setWithdrawalError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setWithdrawalError(err instanceof Error ? err.message : String(err));
      });

    return () => { cancelled = true; };
  }, [policy?.gateId, wdState.step]);

  const policyCards = policy
    ? [
      {
        label: 'Standing Threshold',
        value: policy.allyThreshold,
        pct: Math.min(1, Math.max(0, policy.allyThreshold / 1000)),
        min: 'Blocked 0',
        max: 'Ally 1000+',
        note: `Indexed at checkpoint ${policy.checkpoint}`,
        unit: `${policy.allyThreshold}`,
      },
      {
        label: 'Base Toll',
        value: policy.baseTollMist,
        pct: Math.min(1, policy.baseTollMist / 10_000_000_000),
        min: 'Free',
        max: '10 SUI',
        note: `Policy tx ${shortId(policy.txDigest)}`,
        unit: formatSui(policy.baseTollMist),
      },
      {
        label: 'Gate Policy Source',
        value: policy.checkpoint,
        pct: 1,
        min: 'Indexed',
        max: shortId(policy.gateId),
        note: policy.indexedAt,
        unit: shortId(policy.gateId),
      },
    ]
    : POLICIES;

  return (
    <>
      <div className="c-view__title">Gate Policy Editor · {policy ? shortId(policy.gateId) : 'GATE#7720'}</div>
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText="Live gate policy"
        emptyText="No policy indexed"
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 48, maxWidth: 900, marginBottom: 48,
      }}>
        {policyCards.map(p => (
          <div key={p.label} className="c-policy">
            <div className="c-policy__label">{p.label}</div>
            <div className="c-policy__value">{p.unit}</div>
            <div className="c-policy__track">
              <div className="c-policy__fill" style={{ width: `${p.pct * 100}%` }} />
              <div className="c-policy__thumb" style={{ left: `${p.pct * 100}%` }} />
            </div>
            <div className="c-policy__range">
              <span>{p.min}</span>
              <span>{p.max}</span>
            </div>
            <div style={{
              marginTop: 10, fontSize: 9,
              color: 'var(--c-mid)', lineHeight: 1.6,
            }}>
              {p.note}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 1,
        maxWidth: 900,
        marginBottom: 48,
        border: '1px solid var(--c-border)',
        background: 'var(--c-border)',
      }}>
        <div style={{ background: 'var(--c-surface)', padding: 24 }}>
          <div className="c-stat__label" style={{ marginBottom: 14 }}>Smart Gate Passage Preview</div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: allowed ? 'var(--c-green)' : 'var(--c-crimson)' }}>
                {decision}
              </div>
              <div className="c-sub" style={{ marginTop: 6 }}>
                {pilot?.handle ?? 'PILOT#0041'} / {selectedGate?.id ?? 'GATE#7720'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="c-stat__label">Toll Due</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: tollMist > 0 ? 'var(--c-amber)' : 'var(--c-hi)' }}>
                {formatSui(tollMist)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="c-kv">
              <span className="c-kv__k">Score</span>
              <span className="c-kv__v">{score}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Threshold</span>
              <span className="c-kv__v">{threshold}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Reason</span>
              <span className="c-kv__v">
                {allowed ? 'score satisfies gate policy' : 'score below gate policy'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--c-surface)', padding: 24 }}>
          <div className="c-stat__label" style={{ marginBottom: 14 }}>Proof Link</div>
          {standingProof ? (
            <>
              <div className="c-kv">
                <span className="c-kv__k">Schema</span>
                <span className="c-kv__v">{standingProof.schema}</span>
              </div>
              <div className="c-kv">
                <span className="c-kv__k">Issuer</span>
                <span className="c-kv__v">{standingProof.issuer}</span>
              </div>
              <div className="c-kv">
                <span className="c-kv__k">Tx</span>
                <span className="c-kv__v">{standingProof.tx}</span>
              </div>
              <div className="c-kv">
                <span className="c-kv__k">Policy</span>
                <span className="c-kv__v">{policy ? shortId(policy.txDigest) : 'design fixture'}</span>
              </div>
            </>
          ) : (
            <div className="c-sub">No live proof rows indexed for this profile yet.</div>
          )}
        </div>
      </div>

      <div style={{
        maxWidth: 900,
        marginBottom: 28,
        padding: 20,
        border: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.018)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Policy Draft</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 18,
        }}>
          <label>
            <div className="c-policy__label">Ally Threshold</div>
            <input
              className="c-input"
              inputMode="numeric"
              min={0}
              step={1}
              type="number"
              value={draftThreshold}
              onChange={(event) => setDraftThreshold(Number(event.target.value))}
            />
          </label>
          <label>
            <div className="c-policy__label">Base Toll (MIST)</div>
            <input
              className="c-input"
              inputMode="numeric"
              min={0}
              step={1}
              type="number"
              value={draftTollMist}
              onChange={(event) => setDraftTollMist(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <div style={{
        maxWidth: 900,
        marginBottom: 28,
        padding: 20,
        border: '1px solid var(--c-border)',
        background: 'rgba(0,210,255,0.018)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Operator Wallet</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 320px) 1fr',
          gap: 18,
          alignItems: 'center',
        }}>
          <div className="c-wallet-connect">
            <ConnectButton modalOptions={connectModalOptions}>{connectLabel}</ConnectButton>
          </div>
          <div>
            <div className="c-kv">
              <span className="c-kv__k">Selected</span>
              <span className="c-kv__v">{account ? shortId(account.address) : 'none'}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Required</span>
              <span className="c-kv__v">{shortId(ADMIN_WALLET)}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Detected</span>
              <span className="c-kv__v">{detectedWalletText}</span>
            </div>
            {account && !adminConnected && (
              <div className="c-sub" style={{ marginTop: 8, color: 'var(--c-amber)' }}>
                Connected wallet does not own the GateAdminCap. Switch to {shortId(ADMIN_WALLET)}.
              </div>
            )}
          </div>
        </div>
      </div>

      <GateAdminTransferPanel currentOwner={ADMIN_WALLET} />

      <div style={{
        paddingTop: 24,
        borderTop: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <button
          className="c-commit"
          disabled={!canCommit}
          title={disabledReason}
          onClick={() => {
            void updatePolicy({
              allyThreshold: draftThreshold,
              baseTollMist: draftTollMist,
            });
          }}
        >
          {txBusy ? txState.step.toUpperCase() : 'SEAL & COMMIT'}
        </button>
        <span style={{
          fontSize: 10,
          color: txState.step === 'error' ? 'var(--c-crimson)'
               : txState.step === 'done'  ? 'var(--c-green)'
               : 'var(--c-mid)',
          maxWidth: 320,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={
          txState.step === 'done' && txState.digest
            ? `Committed · tx ${txState.digest}`
            : txState.step === 'error' && txState.error
              ? txState.error
              : policy
                ? `Read path live · tx ${policy.txDigest} · checkpoint ${policy.checkpoint}`
                : undefined
        }>
          {txState.step === 'done' && txState.digest
            ? `✓ committed · tx ${shortId(txState.digest)}`
            : txState.step === 'error' && txState.error
              ? (txState.error.length > 120 ? `${txState.error.slice(0, 120)}…` : txState.error)
              : policy
                ? `Live · tx ${shortId(policy.txDigest)} · cp ${policy.checkpoint}`
                : 'Attestor: WRDN-7 · block 18,402,114 · Editor: Vex Korith'}
        </span>

        <button
          className="c-commit"
          style={{ marginLeft: 'auto', opacity: adminConnected && !wdBusy ? 1 : 0.45 }}
          disabled={!account || !adminConnected || wdBusy}
          title={!account ? 'Connect wallet' : !adminConnected ? `Requires ${shortId(ADMIN_WALLET)}` : 'Drain toll treasury'}
          onClick={() => wdState.step === 'done' || wdState.step === 'error' ? resetWd() : void withdrawTolls()}
        >
          {wdBusy ? wdState.step.toUpperCase() : wdState.step === 'done' ? 'CLEAR' : 'WITHDRAW TOLLS'}
        </button>
        {!wdBusy && wdState.step !== 'idle' && (
          <span style={{ fontSize: 10, color: wdState.step === 'error' ? 'var(--c-crimson)' : 'var(--c-green)' }}>
            {wdState.step === 'done' && wdState.digest ? `✓ drained · tx ${shortId(wdState.digest)}` : wdState.error}
          </span>
        )}
      </div>

      <TollWithdrawalLedger error={withdrawalError} rows={withdrawals} />
    </>
  );
}
