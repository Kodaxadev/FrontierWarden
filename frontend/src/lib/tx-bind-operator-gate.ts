// tx-bind-operator-gate.ts -- Build bind_world_gate PTB kind bytes for a
// tenant/operator's own GatePolicy.
//
// Unlike tx-bind-world-gate.ts (which requires hardcoded env vars for a
// single shared policy), this builder takes all object IDs as runtime
// parameters so any tenant can bind their own policy.
//
// This does NOT call authorize_extension, does NOT borrow OwnerCap<Gate>,
// and does NOT mutate the world Gate. It only records GatePolicy ->
// world_gate_id in the FrontierWarden policy layer.

import { toBase64 } from '@mysten/bcs';
import { Transaction, Inputs } from '@mysten/sui/transactions';
import { resolveObjectRef, extractSharedVersion } from './sui-tx-object-ref';

const CONFIG_KEYS = ['VITE_PKG_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildBindOperatorGateArgs {
  sender: string;
  gatePolicyId: string;
  gateAdminCapId: string;
  worldGateId: string;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingBindOperatorGateConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function bindOperatorGateConfigReady(): boolean {
  return missingBindOperatorGateConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`bind operator gate tx: missing env var ${key}`);
  return value;
}

export async function buildBindOperatorGateTxKind(
  args: BuildBindOperatorGateArgs,
): Promise<string> {
  const pkgId = requiredEnv('VITE_PKG_ID');

  // Resolve GatePolicy and AdminCap from chain (mode-switched: jsonrpc/graphql/shadow).
  const policyRef = await resolveObjectRef(args.gatePolicyId, 'tx-bind-operator-gate');
  const initialSharedVersion = extractSharedVersion(policyRef.owner, 'tx-bind-operator-gate');
  const adminCapRef = await resolveObjectRef(args.gateAdminCapId, 'tx-bind-operator-gate');

  const tx = new Transaction();
  tx.setSender(args.sender);
  tx.moveCall({
    target: `${pkgId}::reputation_gate::bind_world_gate`,
    arguments: [
      tx.object(Inputs.ObjectRef({
        objectId: adminCapRef.objectId,
        version: adminCapRef.version,
        digest: adminCapRef.digest,
      })),
      tx.object(Inputs.SharedObjectRef({
        objectId: args.gatePolicyId,
        initialSharedVersion: initialSharedVersion,
        mutable: true,
      })),
      tx.pure.address(args.worldGateId),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
