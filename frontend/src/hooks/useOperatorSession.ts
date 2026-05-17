import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import {
  createOperatorSession,
  requestOperatorNonce,
  setOperatorSessionToken,
} from '../lib/api';

const STORAGE_KEY = 'fw_operator_session_v1';

type SessionStatus = 'idle' | 'signing' | 'active' | 'error';

export type SessionScheme = 'ed25519' | 'zklogin' | 'unknown';

interface StoredSession {
  address: string;
  token: string;
  expiresAt: number;
  /** Signature scheme detected from the flag byte of the signed message. */
  scheme: SessionScheme;
  /** Display name of the wallet used to create this session. */
  walletName?: string;
}

export interface OperatorSessionState {
  accountAddress: string | null;
  address: string | null;
  error: string | null;
  expiresAt: number | null;
  scheme: SessionScheme | null;
  /** True when scheme is 'unknown' (session predates scheme tracking). */
  isLegacySession: boolean;
  /** Wallet name stored at session creation time. */
  sessionWalletName: string | null;
  /** Name of the currently connected wallet. */
  currentWalletName: string | null;
  status: SessionStatus;
  token: string | null;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Detect signature scheme from the first byte of the Base64-encoded signature.
 * 0x00 = Ed25519, 0x05 = zkLogin. Anything else = unknown.
 */
function schemeFromSignature(signature: string): SessionScheme {
  try {
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const flag = bytes[0];
    if (flag === 0x00) return 'ed25519';
    if (flag === 0x05) return 'zklogin';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.token || !parsed.address || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= nowSeconds()) return null;
    return {
      address: parsed.address,
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      // Tolerate old sessions that predate scheme tracking.
      scheme: parsed.scheme ?? 'unknown',
      walletName: parsed.walletName,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    setOperatorSessionToken(null);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  setOperatorSessionToken(session.token);
}

function humanise(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^Error:\s*/i, '');
}

export function useOperatorSession() {
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const [session, setSession] = useState<StoredSession | null>(() => {
    const stored = readStoredSession();
    setOperatorSessionToken(stored?.token ?? null);
    return stored;
  });
  const [status, setStatus] = useState<SessionStatus>(session ? 'active' : 'idle');
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    writeStoredSession(null);
    setSession(null);
    setStatus('idle');
    setError(null);
  }, []);

  // Guard: clear session on address mismatch or expiry.
  // Wallet/scheme mismatch is surfaced in UI rather than auto-cleared,
  // because we cannot determine the new wallet's scheme until it signs.
  useEffect(() => {
    if (!session) return;
    if (session.expiresAt <= nowSeconds()) {
      clearSession();
      return;
    }
    if (account?.address && account.address.toLowerCase() !== session.address.toLowerCase()) {
      clearSession();
    }
  }, [account?.address, clearSession, session]);

  const authenticate = useCallback(async () => {
    if (!account) {
      setError('Connect a wallet before signing an operator session.');
      setStatus('error');
      return;
    }

    try {
      setStatus('signing');
      setError(null);
      const nonce = await requestOperatorNonce(account.address);
      const message = new TextEncoder().encode(nonce.message);
      const signed = await dAppKit.signPersonalMessage({ message });
      const next = await createOperatorSession({
        address: account.address,
        nonce: nonce.nonce,
        message: nonce.message,
        signature: signed.signature,
      });

      const stored: StoredSession = {
        address: next.address,
        token: next.token,
        expiresAt: next.expires_at,
        scheme: schemeFromSignature(signed.signature),
        walletName: currentWallet?.name,
      };
      writeStoredSession(stored);
      setSession(stored);
      setStatus('active');
    } catch (err) {
      writeStoredSession(null);
      setSession(null);
      setError(humanise(err));
      setStatus('error');
    }
  }, [account, currentWallet, dAppKit]);

  const currentWalletName = currentWallet?.name ?? null;

  const state = useMemo<OperatorSessionState>(() => ({
    accountAddress: account?.address ?? null,
    address: session?.address ?? null,
    error,
    expiresAt: session?.expiresAt ?? null,
    scheme: session?.scheme ?? null,
    isLegacySession: session?.scheme === 'unknown',
    sessionWalletName: session?.walletName ?? null,
    currentWalletName,
    status,
    token: session?.token ?? null,
  }), [account?.address, currentWalletName, error, session, status]);

  return {
    authenticate,
    clearSession,
    isAuthenticated: Boolean(session && session.expiresAt > nowSeconds()),
    state,
  };
}
