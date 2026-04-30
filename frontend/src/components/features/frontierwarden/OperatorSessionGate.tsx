import type { ReactNode } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useWallets } from '@mysten/dapp-kit-react';
import type { UiWallet } from '@wallet-standard/ui';
import { useOperatorSession } from '../../../hooks/useOperatorSession';

interface Props {
  children: ReactNode;
}

const short = (value: string | null) =>
  value && value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value ?? '-';

const isEveWallet = (wallet: UiWallet) =>
  wallet.name.toLowerCase().includes('eve');

function expiryText(expiresAt: number | null) {
  if (!expiresAt) return '-';
  return new Date(expiresAt * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OperatorSessionGate({ children }: Props) {
  const wallets = useWallets();
  const { authenticate, clearSession, isAuthenticated, state } = useOperatorSession();
  const eveWallets = wallets.filter(isEveWallet);
  const modalOptions = eveWallets.length > 0
    ? { sortFn: (a: UiWallet, b: UiWallet) => Number(isEveWallet(b)) - Number(isEveWallet(a)) }
    : {};
  const connectLabel = 'CONNECT WALLET';

  if (isAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          borderBottom: '1px solid var(--c-border)',
          color: 'var(--c-mid)',
          display: 'flex',
          fontSize: 10,
          gap: 18,
          justifyContent: 'flex-end',
          letterSpacing: 2,
          padding: '8px 36px',
          textTransform: 'uppercase',
        }}>
          <span>Operator {short(state.address)}</span>
          <span>Session expires {expiryText(state.expiresAt)}</span>
          <button className="c-link" onClick={clearSession}>Lock</button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="c-shell" style={{ justifyContent: 'center', padding: 36 }}>
      <section style={{
        alignSelf: 'center',
        background: 'rgba(8,13,20,0.86)',
        border: '1px solid var(--c-border)',
        maxWidth: 760,
        padding: 34,
        width: '100%',
      }}>
        <div className="c-header__brand" style={{ display: 'block', marginBottom: 18 }}>
          FRONTIERWARDEN
        </div>
        <div className="c-view__title" style={{ marginBottom: 18 }}>
          Operator Session Required
        </div>
        <p style={{
          color: 'var(--c-mid)',
          fontSize: 12,
          lineHeight: 1.8,
          marginBottom: 28,
          maxWidth: 620,
        }}>
          Connect an EVE-compatible Sui wallet and sign a session nonce before
          accessing indexed protocol data or operator controls.
        </p>

        <div style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
          marginBottom: 26,
        }}>
          <Metric label="Wallet" value={short(state.accountAddress)} />
          <Metric label="Detected" value={wallets.map(w => w.name).join(', ') || 'none'} />
          <Metric label="Verifier" value="Sui wallet-standard personal message" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div className="c-wallet-connect">
            <ConnectButton modalOptions={modalOptions}>{connectLabel}</ConnectButton>
          </div>
          <button
            className="c-commit"
            disabled={!state.accountAddress || state.status === 'signing'}
            onClick={authenticate}
            style={{ minWidth: 230 }}
          >
            {state.status === 'signing' ? 'SIGNING SESSION' : 'SIGN OPERATOR SESSION'}
          </button>
        </div>

        {state.error && (
          <div style={{ color: 'var(--c-crimson)', fontSize: 11, marginTop: 18 }}>
            {state.error}
          </div>
        )}
        <div className="c-sub" style={{ marginTop: 18 }}>
          EVE Vault is preferred when installed. Other Sui wallets remain available
          for testnet work and local verification.
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="c-stat__label">{label}</div>
      <div style={{ color: 'var(--c-hi)', fontSize: 13, overflowWrap: 'anywhere' }}>
        {value}
      </div>
    </div>
  );
}
