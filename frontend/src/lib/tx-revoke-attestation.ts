// tx-revoke-attestation.ts — PTB builder for attestation::revoke.
// Caller must be the attestation's issuer (or the schema resolver).
// Schema must have revocable = true.

import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_SCHEMA_REGISTRY_ID',
  'VITE_SCHEMA_REGISTRY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

function env(k: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[k];
}

function req(k: ConfigKey): string {
  const v = env(k);
  if (!v) throw new Error(`revoke attestation tx: missing env var ${k}`);
  return v;
}

export function missingRevokeConfig(): ConfigKey[] { return CONFIG_KEYS.filter(k => !env(k)); }
export function revokeConfigReady(): boolean       { return missingRevokeConfig().length === 0; }

export interface RevokeAttestationArgs {
  attestationId: string; // object ID of the Attestation to revoke
}

export function buildRevokeAttestationTx(args: RevokeAttestationArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${req('VITE_PKG_ID')}::attestation::revoke`,
    arguments: [
      tx.object(args.attestationId),
      tx.sharedObjectRef({
        objectId:             req('VITE_SCHEMA_REGISTRY_ID'),
        initialSharedVersion: Number(req('VITE_SCHEMA_REGISTRY_VERSION')),
        mutable:              false,
      }),
    ],
  });
  return tx;
}
