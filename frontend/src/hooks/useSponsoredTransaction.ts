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

function classifyBytes(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (typeof value === 'string') {
    if (/^[0-9a-fA-F]+$/.test(value)) return `hex-string(${value.length})`;
    // base64: chars are A-Z a-z 0-9 + / =
    if (/^[A-Za-z0-9+/=]+$/.test(value)) return `base64-string(${value.length})`;
    return `string(${value.length})`;
  }
  if (typeof value === 'object') return `object(keys: ${Object.keys(value as object).join(',')})`;
  return typeof value;
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

    let phase: SponsoredStep = 'idle';

    try {
      // ── Step 1: build kind bytes ──────────────────────────────────────────
      phase = 'building';
      setState({ step: 'building', digest: null, error: null });
      const txKindBytes = await build();
      console.info('[SPONSORED_TX] step=building done', { kindBytesType: classifyBytes(txKindBytes) });

      // ── Step 2: sponsor API ───────────────────────────────────────────────
      phase = 'sponsoring';
      setState({ step: 'sponsoring', digest: null, error: null });
      console.info('[SPONSORED_TX] step=sponsoring — calling sponsor API');

      let txBytes: string;
      let sponsorSignature: string;
      try {
        const sponsorResp = await sponsorTransaction({
          txKindBytes,
          sender: account.address,
          gasBudget,
        });
        console.info('[SPONSORED_TX] step=sponsor_api_response', {
          keysPresent:         Object.keys(sponsorResp),
          txBytesType:         classifyBytes(sponsorResp.txBytes),
          sponsorSigType:      classifyBytes(sponsorResp.sponsorSignature),
        });
        txBytes         = sponsorResp.txBytes;
        sponsorSignature = sponsorResp.sponsorSignature;
      } catch (err) {
        throw new Error(`sponsor_api_failed: ${humaniseError(err)}`);
      }

      // ── Step 3: Transaction.from(sponsoredBytes) ──────────────────────────
      phase = 'signing';
      setState({ step: 'signing', digest: null, error: null });
      console.info('[SPONSORED_TX] step=transaction_from — input type:', classifyBytes(txBytes));

      let tx: Transaction;
      try {
        tx = Transaction.from(txBytes);
        console.info('[SPONSORED_TX] step=transaction_from done', {
          txDataKeys: Object.keys(tx.getData()),
        });
      } catch (err) {
        throw new Error(`transaction_from_sponsored_bytes_failed: ${humaniseError(err)}`);
      }

      // ── Step 4: dAppKit.signTransaction ───────────────────────────────────
      console.info('[SPONSORED_TX] step=dappkit_sign — calling dAppKit.signTransaction');
      let signed: { signature: string; bytes?: string } | null = null;
      try {
        signed = await dAppKit.signTransaction({ transaction: tx });
        console.info('[SPONSORED_TX] step=dappkit_sign done', {
          signedKeys:    signed ? Object.keys(signed) : 'null',
          hasSignature:  !!signed?.signature,
        });
      } catch (err) {
        throw new Error(`dappkit_sign_transaction_failed: ${humaniseError(err)}`);
      }

      if (!signed || !signed.signature) {
        throw new Error('dappkit_sign_transaction_failed: no signature returned');
      }

      // ── Step 5: executeTransaction ────────────────────────────────────────
      phase = 'executing';
      setState({ step: 'executing', digest: null, error: null });
      console.info('[SPONSORED_TX] step=execute — calling client.core.executeTransaction', {
        clientType:      (client as unknown as { constructor: { name: string } }).constructor.name,
        txBytesType:     classifyBytes(txBytes),
        sigsCount:       2,
      });

      let result: Awaited<ReturnType<typeof client.core.executeTransaction>>;
      try {
        result = await client.core.executeTransaction({
          transaction: fromBase64(txBytes),
          signatures:  [sponsorSignature, signed.signature],
        });
        console.info('[SPONSORED_TX] step=execute done', {
          resultKind: result.$kind,
        });
      } catch (err) {
        throw new Error(`execute_transaction_failed: ${humaniseError(err)}`);
      }

      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      }

      const next = { step: 'done' as const, digest: result.Transaction.digest, error: null };
      setState(next);
      return next;
    } catch (err) {
      const next = { step: 'error' as const, digest: null, error: `${phase}: ${humaniseError(err)}` };
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
