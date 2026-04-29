import { Transaction } from '@mysten/sui/transactions';

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
      tx.object(args.attestationId),
      tx.pure.address(args.oracleAddress),
      tx.pure.vector('u8', bytes(args.evidence)),
      stakeBalance,
    ],
  });

  return tx;
}

export function buildVoteChallengeTx(args: VoteChallengeArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${requiredEnv('VITE_PKG_ID')}::fraud_challenge::vote_on_challenge`,
    arguments: [
      tx.object(args.challengeId),
      oracleRegistryRef(tx, false),
      tx.pure.bool(args.guilty),
    ],
  });
  return tx;
}

export function buildResolveChallengeTx(args: ResolveChallengeArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${requiredEnv('VITE_PKG_ID')}::fraud_challenge::resolve_challenge`,
    arguments: [
      tx.object(args.challengeId),
      oracleRegistryRef(tx, true),
    ],
  });
  return tx;
}
