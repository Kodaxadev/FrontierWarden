import { useCallback, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { buildCreateProfileTx } from '../lib/tx-profile';

export type ActionStep = 'idle' | 'signing' | 'done' | 'error';
export interface ActionState { step: ActionStep; digest: string | null; error: string | null }
const IDLE: ActionState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}…` : first;
}

export function useProfileCreate() {
  const account  = useCurrentAccount();
  const dAppKit  = useDAppKit();
  const [state, setState] = useState<ActionState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const createProfile = useCallback(async () => {
    if (!account) { setState({ step: 'error', digest: null, error: 'Wallet not connected.' }); return; }
    const pkgId = (import.meta.env as Record<string, string | undefined>)['VITE_PKG_ID'];
    if (!pkgId)  { setState({ step: 'error', digest: null, error: 'Missing VITE_PKG_ID.' }); return; }
    try {
      setState({ step: 'signing', digest: null, error: null });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: buildCreateProfileTx() });
      if (result.$kind === 'FailedTransaction') throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      setState({ step: 'done', digest: result.Transaction.digest, error: null });
    } catch (err) {
      setState({ step: 'error', digest: null, error: humanise(err) });
    }
  }, [account, dAppKit]);

  return { account, state, reset, createProfile };
}
