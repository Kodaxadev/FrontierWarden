// GateObjectSurface — compact SmartGate command surface for in-game mode.
//
// Shows: gate ID, binding state, authority checklist, passage decision,
// and ATT. OPERATOR warnings. Reuses useCheckPassage, useOperatorGatePolicies,
// and useOperatorGateAuthority from the web dashboard without duplicating
// transaction builders.

import { useCallback, useState } from 'react';
import { useSmartObject } from '@evefrontier/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useCheckPassage } from '../../../../hooks/useCheckPassage';
import { useOperatorGatePolicies } from '../../../../hooks/useOperatorGatePolicies';
import { useOperatorGateAuthority } from '../../../../hooks/useOperatorGateAuthority';
import { GateBindingStatusBadge } from '../views/GateBindingStatusBadge';
import { AttOperatorBar } from './ingame-ui';

const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

const BUSY_STEPS = ['building', 'sponsoring', 'signing', 'executing'];

export function GateObjectSurface() {
  const account = useCurrentAccount();
  const { assembly, loading: assemblyLoading, error: assemblyError } = useSmartObject();
  const policies = useOperatorGatePolicies();
  const gateAuthority = useOperatorGateAuthority();
  const {
    state: passageState,
    attestationId,
    attestationLoading,
    attestationError,
    configReady,
    checkPassage,
    reset: resetPassage,
  } = useCheckPassage();

  const [expanded, setExpanded] = useState(false);

  const objectId = assembly?.id ?? null;
  const ownerCharacter = assembly?.character ?? null;
  const passageBusy = BUSY_STEPS.includes(passageState.step);

  // Derive binding state from indexed policies
  const matchedPolicy = policies.policies.find(
    p => p.gatePolicyId === objectId || p.gateAdminCapId === objectId,
  );
  const hasPolicy = policies.hasAny;
  const hasOwnerCap = gateAuthority.ownerCaps.length > 0;
  const hasExtension = gateAuthority.status === 'gate_authority_found'
    && gateAuthority.gates.length > 0;

  const handleCheckPassage = useCallback(() => {
    if (passageState.step === 'done') {
      resetPassage();
    } else {
      void checkPassage();
    }
  }, [checkPassage, passageState.step, resetPassage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Assembly loading / error ─────────────────────── */}
      {assemblyLoading && (
        <AttOperatorBar tone="blue">ATT. OPERATOR — LOADING GATE ASSEMBLY DATA</AttOperatorBar>
      )}
      {assemblyError && (
        <AttOperatorBar tone="crimson">
          ATT. OPERATOR — ASSEMBLY QUERY FAILED: {typeof assemblyError === 'string' ? assemblyError.toUpperCase() : 'UNKNOWN ERROR'}
        </AttOperatorBar>
      )}

      {/* ── Gate identity ────────────────────────────────── */}
      {objectId && (
        <section style={{ border: '1px solid var(--c-border)', padding: '12px 14px' }}>
          <SectionLabel>GATE IDENTITY</SectionLabel>
          <KV k="Object" v={expanded ? objectId : shortId(objectId)} mono click={() => setExpanded(!expanded)} />
          {ownerCharacter?.address && <KV k="Owner" v={shortId(ownerCharacter.address)} mono />}
          {assembly?.name && <KV k="Name" v={assembly.name} />}
        </section>
      )}

      {/* ── Wallet connect ───────────────────────────────── */}
      {!account && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div>
          <span className="c-sub" style={{ fontSize: 10 }}>Connect to check authority and passage.</span>
        </div>
      )}

      {/* ── Authority checklist ──────────────────────────── */}
      {account && (
        <section style={{ border: '1px solid var(--c-border)', padding: '12px 14px' }}>
          <SectionLabel>AUTHORITY</SectionLabel>
          <AuthRow label="Policy authority" protocol="GateAdminCap" ok={hasPolicy} loading={policies.loading} />
          <AuthRow label="World gate ownership" protocol="OwnerCap<Gate>" ok={hasOwnerCap} loading={gateAuthority.isLoading} />
          <AuthRow label="Extension auth" protocol="FrontierWardenAuth" ok={hasExtension} loading={gateAuthority.isLoading} />
        </section>
      )}

      {/* ── Binding state ────────────────────────────────── */}
      {account && matchedPolicy && (
        <section style={{ border: '1px solid var(--c-border)', padding: '12px 14px' }}>
          <SectionLabel>BINDING</SectionLabel>
          <div style={{ marginTop: 4 }}>
            <GateBindingStatusBadge compact />
          </div>
          <KV k="GatePolicy" v={shortId(matchedPolicy.gatePolicyId)} mono />
        </section>
      )}

      {/* ── ATT warnings ─────────────────────────────────── */}
      {account && !policies.loading && !hasPolicy && (
        <AttOperatorBar tone="amber">ATT. OPERATOR — NO GATE POLICY FOUND FOR THIS WALLET</AttOperatorBar>
      )}
      {account && hasPolicy && !hasOwnerCap && !gateAuthority.isLoading && (
        <AttOperatorBar tone="amber">ATT. OPERATOR — WORLD GATE OWNERSHIP NOT DETECTED</AttOperatorBar>
      )}
      {account && hasPolicy && hasOwnerCap && !hasExtension && !gateAuthority.isLoading && (
        <AttOperatorBar tone="amber">ATT. OPERATOR — GATE BOUND BUT NOT BINDING VERIFIED</AttOperatorBar>
      )}

      {/* ── Passage decision ─────────────────────────────── */}
      {account && (
        <section style={{ border: '1px solid var(--c-border)', padding: '12px 14px', background: 'rgba(232,120,42,0.018)' }}>
          <SectionLabel>PASSAGE DECISION</SectionLabel>
          <KV k="Traveler" v={shortId(account.address)} mono />
          <KV
            k="Proof"
            v={attestationLoading
              ? 'fetching...'
              : attestationId
                ? `TRIBE_STANDING ${shortId(attestationId)}`
                : attestationError ?? 'none'}
            tone={attestationId ? 'good' : 'warn'}
          />
          {!configReady && (
            <div className="c-sub" style={{ fontSize: 10, color: 'var(--c-amber)', marginTop: 6 }}>
              Check passage env config incomplete. Full controls in web mode.
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="c-commit"
              disabled={!attestationId || passageBusy || !configReady}
              onClick={handleCheckPassage}
              style={{ fontSize: 11, padding: '6px 14px' }}
            >
              {passageBusy
                ? passageState.step.toUpperCase()
                : passageState.step === 'done'
                  ? 'CLEAR'
                  : passageState.step === 'error'
                    ? 'RETRY'
                    : 'CHECK PASSAGE'}
            </button>
            <span style={{
              fontSize: 10,
              color: passageState.step === 'error'
                ? 'var(--c-crimson)'
                : passageState.step === 'done'
                  ? 'var(--c-green)'
                  : 'var(--c-mid)',
            }}>
              {passageState.step === 'done' && passageState.digest
                ? `passage tx ${shortId(passageState.digest)}`
                : passageState.step === 'error' && passageState.error
                  ? (passageState.error.length > 80 ? `${passageState.error.slice(0, 80)}...` : passageState.error)
                  : attestationId
                    ? `proof ready / ${shortId(attestationId)}`
                    : 'awaiting proof'}
            </span>
          </div>
        </section>
      )}

      {/* ── Indexer cold start ────────────────────────────── */}
      {!assemblyLoading && !assemblyError && !objectId && (
        <AttOperatorBar tone="blue">ATT. OPERATOR — ASSEMBLY NOT RESOLVED. INDEXER MAY BE COLD-STARTING.</AttOperatorBar>
      )}
    </div>
  );
}

/* ── Shared micro-components ──────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: 'var(--c-hi, #00d2ff)',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function KV({ k, v, mono, tone, click }: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: 'good' | 'warn';
  click?: () => void;
}) {
  const color = tone === 'good'
    ? 'var(--c-green)'
    : tone === 'warn'
      ? 'var(--c-amber)'
      : undefined;
  return (
    <div className="c-kv" onClick={click} style={click ? { cursor: 'pointer' } : undefined}>
      <span className="c-kv__k">{k}</span>
      <span className="c-kv__v" style={{
        fontFamily: mono ? 'var(--c-mono, monospace)' : undefined,
        fontSize: mono ? 11 : undefined,
        color,
      }}>
        {v}
      </span>
    </div>
  );
}

function AuthRow({ label, protocol, ok, loading }: {
  label: string;
  protocol: string;
  ok: boolean;
  loading: boolean;
}) {
  const value = loading ? 'CHECKING' : ok ? 'FOUND' : 'MISSING';
  const color = loading
    ? 'var(--c-mid)'
    : ok
      ? 'var(--c-green, #5ee28a)'
      : 'var(--c-amber, #f59e0b)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--c-mid)', minWidth: 150 }}>
        {label} <span style={{ opacity: 0.5 }}>({protocol})</span>
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
