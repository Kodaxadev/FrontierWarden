import { Transaction } from '@mysten/sui/transactions';
import { makeSuiJsonRpcClient } from './sui-object-fetcher';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_ORACLE_REGISTRY_ID',
  'VITE_ORACLE_REGISTRY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface CreateChallengeArgs {
  attestationId: string;
  oracleAddress: string;
  evidence: string;
  stakeMist: bigint;
}

export interface VoteChallengeArgs {
  challengeId: string;
  guilty: boolean;
}

export interface ResolveChallengeArgs {
  challengeId: string;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`dispute tx: missing env var ${key}`);
  return value;
}

function oracleRegistryRef(tx: Transaction, mutable: boolean) {
  return tx.sharedObjectRef({
    objectId: requiredEnv('VITE_ORACLE_REGISTRY_ID'),
    initialSharedVersion: Number(requiredEnv('VITE_ORACLE_REGISTRY_VERSION')),
    mutable,
  });
}

function bytes(value: string): number[] {
  const trimmed = value.trim();
  if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed) && trimmed.replace(/^0x/, '').length % 2 === 0) {
    const hex = trimmed.replace(/^0x/, '');
    return Array.from({ length: hex.length / 2 }, (_, i) =>
      Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
    );
  }
  return Array.from(new TextEncoder().encode(trimmed));
}

/**
 * Fetch the initialSharedVersion for a FraudChallenge shared object.
 * FraudChallenge is created via transfer::share_object — its owner field
 * encodes the initial_shared_version needed for mutable shared object refs.
 */
async function fetchChallengeSharedVersion(
  rpcClient: ReturnType<typeof makeSuiJsonRpcClient>,
  challengeId: string,
): Promise<number> {
  const obj = await rpcClient.getObject({
    id: challengeId,
    options: { showBcs: false },
  });
  if (!obj?.data) {
    throw new Error(`dispute tx: FraudChallenge object not found: ${challengeId}`);
  }
  const owner = obj.data.owner;
  if (typeof owner === 'object' && owner !== null && 'Shared' in owner) {
    const v = (owner as { Shared: { initial_shared_version: string | number } }).Shared.initial_shared_version;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  throw new Error(
    `dispute tx: FraudChallenge ${challengeId} is not a shared object (owner: ${JSON.stringify(owner)})`,
  );
}

export function missingDisputeConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function disputeConfigReady(): boolean {
  return missingDisputeConfig().length === 0;
}

export function buildCreateChallengeTx(args: CreateChallengeArgs): Transaction {
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.stakeMist)]);
  const stakeBalance = tx.moveCall({
    target: '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments: [stakeCoin],
  });

  tx.moveCall({
    target: `${requiredEnv('VITE_PKG_ID')}::fraud_challenge::create_fraud_challenge`,
    arguments: [
      oracleRegistryRef(tx, false),
      tx.pure.address(args.attestationId),  // ID is a pure address-sized value, not an owned object
      tx.pure.address(args.oracleAddress),
      tx.pure.vector('u8', bytes(args.evidence)),
      stakeBalance,
    ],
  });

  return tx;
}

/**
 * Build a vote_on_challenge PTB.
 * FraudChallenge is a shared mutable object — must use sharedObjectRef,
 * not tx.object(), to avoid TypeMismatch errors on direct wallet signing.
 */
export async function buildVoteChallengeTx(args: VoteChallengeArgs): Promise<Transaction> {
  const rpcClient = makeSuiJsonRpcClient();

  const initialSharedVersion = await fetchChallengeSharedVersion(rpcClient, args.challengeId);

  const tx = new Transaction();
  tx.moveCall({
    target: `${requiredEnv('VITE_PKG_ID')}::fraud_challenge::vote_on_challenge`,
    arguments: [
      tx.sharedObjectRef({
        objectId: args.challengeId,
        initialSharedVersion,
        mutable: true,
      }),
      oracleRegistryRef(tx, false),
      tx.pure.bool(args.guilty),
    ],
  });
  return tx;
}

/**
 * Build a resolve_challenge PTB.
 * FraudChallenge is a shared mutable object — must use sharedObjectRef,
 * not tx.object(), to avoid TypeMismatch errors on direct wallet signing.
 */
export async function buildResolveChallengeTx(args: ResolveChallengeArgs): Promise<Transaction> {
  const rpcClient = makeSuiJsonRpcClient();

  const initialSharedVersion = await fetchChallengeSharedVersion(rpcClient, args.challengeId);

  const tx = new Transaction();
  tx.moveCall({
    target: `${requiredEnv('VITE_PKG_ID')}::fraud_challenge::resolve_challenge`,
    arguments: [
      tx.sharedObjectRef({
        objectId: args.challengeId,
        initialSharedVersion,
        mutable: true,
      }),
      oracleRegistryRef(tx, true),
    ],
  });
  return tx;
}
