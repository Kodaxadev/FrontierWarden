import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import {
  createOperatorSession,
  requestOperatorNonce,
  setOperatorSessionToken,
} from '../lib/api';

const STORAGE_KEY = 'fw_operator_session_v1';

type SessionStatus = 'idle' | 'signing' | 'active' | 'error';

interface StoredSession {
  address: string;
  token: string;
  expiresAt: number;
}

export interface OperatorSessionState {
  accountAddress: string | null;
  address: string | null;
  error: string | null;
  expiresAt: number | null;
  status: SessionStatus;
  token: string | null;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.address || parsed.expiresAt <= nowSeconds()) {
      return null;
    }
    return parsed;
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

      const stored = {
        address: next.address,
        token: next.token,
        expiresAt: next.expires_at,
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
  }, [account, dAppKit]);

  const state = useMemo<OperatorSessionState>(() => ({
    accountAddress: account?.address ?? null,
    address: session?.address ?? null,
    error,
    expiresAt: session?.expiresAt ?? null,
    status,
    token: session?.token ?? null,
  }), [account?.address, error, session, status]);

  return {
    authenticate,
    clearSession,
    isAuthenticated: Boolean(session && session.expiresAt > nowSeconds()),
    state,
  };
}
