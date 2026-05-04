import { toBase64 } from '@mysten/bcs';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_SCHEMA_REGISTRY_ID',
  'VITE_SCHEMA_REGISTRY_VERSION',
  'VITE_ORACLE_REGISTRY_ID',
  'VITE_ORACLE_REGISTRY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface BuildWalletAttestationArgs {
  schemaId: string;
  subject: string;
  value: number;
  expirationEpochs: number;
}

const enc = new TextEncoder();

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

function req(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`wallet attestation tx: missing env var ${key}`);
  return value;
}

function sharedVersion(key: ConfigKey): number {
  const value = Number(req(key));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`wallet attestation tx: ${key} must be a positive integer`);
  }
  return value;
}

export function missingWalletAttestationConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function walletAttestationConfigReady(): boolean {
  return missingWalletAttestationConfig().length === 0;
}

// Only sharedObjectRefs and pure values — no owned-object resolution needed.
// tx.build({ onlyTransactionKind: true }) works without a client.
export async function buildWalletAttestationTxKind(
  args: BuildWalletAttestationArgs & { sender: string },
): Promise<string> {
  const tx = new Transaction();
  tx.setSender(args.sender);

  const attestation = tx.moveCall({
    target: `${req('VITE_PKG_ID')}::attestation::issue`,
    arguments: [
      tx.sharedObjectRef({
        objectId: req('VITE_SCHEMA_REGISTRY_ID'),
        initialSharedVersion: sharedVersion('VITE_SCHEMA_REGISTRY_VERSION'),
        mutable: false,
      }),
      tx.sharedObjectRef({
        objectId: req('VITE_ORACLE_REGISTRY_ID'),
        initialSharedVersion: sharedVersion('VITE_ORACLE_REGISTRY_VERSION'),
        mutable: false,
      }),
      tx.pure.vector('u8', Array.from(enc.encode(args.schemaId))),
      tx.pure.address(args.subject),
      tx.pure.u64(args.value),
      tx.pure.u64(args.expirationEpochs),
    ],
  });

  tx.transferObjects([attestation], args.subject);

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
