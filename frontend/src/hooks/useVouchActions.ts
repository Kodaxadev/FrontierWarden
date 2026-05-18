import { useCallback, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildCreateVouchTx,
  buildRedeemVouchTx,
  missingVouchConfig,
  vouchConfigReady,
  type CreateVouchArgs,
  type RedeemVouchArgs,
} from '../lib/tx-vouch';
import { classifySponsoredError } from '../lib/sponsored-diagnostics';
import { makeActionRecorder, recordAction } from '../lib/fw-action-telemetry';

export type ActionStep = 'idle' | 'signing' | 'done' | 'error';
export interface ActionState { step: ActionStep; digest: string | null; error: string | null }
const IDLE: ActionState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}…` : first;
}

function walletName(wallet: unknown): string | null {
  const name = (wallet as { name?: unknown })?.name;
  return typeof name === 'string' ? name : null;
}

export function useVouchActions() {
  const account  = useCurrentAccount();
  const wallet   = useCurrentWallet();
  const dAppKit  = useDAppKit();
  const [state, setState] = useState<ActionState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async (label: string, build: () => ReturnType<typeof buildCreateVouchTx>) => {
    const wn = walletName(wallet);
    if (!account) {
      const ts = Date.now();
      recordAction({ ts, flow: 'direct', label, phase: 'started', walletName: wn });
      recordAction({ ts, flow: 'direct', label, phase: 'failed', errorClass: 'wallet_not_connected', walletName: wn });
      setState({ step: 'error', digest: null, error: 'Wallet not connected.' });
      return;
    }
    if (!vouchConfigReady()) {
      const ts = Date.now();
      recordAction({ ts, flow: 'direct', label, phase: 'started', walletName: wn });
      recordAction({ ts, flow: 'direct', label, phase: 'failed', errorClass: 'config_missing', walletName: wn });
      setState({ step: 'error', digest: null, error: `Missing env: ${missingVouchConfig().join(', ')}` });
      return;
    }
    const record = makeActionRecorder('direct', label, wn);
    record('started');
    try {
      setState({ step: 'signing', digest: null, error: null });
      const transaction = build();
      record('build_ok');
      record('wallet_sign_requested');
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      record('wallet_sign_ok');
      if (result.$kind === 'FailedTransaction') {
        const msg = `Transaction failed: ${result.FailedTransaction.digest}`;
        record('execute_failed', classifySponsoredError(msg));
        record('failed', classifySponsoredError(msg));
        throw new Error(msg);
      }
      record('execute_ok');
      record('done');
      setState({ step: 'done', digest: result.Transaction.digest, error: null });
    } catch (err) {
      const msg = humanise(err);
      record('failed', classifySponsoredError(msg));
      setState({ step: 'error', digest: null, error: msg });
    }
  }, [account, dAppKit, wallet]);

  const createVouch = useCallback(
    (args: CreateVouchArgs) => execute('vouch-create', () => buildCreateVouchTx(args)),
    [execute],
  );
  const redeemVouch = useCallback(
    (args: RedeemVouchArgs) => execute('vouch-redeem', () => buildRedeemVouchTx(args)),
    [execute],
  );

  return { account, state, reset, createVouch, redeemVouch };
}
