// tx-create-gate.ts -- Build reputation_gate::create_gate PTB kind bytes.
//
// Provisions a new GatePolicy (shared) + GateAdminCap (owned) for the
// connected operator. Unlike other tx builders, this does NOT require
// pre-existing policy IDs from env vars — it creates new ones.
//
// Authority boundary:
//   tx.setSender(sender) ensures tx_context::sender(ctx) resolves to the
//   operator wallet, not the gas station. The GateAdminCap is transferred
//   to the operator. The GatePolicy is shared.

import { toBase64 } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = ['VITE_PKG_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildCreateGateArgs {
  sender: string;
  schemaId: string;
  allyThreshold: bigint;
  baseTollMist: bigint;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingCreateGateConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function createGateConfigReady(): boolean {
  return missingCreateGateConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`create gate tx: missing env var ${key}`);
  return value;
}

export async function buildCreateGateTxKind(
  args: BuildCreateGateArgs,
): Promise<string> {
  const pkgId = requiredEnv('VITE_PKG_ID');

  const tx = new Transaction();
  tx.setSender(args.sender);

  tx.moveCall({
    target: `${pkgId}::reputation_gate::create_gate`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(args.schemaId))),
      tx.pure.u64(args.allyThreshold),
      tx.pure.u64(args.baseTollMist),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
