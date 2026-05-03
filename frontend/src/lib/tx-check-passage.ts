// tx-check-passage.ts -- Build Smart Gate check_passage PTB kind bytes.
//
// reputation_gate::check_passage signature:
//   (gate: &mut GatePolicy, attestation: &Attestation, payment: Coin<SUI>, ctx)
//
// IMPORTANT: use SuiJsonRpcClient (not dapp-kit SuiGrpcClient) for object
// resolution (getCoins, getObject). tx.build MUST be called without a client —
// all args are pre-resolved via Inputs.SharedObjectRef / Inputs.ObjectRef and
// onlyTransactionKind skips gas, so no client is needed. Passing any client
// (even SuiJsonRpcClient) in a dapp-kit Provider context triggers valibot
// TransactionDataSchema validation: "Expected Object but received Object".
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
  let step = 'init';
  try {
    step = 'env';
    const pkgId             = requiredEnv('VITE_PKG_ID');
    const gatePolicyId      = requiredEnv('VITE_GATE_POLICY_ID');
    const gatePolicyVersion = normalizeObjectVersion(requiredEnv('VITE_GATE_POLICY_VERSION'));

    const suiNetwork = (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
      'mainnet' | 'testnet' | 'devnet' | 'localnet';

    step = 'rpcClient';
    const rpcClient = new SuiJsonRpcClient({
      url:     getJsonRpcFullnodeUrl(suiNetwork),
      network: suiNetwork,
    });

    console.info('[CHECK_PASSAGE] v5 step=start', { suiNetwork });

    step = 'validate';
    if (BigInt(gatePolicyVersion) <= 0n) {
      throw new Error('check passage tx: VITE_GATE_POLICY_VERSION must be a positive number');
    }
    if (!args.attestationObjectId || args.attestationObjectId.length !== 66) {
      throw new Error(`Cannot attempt gate passage: invalid attestation object ID "${args.attestationObjectId}"`);
    }
    if (!args.sender || !args.sender.startsWith('0x')) {
      throw new Error(`Cannot attempt gate passage: invalid sender address "${args.sender}"`);
    }

    step = 'newTransaction';
    const tx = new Transaction();

    step = 'setSender';
    tx.setSender(args.sender);

    step = 'selectPaymentCoin';
    const paymentMist = args.paymentMist ?? 1n;
    const paymentCoin = await selectPaymentCoin(rpcClient, args.sender, paymentMist);
    console.info('[CHECK_PASSAGE] v5 step=paymentCoin', {
      objectId: paymentCoin.objectId,
      version:  paymentCoin.version,
      digestLen: paymentCoin.digest?.length,
    });

    step = 'gateSharedRef';
    const gateSharedRef = {
      objectId:             normalizeObjectId(gatePolicyId),
      initialSharedVersion: normalizeObjectVersion(gatePolicyVersion),
      mutable:              true,
    };

    step = 'tx.object(gate)';
    const gateArg = tx.object(Inputs.SharedObjectRef(gateSharedRef));
    console.info('[CHECK_PASSAGE] v5 step=gateArg ok');

    step = 'fetchAttestation';
    const attestationObject = await rpcClient.getObject({
      id:      normalizeObjectId(args.attestationObjectId),
      options: { showBcs: false },
    });
    if (!attestationObject?.data) {
      throw new Error(`failed to fetch attestation object ${args.attestationObjectId}`);
    }

    step = 'attestationRef';
    const attestationRef = {
      objectId: normalizeObjectId(args.attestationObjectId),
      version:  normalizeObjectVersion(attestationObject.data.version),
      digest:   String(attestationObject.data.digest),
    };
    console.info('[CHECK_PASSAGE] v5 step=attestationRef', {
      objectId: attestationRef.objectId,
      version:  attestationRef.version,
      digestLen: attestationRef.digest?.length,
    });

    step = 'tx.object(attestation)';
    const attestationArg = tx.object(Inputs.ObjectRef(attestationRef));
    console.info('[CHECK_PASSAGE] v5 step=attestationArg ok');

    step = 'tx.object(payment)';
    const paymentArg = tx.object(Inputs.ObjectRef({
      objectId: paymentCoin.objectId,
      version:  paymentCoin.version,
      digest:   paymentCoin.digest,
    }));
    console.info('[CHECK_PASSAGE] v5 step=paymentArg ok');

    step = 'moveCall';
    tx.moveCall({
      target:    `${pkgId}::reputation_gate::check_passage`,
      arguments: [gateArg, attestationArg, paymentArg],
    });
    console.info('[CHECK_PASSAGE] v5 step=moveCall ok');

    step = 'tx.build';
    const kindBytes = await tx.build({ onlyTransactionKind: true });
    console.info('[CHECK_PASSAGE] v5 step=build ok', { len: kindBytes.length });
    return toBase64(kindBytes);
  } catch (err: unknown) {
    const name  = (err as { name?: string })?.name ?? 'Error';
    const msg   = (err as { message?: string })?.message ?? String(err);
    const stack = (err as { stack?: string })?.stack ?? '(no stack)';
    console.error(`[CHECK_PASSAGE] v5 FAILED at step="${step}"`, { name, msg });
    console.error('[CHECK_PASSAGE] v5 stack:', stack);
    throw new Error(`${step}: [${name}] ${msg}`);
  }
}
