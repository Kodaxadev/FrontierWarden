import { useCallback, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildMarkDefaultTx,
  buildRepayLoanTx,
  lendingConfigReady,
  missingLendingConfig,
  type MarkDefaultArgs,
  type RepayLoanArgs,
} from '../lib/tx-lending';

export type ActionStep = 'idle' | 'signing' | 'done' | 'error';
export interface ActionState { step: ActionStep; digest: string | null; error: string | null }
const IDLE: ActionState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}…` : first;
}

export function useLendingActions() {
  const account  = useCurrentAccount();
  const dAppKit  = useDAppKit();
  const [state, setState] = useState<ActionState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async (build: () => ReturnType<typeof buildRepayLoanTx>) => {
    if (!account) { setState({ step: 'error', digest: null, error: 'Wallet not connected.' }); return; }
    if (!lendingConfigReady()) { setState({ step: 'error', digest: null, error: `Missing env: ${missingLendingConfig().join(', ')}` }); return; }
    try {
      setState({ step: 'signing', digest: null, error: null });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: build() });
      if (result.$kind === 'FailedTransaction') throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      setState({ step: 'done', digest: result.Transaction.digest, error: null });
    } catch (err) {
      setState({ step: 'error', digest: null, error: humanise(err) });
    }
  }, [account, dAppKit]);

  const repayLoan   = useCallback((args: RepayLoanArgs)   => execute(() => buildRepayLoanTx(args)),   [execute]);
  const markDefault = useCallback((args: MarkDefaultArgs)  => execute(() => buildMarkDefaultTx(args)), [execute]);

  return { account, state, reset, repayLoan, markDefault };
}
