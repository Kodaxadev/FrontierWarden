// tx-gate-policy.ts -- Build Smart Gate policy update PTB kind bytes.
//
// IMPORTANT: tx.build must be called WITHOUT a client (same restriction as
// tx-check-passage). All object refs are pre-resolved via SuiJsonRpcClient
// and passed as Inputs.ObjectRef / Inputs.SharedObjectRef.

import { toBase64 } from '@mysten/bcs';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, Inputs } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_GATE_POLICY_ID',
  'VITE_GATE_POLICY_VERSION',
  'VITE_GATE_ADMIN_CAP_ID',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildGatePolicyUpdateArgs {
  sender: string;
  allyThreshold: bigint;
  baseTollMist: bigint;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingGatePolicyConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function gatePolicyConfigReady(): boolean {
  return missingGatePolicyConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`gate policy tx: missing env var ${key}`);
  return value;
}

export async function buildGatePolicyUpdateTxKind(
  args: BuildGatePolicyUpdateArgs,
): Promise<string> {
  const pkgId             = requiredEnv('VITE_PKG_ID');
  const gatePolicyId      = requiredEnv('VITE_GATE_POLICY_ID');
  const gatePolicyVersion = Number(requiredEnv('VITE_GATE_POLICY_VERSION'));
  const gateAdminCapId    = requiredEnv('VITE_GATE_ADMIN_CAP_ID');

  if (!Number.isFinite(gatePolicyVersion) || gatePolicyVersion <= 0) {
    throw new Error('gate policy tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  const suiNetwork = (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
    'mainnet' | 'testnet' | 'devnet' | 'localnet';
  const rpcClient = new SuiJsonRpcClient({
    url:     getJsonRpcFullnodeUrl(suiNetwork),
    network: suiNetwork,
  });

  // Resolve AdminCap version/digest from chain.
  const adminCapObject = await rpcClient.getObject({
    id:      gateAdminCapId,
    options: { showBcs: false },
  });
  if (!adminCapObject?.data) {
    throw new Error(`gate policy tx: failed to fetch AdminCap object ${gateAdminCapId}`);
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  tx.moveCall({
    target: `${pkgId}::reputation_gate::update_thresholds`,
    arguments: [
      tx.object(Inputs.ObjectRef({
        objectId: gateAdminCapId,
        version:  String(adminCapObject.data.version),
        digest:   String(adminCapObject.data.digest),
      })),
      tx.object(Inputs.SharedObjectRef({
        objectId:             gatePolicyId,
        initialSharedVersion: gatePolicyVersion,
        mutable:              true,
      })),
      tx.pure.u64(args.allyThreshold),
      tx.pure.u64(args.baseTollMist),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
