import { useCallback, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildWalletAttestationTx,
  missingWalletAttestationConfig,
  walletAttestationConfigReady,
  type BuildWalletAttestationArgs,
} from '../lib/tx-wallet-attestation';

export type WalletAttestationStep = 'idle' | 'signing' | 'done' | 'error';

export interface WalletAttestationState {
  step: WalletAttestationStep;
  digest: string | null;
  error: string | null;
}

const IDLE: WalletAttestationState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('MoveAbort') &&
    msg.includes('attestation::issue') &&
    msg.includes('abort code: 4')
  ) {
    return 'Wallet is not registered as an oracle for TRIBE_STANDING. Register Oracle first with System Oracle unchecked.';
  }
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}...` : first;
}

export function useWalletAttestationIssue() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [state, setState] = useState<WalletAttestationState>(IDLE);
  const reset = useCallback(() => setState(IDLE), []);

  const issueAttestation = useCallback(async (args: BuildWalletAttestationArgs) => {
    if (!account) {
      setState({ step: 'error', digest: null, error: 'Wallet not connected.' });
      return;
    }
    if (!walletAttestationConfigReady()) {
      setState({
        step: 'error',
        digest: null,
        error: `Missing env: ${missingWalletAttestationConfig().join(', ')}`,
      });
      return;
    }

    try {
      setState({ step: 'signing', digest: null, error: null });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildWalletAttestationTx(args),
      });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      }
      setState({ step: 'done', digest: result.Transaction.digest, error: null });
    } catch (err) {
      setState({ step: 'error', digest: null, error: humanise(err) });
    }
  }, [account, dAppKit]);

  return { account, state, reset, issueAttestation };
}
