// tx-check-passage.ts -- Build Smart Gate check_passage PTB kind bytes.
//
// reputation_gate::check_passage signature:
//   (gate: &mut GatePolicy, attestation: &Attestation, payment: Coin<SUI>, ctx)
//
// IMPORTANT: use SuiJsonRpcClient (not dapp-kit SuiGrpcClient) for all object
// resolution and tx.build. The gRPC resolver triggers valibot CallArgSchema
// validation that throws "Invalid type: Expected Object but received Object".
// Confirmed by scripts/debug-build-check-passage.ts (dev diagnostic only).

import { toBase64 } from '@mysten/bcs';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, Inputs } from '@mysten/sui/transactions';

// Active only in dev builds with VITE_DEBUG_TX=true.
const devLog = import.meta.env.DEV && import.meta.env.VITE_DEBUG_TX === 'true'
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_GATE_POLICY_ID',
  'VITE_GATE_POLICY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildCheckPassageArgs {
  sender: string;
  /** Object ID of the traveler's owned TRIBE_STANDING Attestation. */
  attestationObjectId: string;
  /**
   * MIST to split from gas for the payment coin.
   * For ALLY tier (toll == 0) pass 1n — the coin is returned in full.
   * For NEUTRAL tier pass base_toll_mist or higher.
   * Defaults to 1n.
   */
  paymentMist?: bigint;
}

interface PaymentCoinRef {
  objectId: string;
  version: string;
  digest: string;
}

function normalizeObjectId(value: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Cannot attempt gate passage: invalid object ID "${value}"`);
  }
  return value;
}

function normalizeObjectVersion(value: string | number | bigint): string {
  const version = value.toString();
  if (!/^\d+$/.test(version)) {
    throw new Error(`Cannot attempt gate passage: invalid object version "${version}"`);
  }
  return version;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingCheckPassageConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function checkPassageConfigReady(): boolean {
  return missingCheckPassageConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`check passage tx: missing env var ${key}`);
  return value;
}

async function selectPaymentCoin(
  client: SuiJsonRpcClient,
  owner: string,
  paymentMist: bigint,
): Promise<PaymentCoinRef> {
  const result = await client.getCoins({
    owner,
    coinType: '0x2::sui::SUI',
    limit: 50,
  });
  const selected = result.data
    .filter(coin => BigInt(coin.balance) >= paymentMist)
    .sort((a, b) => Number(BigInt(a.balance) - BigInt(b.balance)))[0];

  if (!selected) {
    throw new Error(`No traveler-owned SUI coin has at least ${paymentMist} MIST.`);
  }

  return {
    objectId: normalizeObjectId(String(selected.coinObjectId)),
    version:  normalizeObjectVersion(selected.version),
    digest:   String(selected.digest),
  };
}

export async function buildCheckPassageTxKind(
  args: BuildCheckPassageArgs,
): Promise<string> {
  const pkgId             = requiredEnv('VITE_PKG_ID');
  const gatePolicyId      = requiredEnv('VITE_GATE_POLICY_ID');
  const gatePolicyVersion = normalizeObjectVersion(requiredEnv('VITE_GATE_POLICY_VERSION'));

  const suiNetwork = (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
    'mainnet' | 'testnet' | 'devnet' | 'localnet';

  // JSON-RPC client — must NOT be replaced with dapp-kit SuiGrpcClient.
  // See file header comment and scripts/debug-build-check-passage.ts.
  const rpcClient = new SuiJsonRpcClient({
    url:     getJsonRpcFullnodeUrl(suiNetwork),
    network: suiNetwork,
  });

  if (import.meta.env.DEV) {
    console.log('[tx-check-passage] build client:', rpcClient.constructor.name);
  }

  const safeJson = (value: unknown) =>
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? `${v}n` : v), 2);

  if (BigInt(gatePolicyVersion) <= 0n) {
    throw new Error('check passage tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  if (!args.attestationObjectId || args.attestationObjectId.length !== 66) {
    throw new Error(`Cannot attempt gate passage: invalid attestation object ID "${args.attestationObjectId}"`);
  }
  if (!args.sender || !args.sender.startsWith('0x')) {
    throw new Error(`Cannot attempt gate passage: invalid sender address "${args.sender}"`);
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  const paymentMist = args.paymentMist ?? 1n;
  let paymentCoin: PaymentCoinRef;
  try {
    paymentCoin = await selectPaymentCoin(rpcClient, args.sender, paymentMist);
  } catch (err) {
    throw new Error(`building:selectPaymentCoin: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!paymentCoin.objectId || !paymentCoin.version || !paymentCoin.digest) {
    throw new Error(`Cannot attempt gate passage: invalid payment coin structure`);
  }

  const gateSharedRef = {
    objectId:             normalizeObjectId(gatePolicyId),
    initialSharedVersion: normalizeObjectVersion(gatePolicyVersion),
    mutable:              true,
  };
  devLog('[gate passage] gateSharedRef:', safeJson(gateSharedRef));

  let gateArg: ReturnType<typeof tx.object>;
  try {
    gateArg = tx.object(Inputs.SharedObjectRef(gateSharedRef));
  } catch (err) {
    throw new Error(`building:gateArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  let attestationObject;
  try {
    attestationObject = await rpcClient.getObject({
      id:      normalizeObjectId(args.attestationObjectId),
      options: { showBcs: false },
    });
  } catch (err) {
    throw new Error(`building:fetchAttestation: ${err instanceof Error ? err.message : String(err)}`);
  }
  devLog('[gate passage] attestation getObject:', safeJson(attestationObject));

  if (!attestationObject || !attestationObject.data) {
    throw new Error(`Cannot attempt gate passage: failed to fetch attestation object ${args.attestationObjectId}`);
  }

  const attestationRef = {
    objectId: normalizeObjectId(args.attestationObjectId),
    version:  normalizeObjectVersion(attestationObject.data.version),
    digest:   String(attestationObject.data.digest),
  };
  devLog('[gate passage] attestationRef:', safeJson(attestationRef));

  if (!attestationRef.objectId || !attestationRef.version || !attestationRef.digest) {
    throw new Error(`Cannot attempt gate passage: attestation object ref is incomplete: ${safeJson(attestationRef)}`);
  }

  let attestationArg: ReturnType<typeof tx.object>;
  try {
    attestationArg = tx.object(Inputs.ObjectRef({
      objectId: attestationRef.objectId,
      version:  attestationRef.version,
      digest:   attestationRef.digest,
    }));
  } catch (err) {
    throw new Error(`building:attestationArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  const paymentObjectRef = {
    objectId: paymentCoin.objectId,
    version:  paymentCoin.version,
    digest:   paymentCoin.digest,
  };
  devLog('[gate passage] paymentObjectRef:', safeJson(paymentObjectRef));

  let paymentArg: ReturnType<typeof tx.object>;
  try {
    paymentArg = tx.object(Inputs.ObjectRef(paymentObjectRef));
  } catch (err) {
    throw new Error(`building:paymentArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    tx.moveCall({
      target:    `${pkgId}::reputation_gate::check_passage`,
      arguments: [gateArg, attestationArg, paymentArg],
    });
  } catch (err) {
    throw new Error(`building:moveCall: ${err instanceof Error ? err.message : String(err)}`);
  }
  devLog('[gate passage] tx.getData after moveCall:', safeJson(tx.getData()));

  let kindBytes: Uint8Array;
  try {
    kindBytes = await tx.build({ onlyTransactionKind: true, client: rpcClient });
  } catch (err) {
    throw new Error(`building:txBuild: ${err instanceof Error ? err.message : String(err)}`);
  }
  return toBase64(kindBytes);
}
