import { useCallback } from 'react';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import {
  buildTransferGateAdminTxKind,
  transferGateAdminConfigReady,
} from '../lib/tx-transfer-gate-admin';
import { useSponsoredTransaction } from './useSponsoredTransaction';

export function useTransferGateAdminCap() {
  const { account, execute, reset, state } = useSponsoredTransaction();
  const client = useCurrentClient();

  const transfer = useCallback(async (target: string) => {
    if (!transferGateAdminConfigReady()) {
      throw new Error('Gate admin cap env var is not set.');
    }

    return execute({
      build: () => buildTransferGateAdminTxKind({
        client,
        sender: account?.address ?? '',
        target,
      }),
      gasBudget: 50_000_000,
    });
  }, [account?.address, client, execute]);

  return {
    account,
    reset,
    state,
    transfer,
  };
}
