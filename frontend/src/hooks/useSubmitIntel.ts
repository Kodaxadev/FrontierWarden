// useSubmitIntel.ts -- Orchestrates the 4-step sponsored attestation flow.
//
// Steps:
//   1. build   -- construct PTB kind bytes via tx-intel.ts
//   2. sponsor -- gas station wraps into full tx + returns sponsor sig
//   3. sign    -- CurrentAccountSigner (dapp-kit-core) signs the tx bytes
//   4. execute -- submit with [sponsorSig, userSig] to Sui devnet
//
// Single responsibility: flow orchestration + status tracking.

import { useState, useCallback }       from 'react';
import { fromBase64 }                  from '@mysten/bcs';
import { CurrentAccountSigner }        from '@mysten/dapp-kit-core';
import {
  useDAppKit,
  useCurrentAccount,
  useCurrentClient,
}                                      from '@mysten/dapp-kit-react';
import { buildAttestTxKind }           from '../lib/tx-intel';
import { sponsorAttestation }          from '../lib/api';
import type { AttestSchema }           from '../lib/tx-intel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubmitStep =
  | 'idle'
  | 'building'
  | 'sponsoring'
  | 'signing'
  | 'executing'
  | 'done'
  | 'error';

export interface SubmitState {
  step:   SubmitStep;
  digest: string | null;
  error:  string | null;
}

export interface SubmitIntelArgs {
  schema:  AttestSchema;
  subject: string;
  value:   bigint;
}

export interface UseSubmitIntelReturn {
  state:  SubmitState;
  submit: (args: SubmitIntelArgs) => Promise<void>;
  reset:  () => void;
}

// ---------------------------------------------------------------------------
// EInvalidOracle error detection -- Move abort code 4 in attestation.move
// ---------------------------------------------------------------------------

function isOracleError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('MoveAbort') && (msg.includes(', 4)') || msg.includes(':4'));
}

function humaniseError(err: unknown): string {
  if (isOracleError(err)) {
    return (
      'Your wallet is not a registered oracle for this schema. ' +
      'Contact the protocol admin to get your address added.'
    );
  }
  const msg   = String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? first.slice(0, 180) + '...' : first;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const IDLE: SubmitState = { step: 'idle', digest: null, error: null };

export function useSubmitIntel(): UseSubmitIntelReturn {
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const client  = useCurrentClient();
  const [state, setState] = useState<SubmitState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const submit = useCallback(async (args: SubmitIntelArgs) => {
    if (!account) {
      setState({ step: 'error', digest: null, error: 'Wallet not connected.' });
      return;
    }

    try {
      // -- Step 1: build -------------------------------------------------------
      setState({ step: 'building', digest: null, error: null });
      const txKindBytes = await buildAttestTxKind({
        sender:  account.address,
        schema:  args.schema,
        subject: args.subject,
        value:   args.value,
      });

      // -- Step 2: sponsor -----------------------------------------------------
      setState({ step: 'sponsoring', digest: null, error: null });
      const { txBytes, sponsorSignature } = await sponsorAttestation({
        txKindBytes,
        sender: account.address,
      });

      // -- Step 3: sign --------------------------------------------------------
      // CurrentAccountSigner wraps the active wallet and provides
      // signTransaction(bytes: Uint8Array): Promise<SignedTransaction>
      setState({ step: 'signing', digest: null, error: null });
      const signer   = new CurrentAccountSigner(dAppKit);
      const rawBytes = fromBase64(txBytes);
      const signed   = await signer.signTransaction(rawBytes);

      // -- Step 4: execute -----------------------------------------------------
      setState({ step: 'executing', digest: null, error: null });
      const result = await client.core.executeTransaction({
        transaction: fromBase64(txBytes),
        signatures:  [sponsorSignature, signed.signature],
      });

      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      }

      setState({ step: 'done', digest: result.Transaction.digest, error: null });

    } catch (err) {
      setState({ step: 'error', digest: null, error: humaniseError(err) });
    }
  }, [dAppKit, account, client]);

  return { state, submit, reset };
}
