// tx-transfer-gate-admin.ts -- transfer GateAdminCap to the EVE operator wallet.

import { toBase64 } from '@mysten/bcs';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = ['VITE_GATE_ADMIN_CAP_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

export interface TransferGateAdminArgs {
  client: ClientWithCoreApi;
  sender: string;
  target: string;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingTransferGateAdminConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function transferGateAdminConfigReady(): boolean {
  return missingTransferGateAdminConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`gate admin transfer: missing env var ${key}`);
  return value;
}

export async function buildTransferGateAdminTxKind(
  args: TransferGateAdminArgs,
): Promise<string> {
  const tx = new Transaction();
  tx.setSender(args.sender);
  tx.transferObjects(
    [tx.object(requiredEnv('VITE_GATE_ADMIN_CAP_ID'))],
    tx.pure.address(args.target),
  );
  const kindBytes = await tx.build({ onlyTransactionKind: true, client: args.client });
  return toBase64(kindBytes);
}
