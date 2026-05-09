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
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, Inputs } from '@mysten/sui/transactions';

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

function suiNetwork() {
  return (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
    'mainnet' | 'testnet' | 'devnet' | 'localnet';
}

export async function buildBindOperatorGateTxKind(
  args: BuildBindOperatorGateArgs,
): Promise<string> {
  const pkgId = requiredEnv('VITE_PKG_ID');

  const network = suiNetwork();
  const rpcClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });

  // Resolve GatePolicy initialSharedVersion from chain.
  const policyObject = await rpcClient.getObject({
    id: args.gatePolicyId,
    options: { showBcs: false },
  });
  if (!policyObject?.data) {
    throw new Error(`bind operator gate tx: failed to fetch GatePolicy ${args.gatePolicyId}`);
  }
  const ownerData = policyObject.data.owner as Record<string, unknown> | undefined;
  const sharedOwner = ownerData?.Shared as Record<string, unknown> | undefined;
  const initialSharedVersion = sharedOwner?.initial_shared_version;
  if (typeof initialSharedVersion !== 'number' || initialSharedVersion <= 0) {
    throw new Error(`bind operator gate tx: GatePolicy ${args.gatePolicyId} is not a shared object or initial version not found`);
  }

  // Resolve AdminCap version/digest from chain.
  const adminCapObject = await rpcClient.getObject({
    id: args.gateAdminCapId,
    options: { showBcs: false },
  });
  if (!adminCapObject?.data) {
    throw new Error(`bind operator gate tx: failed to fetch AdminCap ${args.gateAdminCapId}`);
  }

  const tx = new Transaction();
  tx.setSender(args.sender);
  tx.moveCall({
    target: `${pkgId}::reputation_gate::bind_world_gate`,
    arguments: [
      tx.object(Inputs.ObjectRef({
        objectId: args.gateAdminCapId,
        version: String(adminCapObject.data.version),
        digest: String(adminCapObject.data.digest),
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
