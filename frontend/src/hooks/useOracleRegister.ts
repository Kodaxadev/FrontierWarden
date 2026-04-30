import { useCallback, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildRegisterOracleTx,
  missingOracleRegConfig,
  oracleRegConfigReady,
  type RegisterOracleArgs,
} from '../lib/tx-oracle-register';

export type ActionStep = 'idle' | 'signing' | 'done' | 'error';
export interface ActionState { step: ActionStep; digest: string | null; error: string | null }
const IDLE: ActionState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('MoveAbort') &&
    msg.includes('oracle_registry::register_oracle') &&
    msg.includes('abort code: 1')
  ) {
    return 'System oracle registration is admin-only. Uncheck System Oracle and register as a regular oracle with 1 SUI stake.';
  }
  if (
    msg.includes('MoveAbort') &&
    msg.includes('oracle_registry::register_oracle') &&
    msg.includes('abort code: 2')
  ) {
    return 'This wallet is already registered as an oracle. Check the Social tab to view your existing oracle status.';
  }
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}…` : first;
}

export function useOracleRegister() {
  const account  = useCurrentAccount();
  const dAppKit  = useDAppKit();
  const [state, setState] = useState<ActionState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const registerOracle = useCallback(async (args: RegisterOracleArgs) => {
    if (!account) { setState({ step: 'error', digest: null, error: 'Wallet not connected.' }); return; }
    if (!oracleRegConfigReady()) { setState({ step: 'error', digest: null, error: `Missing env: ${missingOracleRegConfig().join(', ')}` }); return; }
    try {
      setState({ step: 'signing', digest: null, error: null });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: buildRegisterOracleTx(args) });
      if (result.$kind === 'FailedTransaction') throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      setState({ step: 'done', digest: result.Transaction.digest, error: null });
    } catch (err) {
      setState({ step: 'error', digest: null, error: humanise(err) });
    }
  }, [account, dAppKit]);

  return { account, state, reset, registerOracle };
}
