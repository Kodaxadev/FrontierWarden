// useWithdrawTolls -- Sponsored withdraw_tolls transaction hook.
//
// Drains the GatePolicy treasury to gate.owner. Silent no-op if treasury
// is empty (the Move contract does nothing rather than aborting).
// Only the admin wallet (VITE_GATE_ADMIN_OWNER) should call this.

import { useCallback } from 'react';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import { buildWithdrawTollsTxKind, withdrawTollsConfigReady } from '../lib/tx-withdraw-tolls';
import { useSponsoredTransaction } from './useSponsoredTransaction';

export function useWithdrawTolls() {
  const { account, execute, reset, state } = useSponsoredTransaction();
  const client = useCurrentClient();

  const withdrawTolls = useCallback(async () => {
    if (!account) throw new Error('Wallet not connected.');
    if (!withdrawTollsConfigReady()) throw new Error('Gate policy env vars not set.');

    return execute({
      build: () => buildWithdrawTollsTxKind({
        sender: account.address,
        client,
      }),
      gasBudget: 50_000_000,
    });
  }, [account, client, execute]);

  return {
    account,
    state,
    withdrawTolls,
    reset,
  };
}
