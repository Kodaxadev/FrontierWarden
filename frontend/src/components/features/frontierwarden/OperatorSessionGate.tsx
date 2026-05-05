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

const isNotSlush = (wallet: UiWallet) =>
  !wallet.name.toLowerCase().includes('slush');

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
  const filteredWallets = wallets.filter(isNotSlush);
  const eveWallets = filteredWallets.filter(isEveWallet);
  const modalOptions = eveWallets.length > 0
    ? { sortFn: (a: UiWallet, b: UiWallet) => Number(isEveWallet(b)) - Number(isEveWallet(a)) }
    : {};
  const connectLabel = 'CONNECT WALLET';

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
        flexWrap: 'wrap',
        alignItems: 'center',
        position: 'relative',
        zIndex: 200,
      }}>
        {isAuthenticated ? (
          <>
            <span>Operator {short(state.address)}</span>
            <span>Session expires {expiryText(state.expiresAt)}</span>
            <button className="c-link" onClick={clearSession}>Lock</button>
          </>
        ) : (
          <>
            <div className="c-wallet-connect" style={{ display: 'inline-flex' }}>
              <ConnectButton modalOptions={modalOptions}>{connectLabel}</ConnectButton>
            </div>
            {state.accountAddress && (
              <button
                className="c-link"
                disabled={state.status === 'signing'}
                onClick={authenticate}
              >
                {state.status === 'signing' ? 'SIGNING...' : 'SIGN SESSION'}
              </button>
            )}
            {state.error && (
              <span style={{ color: 'var(--c-crimson)' }}>{state.error}</span>
            )}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
