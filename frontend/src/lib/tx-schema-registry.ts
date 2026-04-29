// tx-schema-registry.ts — PTB builders for schema_registry entry funs.
// register_schema: callable by registry admin (deployer wallet).
// deprecate_schema: marks old_schema superseded by new_schema.

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
  if (!v) throw new Error(`schema registry tx: missing env var ${k}`);
  return v;
}

function schemaRegRef(tx: Transaction, mutable: boolean) {
  return tx.sharedObjectRef({
    objectId:            req('VITE_SCHEMA_REGISTRY_ID'),
    initialSharedVersion: Number(req('VITE_SCHEMA_REGISTRY_VERSION')),
    mutable,
  });
}

export function missingSchemaConfig(): ConfigKey[] { return CONFIG_KEYS.filter(k => !env(k)); }
export function schemaConfigReady(): boolean       { return missingSchemaConfig().length === 0; }

export interface RegisterSchemaArgs {
  schemaId:  string;        // ASCII e.g. "GATE_HOSTILE"
  version:   number;
  resolver:  string | null; // null → Option::None
  revocable: boolean;
}

export interface DeprecateSchemaArgs {
  oldSchemaId: string;
  newSchemaId: string;
}

const enc = new TextEncoder();

export function buildRegisterSchemaTx(args: RegisterSchemaArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${req('VITE_PKG_ID')}::schema_registry::register_schema`,
    arguments: [
      schemaRegRef(tx, true),
      tx.pure.vector('u8', Array.from(enc.encode(args.schemaId))),
      tx.pure.u64(args.version),
      tx.pure.option('address', args.resolver ?? null),
      tx.pure.bool(args.revocable),
    ],
  });
  return tx;
}

export function buildDeprecateSchemaTx(args: DeprecateSchemaArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${req('VITE_PKG_ID')}::schema_registry::deprecate_schema`,
    arguments: [
      schemaRegRef(tx, true),
      tx.pure.vector('u8', Array.from(enc.encode(args.oldSchemaId))),
      tx.pure.vector('u8', Array.from(enc.encode(args.newSchemaId))),
    ],
  });
  return tx;
}
