// Shared sponsored transaction executor.
// Accepts base64 TransactionKind bytes, asks the gas station to wrap/sign, then
// asks the connected wallet to co-sign and submits to the configured Sui network.

import { useCallback, useState } from 'react';
import { fromBase64 } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';
import {
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { sponsorTransaction } from '../lib/api';

export type SponsoredStep =
  | 'idle'
  | 'building'
  | 'sponsoring'
  | 'signing'
  | 'executing'
  | 'done'
  | 'error';

export interface SponsoredState {
  step: SponsoredStep;
  digest: string | null;
  error: string | null;
}

export interface ExecuteSponsoredArgs {
  build: () => Promise<string>;
  gasBudget?: number;
}

const IDLE: SponsoredState = { step: 'idle', digest: null, error: null };

function humaniseError(err: unknown): string {
  const msg = String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}...` : first;
}

export function useSponsoredTransaction() {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [state, setState] = useState<SponsoredState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async ({ build, gasBudget }: ExecuteSponsoredArgs) => {
    if (!account) {
      const next = { step: 'error' as const, digest: null, error: 'Wallet not connected.' };
      setState(next);
      return next;
    }

    try {
      setState({ step: 'building', digest: null, error: null });
      const txKindBytes = await build();

      setState({ step: 'sponsoring', digest: null, error: null });
      const { txBytes, sponsorSignature } = await sponsorTransaction({
        txKindBytes,
        sender: account.address,
        gasBudget,
      });

      setState({ step: 'signing', digest: null, error: null });
      // Reconstruct Transaction from kind bytes and sign with dapp-kit
      // The wallet expects a Transaction object, not raw bytes
      const tx = Transaction.fromKind(fromBase64(txKindBytes));
      const signed = await dAppKit.signTransaction({ transaction: tx });

      // Validate signed transaction structure
      if (!signed || !signed.signature) {
        throw new Error('Wallet signing failed: no signature returned');
      }

      setState({ step: 'executing', digest: null, error: null });
      const result = await client.core.executeTransaction({
        transaction: fromBase64(txBytes),
        signatures: [sponsorSignature, signed.signature],
      });

      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      }

      const next = { step: 'done' as const, digest: result.Transaction.digest, error: null };
      setState(next);
      return next;
    } catch (err) {
      const next = { step: 'error' as const, digest: null, error: humaniseError(err) };
      setState(next);
      return next;
    }
  }, [account, client, dAppKit]);

  return {
    account,
    execute,
    reset,
    state,
  };
}
