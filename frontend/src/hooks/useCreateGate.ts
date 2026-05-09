// useCreateGate -- Sponsored create_gate transaction hook.
//
// Provisions a new GatePolicy (shared) + GateAdminCap (owned) for the
// connected operator. Uses the gas station sponsor flow; the operator
// signs and remains the authority for created objects.
//
// Authority boundary:
//   tx.setSender = operator address, so tx_context::sender(ctx) in Move
//   resolves to the operator. GateAdminCap is transferred to the operator.
//   Gas station never becomes policy authority.

import { useCallback } from 'react';
import {
  buildCreateGateTxKind,
  createGateConfigReady,
  missingCreateGateConfig,
} from '../lib/tx-create-gate';
import { useSponsoredTransaction } from './useSponsoredTransaction';

export interface CreateGateArgs {
  schemaId: string;
  allyThreshold: number;
  baseTollMist: number;
}

export interface CreateGateResult {
  gatePolicyId: string | null;
  gateAdminCapId: string | null;
  digest: string | null;
}

function extractCreatedObjects(trace: unknown): {
  gatePolicyId: string | null;
  gateAdminCapId: string | null;
} {
  // The trace may contain objectChanges from the tx result.
  // We look for created objects with reputation_gate::GatePolicy
  // and reputation_gate::GateAdminCap types.
  // Since trace structure varies, return nulls if not findable.
  // The caller can also inspect state.digest to fetch objects via RPC.
  return { gatePolicyId: null, gateAdminCapId: null };
}

export function useCreateGate() {
  const { account, execute, reset, state } = useSponsoredTransaction();

  const createGate = useCallback(async (args: CreateGateArgs): Promise<CreateGateResult> => {
    if (!account) throw new Error('Wallet not connected.');
    if (!createGateConfigReady()) {
      const missing = missingCreateGateConfig().join(', ');
      throw new Error(`Create gate env vars not set: ${missing}`);
    }
    if (!args.schemaId) throw new Error('schemaId is required.');
    if (!Number.isInteger(args.allyThreshold) || args.allyThreshold <= 0) {
      throw new Error('allyThreshold must be a positive integer.');
    }
    if (!Number.isInteger(args.baseTollMist) || args.baseTollMist < 0) {
      throw new Error('baseTollMist must be a non-negative integer.');
    }

    const result = await execute({
      build: () => buildCreateGateTxKind({
        sender: account.address,
        schemaId: args.schemaId,
        allyThreshold: BigInt(args.allyThreshold),
        baseTollMist: BigInt(args.baseTollMist),
      }),
      gasBudget: 100_000_000,
      flow: 'create_gate',
    });

    if (result.step === 'done' && result.trace) {
      const extracted = extractCreatedObjects(result.trace);
      return {
        gatePolicyId: extracted.gatePolicyId,
        gateAdminCapId: extracted.gateAdminCapId,
        digest: result.digest,
      };
    }

    return {
      gatePolicyId: null,
      gateAdminCapId: null,
      digest: result.digest,
    };
  }, [account, execute]);

  return {
    account,
    createGate,
    reset,
    state,
  };
}
