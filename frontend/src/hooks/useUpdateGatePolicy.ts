import { useCallback } from 'react';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { buildGatePolicyUpdateTxKind } from '../lib/tx-gate-policy';
import { useSponsoredTransaction } from './useSponsoredTransaction';

export interface UpdateGatePolicyArgs {
  allyThreshold: number;
  baseTollMist: number;
}

export function useUpdateGatePolicy() {
  const { account, execute, reset, state } = useSponsoredTransaction();
  const client = useCurrentClient();

  const updatePolicy = useCallback(async (args: UpdateGatePolicyArgs) => {
    // Matches reputation_gate.move: ally_threshold is u64 and EZeroAllyThreshold rejects 0.
    if (!Number.isInteger(args.allyThreshold) || args.allyThreshold <= 0) {
      throw new Error('Ally threshold must be a positive integer.');
    }
    if (!Number.isInteger(args.baseTollMist) || args.baseTollMist < 0) {
      throw new Error('Base toll must be a non-negative integer.');
    }

    return execute({
      build: () => buildGatePolicyUpdateTxKind({
        sender: account?.address ?? '',
        allyThreshold: BigInt(args.allyThreshold),
        baseTollMist: BigInt(args.baseTollMist),
        client,
      }),
      gasBudget: 100_000_000,
    });
  }, [account?.address, client, execute]);

  return {
    account,
    reset,
    state,
    updatePolicy,
  };
}
