import { toBase64 } from '@mysten/bcs';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, Inputs } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_GATE_POLICY_ID',
  'VITE_GATE_POLICY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildBindWorldGateArgs {
  sender: string;
  gateAdminCapId: string;
  worldGateId: string;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`bind world gate tx: missing env var ${key}`);
  return value;
}

function suiNetwork() {
  return (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
    'mainnet' | 'testnet' | 'devnet' | 'localnet';
}

export async function buildBindWorldGateTxKind(
  args: BuildBindWorldGateArgs,
): Promise<string> {
  const pkgId = requiredEnv('VITE_PKG_ID');
  const gatePolicyId = requiredEnv('VITE_GATE_POLICY_ID');
  const gatePolicyVersion = Number(requiredEnv('VITE_GATE_POLICY_VERSION'));

  if (!Number.isFinite(gatePolicyVersion) || gatePolicyVersion <= 0) {
    throw new Error('bind world gate tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  const network = suiNetwork();
  const rpcClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });

  const adminCapObject = await rpcClient.getObject({
    id: args.gateAdminCapId,
    options: { showBcs: false },
  });
  if (!adminCapObject?.data) {
    throw new Error(`bind world gate tx: failed to fetch AdminCap ${args.gateAdminCapId}`);
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
        objectId: gatePolicyId,
        initialSharedVersion: gatePolicyVersion,
        mutable: true,
      })),
      tx.pure.address(args.worldGateId),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
