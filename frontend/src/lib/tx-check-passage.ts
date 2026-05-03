// tx-check-passage.ts -- Build Smart Gate check_passage PTB kind bytes.
//
// reputation_gate::check_passage signature:
//   (gate: &mut GatePolicy, attestation: &Attestation, payment: Coin<SUI>, ctx)
//
// The attestation must:
//   - have schema_id == gate.schema_id (b"TRIBE_STANDING")
//   - have subject == tx sender (anti-laundering check)
//   - not be revoked or expired
//   - value > 0 (score 0 => ENEMY => denied)
//
// Payment: pass a traveler-owned SUI coin into the Move call.
//   ALLY tier (score >= ally_threshold): toll = 0, coin returned to sender.
//   NEUTRAL tier (score < threshold):    toll = base_toll_mist, caller should
//                                        pass paymentMist >= base_toll_mist.

import { toBase64 } from '@mysten/bcs';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction, Inputs } from '@mysten/sui/transactions';

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
  /** Required to resolve owned-object version/digest before building kind bytes. */
  client: ClientWithCoreApi;
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
  client: ClientWithCoreApi,
  owner: string,
  paymentMist: bigint,
): Promise<PaymentCoinRef> {
  const coins = await client.core.listCoins({
    owner,
    coinType: '0x2::sui::SUI',
    limit: 50,
  });
  const selected = coins.objects
    .filter(coin => BigInt(coin.balance) >= paymentMist)
    .sort((a, b) => Number(BigInt(a.balance) - BigInt(b.balance)))[0];

  if (!selected) {
    throw new Error(`No traveler-owned SUI coin has at least ${paymentMist} MIST.`);
  }

  return {
    objectId: normalizeObjectId(String(selected.objectId)),
    version:  normalizeObjectVersion(selected.version),
    digest:   String(selected.digest),
  };
}

export async function buildCheckPassageTxKind(
  args: BuildCheckPassageArgs,
): Promise<string> {
  console.log('[ARG LOGS] buildCheckPassageTxKind called');
  const pkgId            = requiredEnv('VITE_PKG_ID');
  const gatePolicyId     = requiredEnv('VITE_GATE_POLICY_ID');
  const gatePolicyVersion = normalizeObjectVersion(requiredEnv('VITE_GATE_POLICY_VERSION'));

  if (BigInt(gatePolicyVersion) <= 0n) {
    throw new Error('check passage tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  // Defensive validation
  if (!args.attestationObjectId || args.attestationObjectId.length !== 66) {
    throw new Error(`Cannot attempt gate passage: invalid attestation object ID "${args.attestationObjectId}"`);
  }
  if (!args.sender || !args.sender.startsWith('0x')) {
    throw new Error(`Cannot attempt gate passage: invalid sender address "${args.sender}"`);
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  // Use a traveler-owned payment coin. The sponsor still pays gas, but the
  // gate toll economics stay attached to the traveler, not the gas station.
  const paymentMist = args.paymentMist ?? 1n;
  let paymentCoin: PaymentCoinRef;
  try {
    paymentCoin = await selectPaymentCoin(args.client, args.sender, paymentMist);
  } catch (err) {
    throw new Error(`building:selectPaymentCoin: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate payment coin structure before passing to tx.object
  if (!paymentCoin.objectId || !paymentCoin.version || !paymentCoin.digest) {
    throw new Error(`Cannot attempt gate passage: invalid payment coin structure`);
  }

  // Build explicit refs based on Move signature:
  // check_passage(gate: &mut GatePolicy, attestation: &Attestation, payment: Coin<SUI>, ctx)
  // Use tx.object() for all arguments and let SDK resolve with client during build

  console.log('[ARG LOGS] About to construct gateArg with tx.object');
  let gateArg: ReturnType<typeof tx.object>;
  try {
    gateArg = tx.object(normalizeObjectId(gatePolicyId));
    console.log('[ARG LOGS] gateArg constructed successfully');
  } catch (err) {
    console.error('[ARG LOGS] gateArg failed:', err);
    throw new Error(`building:gateArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('[ARG LOGS] About to construct attestationArg with tx.object');
  let attestationArg: ReturnType<typeof tx.object>;
  try {
    attestationArg = tx.object(args.attestationObjectId);
    console.log('[ARG LOGS] attestationArg constructed successfully');
  } catch (err) {
    console.error('[ARG LOGS] attestationArg failed:', err);
    throw new Error(`building:attestationArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('[ARG LOGS] About to construct paymentArg with tx.object');
  let paymentArg: ReturnType<typeof tx.object>;
  try {
    paymentArg = tx.object(paymentCoin.objectId);
    console.log('[ARG LOGS] paymentArg constructed successfully');
  } catch (err) {
    console.error('[ARG LOGS] paymentArg failed:', err);
    throw new Error(`building:paymentArg: ${err instanceof Error ? err.message : String(err)}`);
  }

  const arguments_for_moveCall = [
    gateArg,
    attestationArg,
    paymentArg,
  ];

  console.log('[ARG LOGS] About to call tx.moveCall with target:', `${pkgId}::reputation_gate::check_passage`);
  try {
    tx.moveCall({
      target: `${pkgId}::reputation_gate::check_passage`,
      arguments: arguments_for_moveCall,
    });
  } catch (err) {
    throw new Error(`building:moveCall: ${err instanceof Error ? err.message : String(err)}`);
  }

  // JSON-safe logs before build
  const txData = tx.getData();
  console.log('[GATE PASSAGE JSON LOGS] === before build ===');
  console.log('[GATE PASSAGE JSON LOGS] paymentCoinRef:', JSON.stringify(paymentCoin));
  console.log('[GATE PASSAGE JSON LOGS] selectedGate:', JSON.stringify({ objectId: gatePolicyId, initialSharedVersion: gatePolicyVersion }));
  console.log('[GATE PASSAGE JSON LOGS] selectedAttestation:', JSON.stringify({ objectId: args.attestationObjectId }));
  console.log('[GATE PASSAGE JSON LOGS] tx.getData:', JSON.stringify(txData));
  console.log('[GATE PASSAGE JSON LOGS] === end logs ===');

  let kindBytes: Uint8Array;
  try {
    kindBytes = await tx.build({ onlyTransactionKind: true, client: args.client });
  } catch (err) {
    throw new Error(`building:txBuild: ${err instanceof Error ? err.message : String(err)}`);
  }
  return toBase64(kindBytes);
}
