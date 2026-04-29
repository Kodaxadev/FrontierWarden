// tx-withdraw-tolls.ts -- Build toll withdrawal PTB kind bytes.
//
// reputation_gate::withdraw_tolls signature:
//   (cap: &GateAdminCap, gate: &mut GatePolicy, ctx: &mut TxContext)
//
// Behaviour:
//   - Asserts cap.gate_id == gate.id (ENotAdmin if mismatched)
//   - If treasury balance > 0: splits full balance into a Coin<SUI>,
//     transfers it to gate.owner (the address that created the gate)
//   - If treasury balance == 0: silent no-op (no abort, no event)
//
// The admin keeps their GateAdminCap (borrowed immutably, not consumed).
// No events are emitted by withdraw_tolls — the payout shows up as an
// object transfer in the transaction effects.

import { toBase64 } from '@mysten/bcs';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_GATE_POLICY_ID',
  'VITE_GATE_POLICY_VERSION',
  'VITE_GATE_ADMIN_CAP_ID',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildWithdrawTollsArgs {
  sender: string;
  client: ClientWithCoreApi;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingWithdrawTollsConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function withdrawTollsConfigReady(): boolean {
  return missingWithdrawTollsConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`withdraw tolls tx: missing env var ${key}`);
  return value;
}

export async function buildWithdrawTollsTxKind(
  args: BuildWithdrawTollsArgs,
): Promise<string> {
  const pkgId             = requiredEnv('VITE_PKG_ID');
  const gatePolicyId      = requiredEnv('VITE_GATE_POLICY_ID');
  const gatePolicyVersion = Number(requiredEnv('VITE_GATE_POLICY_VERSION'));
  const gateAdminCapId    = requiredEnv('VITE_GATE_ADMIN_CAP_ID');

  if (!Number.isFinite(gatePolicyVersion) || gatePolicyVersion <= 0) {
    throw new Error('withdraw tolls tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  tx.moveCall({
    target: `${pkgId}::reputation_gate::withdraw_tolls`,
    arguments: [
      // GateAdminCap -- owned by admin, borrowed immutably (&GateAdminCap)
      tx.object(gateAdminCapId),
      // GatePolicy -- shared, mutable (treasury balance is split out)
      tx.sharedObjectRef({
        objectId:             gatePolicyId,
        initialSharedVersion: gatePolicyVersion,
        mutable:              true,
      }),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true, client: args.client });
  return toBase64(kindBytes);
}
