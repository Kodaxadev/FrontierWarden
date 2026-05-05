// Shared sponsored transaction executor.
// Accepts base64 TransactionKind bytes, asks the gas station to wrap/sign, then
// asks the connected wallet to co-sign and submits to the configured Sui network.

import { useCallback, useState } from 'react';
import { fromBase64 } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';
import {
  useCurrentAccount,
  useCurrentClient,
  useCurrentWallet,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { sponsorTransaction } from '../lib/api';
import {
  byteLength,
  classifyBytes,
  classifySponsoredError,
  createSponsoredTrace,
  sanitizeTrace,
  validateSponsorResponse,
  type SponsoredTrace,
} from '../lib/sponsored-diagnostics';

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
  trace: SponsoredTrace | null;
}

export interface ExecuteSponsoredArgs {
  build: () => Promise<string>;
  gasBudget?: number;
  flow?: string;
}

const IDLE: SponsoredState = { step: 'idle', digest: null, error: null, trace: null };

function humaniseError(err: unknown): string {
  const msg = String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}...` : first;
}

function summarizeFeatures(wallet: unknown): string[] {
  const features = (wallet as { features?: unknown })?.features;
  if (!features || typeof features !== 'object') return [];
  return Object.keys(features as Record<string, unknown>).sort();
}

function walletName(wallet: unknown): string | null {
  const name = (wallet as { name?: unknown })?.name;
  return typeof name === 'string' ? name : null;
}

export function useSponsoredTransaction() {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const client = useCurrentClient();
  const [state, setState] = useState<SponsoredState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async ({
    build,
    gasBudget,
    flow = 'sponsored_transaction',
  }: ExecuteSponsoredArgs) => {
    if (!account) {
      const next = { step: 'error' as const, digest: null, error: 'Wallet not connected.', trace: null };
      setState(next);
      return next;
    }

    let phase: SponsoredStep = 'idle';
    let trace = createSponsoredTrace({
      flow,
      walletName: walletName(wallet),
      walletAddress: account.address,
      walletFeatures: summarizeFeatures(wallet),
    });

    const setTracedState = (step: SponsoredStep, patch: Partial<SponsoredTrace> = {}) => {
      trace = sanitizeTrace({ ...trace, ...patch, step: patch.step ?? step });
      setState({ step, digest: null, error: null, trace });
    };

    try {
      phase = 'building';
      setTracedState('building');
      const txKindBytes = await build();
      trace = sanitizeTrace({
        ...trace,
        step: 'build.kind.ok',
        txKindBytesType: classifyBytes(txKindBytes),
        txKindBytesLength: byteLength(txKindBytes),
      });
      console.info('[SPONSORED_TX] step=building done', {
        kindBytesType: trace.txKindBytesType,
        kindBytesLength: trace.txKindBytesLength,
      });

      phase = 'sponsoring';
      setTracedState('sponsoring', { step: 'sponsor.request.sent' });
      console.info('[SPONSORED_TX] step=sponsoring calling sponsor API', {
        traceId: trace.traceId,
        walletName: trace.walletName,
      });

      let txBytes: string;
      let sponsorSignature: string;
      try {
        const sponsorResp = await sponsorTransaction({
          txKindBytes,
          sender: account.address,
          gasBudget,
        });
        trace = sanitizeTrace({
          ...trace,
          step: 'sponsor.response.received',
          sponsorResponseKeys: Object.keys(sponsorResp).sort(),
          txBytesType: classifyBytes(sponsorResp.txBytes),
          txBytesLength: byteLength(sponsorResp.txBytes),
          sponsorSignatureType: classifyBytes(sponsorResp.sponsorSignature),
        });
        if (!validateSponsorResponse(sponsorResp)) {
          throw new Error('sponsor_response_invalid: missing txBytes or sponsorSignature');
        }
        console.info('[SPONSORED_TX] step=sponsor_api_response', {
          keysPresent: trace.sponsorResponseKeys,
          txBytesType: trace.txBytesType,
          sponsorSigType: trace.sponsorSignatureType,
        });
        txBytes = sponsorResp.txBytes;
        sponsorSignature = sponsorResp.sponsorSignature;
      } catch (err) {
        const message = humaniseError(err);
        trace = sanitizeTrace({
          ...trace,
          errorClass: classifySponsoredError(message),
          errorMessage: message,
        });
        throw new Error(`sponsor_api_failed: ${message}`);
      }

      phase = 'signing';
      setTracedState('signing');
      console.info('[SPONSORED_TX] step=transaction_from input type', trace.txBytesType);

      let tx: Transaction;
      try {
        tx = Transaction.from(txBytes);
        trace = sanitizeTrace({ ...trace, step: 'transaction.from.ok' });
        console.info('[SPONSORED_TX] step=transaction_from done', {
          txDataKeys: Object.keys(tx.getData()),
        });
      } catch (err) {
        const message = humaniseError(err);
        trace = sanitizeTrace({
          ...trace,
          errorClass: 'transaction_from_sponsored_bytes_failed',
          errorMessage: message,
        });
        throw new Error(`transaction_from_sponsored_bytes_failed: ${message}`);
      }

      const data = tx.getData() as { sender?: string | null };
      trace = sanitizeTrace({
        ...trace,
        step: 'wallet.sign.requested',
        signTransactionInput: {
          transactionType: 'Transaction',
          hasSender: typeof data.sender === 'string' && data.sender.length > 0,
          senderMatchesWallet: typeof data.sender === 'string'
            ? data.sender.toLowerCase() === account.address.toLowerCase()
            : null,
        },
      });
      console.info('[SPONSORED_TX] step=dappkit_sign calling dAppKit.signTransaction', {
        traceId: trace.traceId,
        signTransactionInput: trace.signTransactionInput,
      });

      let signed: { signature: string; bytes?: string } | null = null;
      try {
        signed = await dAppKit.signTransaction({ transaction: tx });
        trace = sanitizeTrace({ ...trace, step: 'wallet.sign.ok' });
        console.info('[SPONSORED_TX] step=dappkit_sign done', {
          signedKeys: signed ? Object.keys(signed) : 'null',
          hasSignature: !!signed?.signature,
        });
      } catch (err) {
        const message = humaniseError(err);
        trace = sanitizeTrace({
          ...trace,
          step: 'wallet.sign.failed',
          errorClass: classifySponsoredError(message),
          errorMessage: message,
        });
        throw new Error(`dappkit_sign_transaction_failed: ${message}`);
      }

      if (!signed?.signature) {
        throw new Error('dappkit_sign_transaction_failed: no signature returned');
      }

      phase = 'executing';
      setTracedState('executing', { step: 'execute.requested' });
      console.info('[SPONSORED_TX] step=execute calling client.core.executeTransaction', {
        clientType: (client as unknown as { constructor: { name: string } }).constructor.name,
        txBytesType: trace.txBytesType,
        sigsCount: 2,
      });

      let result: Awaited<ReturnType<typeof client.core.executeTransaction>>;
      try {
        result = await client.core.executeTransaction({
          transaction: fromBase64(txBytes),
          signatures: [sponsorSignature, signed.signature],
        });
        trace = sanitizeTrace({
          ...trace,
          step: 'execute.ok',
          executeResultKind: result.$kind,
        });
        console.info('[SPONSORED_TX] step=execute done', {
          resultKind: result.$kind,
        });
      } catch (err) {
        const message = humaniseError(err);
        trace = sanitizeTrace({
          ...trace,
          step: 'execute.failed',
          errorClass: classifySponsoredError(message),
          errorMessage: message,
        });
        throw new Error(`execute_transaction_failed: ${message}`);
      }

      if (result.$kind === 'FailedTransaction') {
        const statusError = result.FailedTransaction.status.error?.message;
        const message = statusError
          ? `Transaction failed: ${statusError}`
          : `Transaction failed: ${result.FailedTransaction.digest}`;
        trace = sanitizeTrace({
          ...trace,
          step: 'execute.failed',
          executeResultKind: result.$kind,
          errorClass: classifySponsoredError(message),
          errorMessage: message,
        });
        throw new Error(message);
      }

      const next = { step: 'done' as const, digest: result.Transaction.digest, error: null, trace };
      setState(next);
      return next;
    } catch (err) {
      const message = `${phase}: ${humaniseError(err)}`;
      trace = sanitizeTrace({
        ...trace,
        errorClass: trace.errorClass ?? classifySponsoredError(message),
        errorMessage: trace.errorMessage ?? message,
      });
      const next = { step: 'error' as const, digest: null, error: message, trace };
      setState(next);
      return next;
    }
  }, [account, client, dAppKit, wallet]);

  return {
    account,
    execute,
    reset,
    state,
  };
}
