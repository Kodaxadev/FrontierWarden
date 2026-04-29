// useSubmitIntel.ts -- Orchestrates the 4-step sponsored attestation flow.
//
// Steps:
//   1. build   -- construct PTB kind bytes via tx-intel.ts
//   2. sponsor -- gas station wraps into full tx + returns sponsor sig
//   3. sign    -- CurrentAccountSigner (dapp-kit-core) signs the tx bytes
//   4. execute -- submit with [sponsorSig, userSig] to the configured Sui network
//
// Single responsibility: flow orchestration + status tracking.

import { useCallback, useState }        from 'react';
import { buildAttestTxKind }           from '../lib/tx-intel';
import { useSponsoredTransaction }      from './useSponsoredTransaction';
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
  const { account, execute, reset: resetSponsored, state } = useSponsoredTransaction();
  const [oracleError, setOracleError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setOracleError(null);
    resetSponsored();
  }, [resetSponsored]);

  const submit = useCallback(async (args: SubmitIntelArgs) => {
    setOracleError(null);

    if (!account) {
      await execute({ build: async () => '' });
      return;
    }

    const result = await execute({
      build: () => buildAttestTxKind({
        sender:  account.address,
        schema:  args.schema,
        subject: args.subject,
        value:   args.value,
      }),
    });

    if (result.step === 'error' && isOracleError(result.error)) {
      setOracleError(humaniseError(result.error));
    }
  }, [account, execute]);

  return {
    state: oracleError ? { ...state, error: oracleError } : state,
    submit,
    reset,
  };
}
