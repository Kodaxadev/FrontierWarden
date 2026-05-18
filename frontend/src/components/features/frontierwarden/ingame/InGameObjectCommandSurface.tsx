// InGameObjectCommandSurface — compact object-specific command surface
// for operators inside the EVE Frontier smart assembly frame.
//
// Reads assembly context from SmartObjectProvider, determines the object
// type, and renders the appropriate screen placeholder. Full object-specific
// behavior is implemented in later branches.

import { useSmartObject } from '@evefrontier/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { assemblyToScreen, SCREEN_LABELS } from './ingame-object-types';
import type { InGameScreen } from './ingame-object-types';

const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

/** ATT. OPERATOR warning strip — matches EVE Frontier in-game visual language. */
function AttOperatorBar({ tone, children }: { tone: 'blue' | 'amber' | 'crimson'; children: React.ReactNode }) {
  const bg = tone === 'crimson'
    ? 'rgba(255,85,104,0.14)'
    : tone === 'amber'
      ? 'rgba(245,158,11,0.14)'
      : 'rgba(0,120,255,0.14)';
  const color = tone === 'crimson'
    ? 'var(--c-crimson, #ff5568)'
    : tone === 'amber'
      ? 'var(--c-amber, #f59e0b)'
      : 'var(--c-hi, #00d2ff)';
  return (
    <div style={{
      background: bg,
      borderLeft: `3px solid ${color}`,
      color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.2,
      padding: '10px 14px',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

/** Dense operator context strip for in-game mode. */
function ContextStrip({ wallet, objectId, screen }: {
  wallet: string | null;
  objectId: string | null;
  screen: InGameScreen;
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--c-border)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 0,
      background: 'rgba(255,255,255,0.012)',
    }}>
      <ContextCell label="OPERATOR" value={wallet ? shortId(wallet) : 'NOT CONNECTED'} tone={wallet ? 'good' : 'idle'} />
      <ContextCell label="OBJECT" value={objectId ? shortId(objectId) : 'LOADING'} tone={objectId ? 'good' : 'idle'} />
      <ContextCell label="TYPE" value={SCREEN_LABELS[screen]} tone={screen === 'unknown' ? 'warn' : 'good'} />
    </div>
  );
}

function ContextCell({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'idle' }) {
  const color = tone === 'good'
    ? 'var(--c-green, #5ee28a)'
    : tone === 'warn'
      ? 'var(--c-amber, #f59e0b)'
      : 'var(--c-mid)';
  return (
    <div style={{
      borderRight: '1px solid var(--c-border)',
      minWidth: 130,
      padding: '8px 12px',
    }}>
      <div style={{ fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--c-mid)' }}>
        {label}
      </div>
      <div style={{ color, fontSize: 12, fontWeight: 700, fontFamily: 'var(--c-mono, monospace)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

/** Object screen placeholder — rendered per assembly type. */
function ObjectScreenPlaceholder({ screen, objectId }: { screen: InGameScreen; objectId: string | null }) {
  return (
    <div style={{
      border: '1px solid var(--c-border)',
      background: 'rgba(255,255,255,0.012)',
      padding: '20px 18px',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: 'var(--c-hi, #00d2ff)',
        marginBottom: 12,
      }}>
        {SCREEN_LABELS[screen]}
      </div>
      <div className="c-sub" style={{ marginBottom: 12 }}>
        Object-specific controls for this screen are coming in branch <code>codex/gate-object-command-surface</code>.
      </div>
      {objectId && (
        <div className="c-kv">
          <span className="c-kv__k">Object</span>
          <span className="c-kv__v" style={{ fontFamily: 'var(--c-mono, monospace)', fontSize: 11 }}>
            {objectId}
          </span>
        </div>
      )}
    </div>
  );
}

export function InGameObjectCommandSurface() {
  const account = useCurrentAccount();
  const { assembly, loading, error } = useSmartObject();

  const objectId = assembly?.id ?? null;
  const assemblyType = assembly?.type ?? null;
  const screen = assemblyToScreen(assemblyType);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      height: '100%',
      fontFamily: 'var(--c-font, sans-serif)',
    }}>
      {/* ── Context strip ───────────────────────────────── */}
      <ContextStrip
        wallet={account?.address ?? null}
        objectId={objectId}
        screen={screen}
      />

      {/* ── Content area ────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Wallet connect */}
        {!account && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div>
            <span className="c-sub">Connect operator wallet to act on this object.</span>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <AttOperatorBar tone="blue">
            ATT. OPERATOR — LOADING ASSEMBLY DATA
          </AttOperatorBar>
        )}

        {/* Error state */}
        {error && (
          <AttOperatorBar tone="crimson">
            ATT. OPERATOR — ASSEMBLY QUERY FAILED: {typeof error === 'string' ? error.toUpperCase() : 'UNKNOWN ERROR'}
          </AttOperatorBar>
        )}

        {/* Unknown object type warning */}
        {!loading && !error && screen === 'unknown' && (
          <AttOperatorBar tone="amber">
            ATT. OPERATOR — OBJECT TYPE DETECTION PENDING OR UNAVAILABLE
          </AttOperatorBar>
        )}

        {/* Object screen */}
        {!loading && !error && (
          <ObjectScreenPlaceholder screen={screen} objectId={objectId} />
        )}

        {/* Web mode link */}
        <div style={{
          marginTop: 'auto',
          paddingTop: 14,
          borderTop: '1px solid var(--c-border)',
          fontSize: 10,
          color: 'var(--c-mid)',
        }}>
          Full operator command center available at{' '}
          <a
            href={window.location.origin}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--c-hi, #00d2ff)' }}
          >
            {window.location.origin}
          </a>
        </div>
      </div>
    </div>
  );
}
