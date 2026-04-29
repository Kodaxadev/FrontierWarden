// tx-oracle-register.ts — PTB builder for oracle_registry::register_oracle.
// Any wallet can call this. Stake is pulled from the connected wallet's gas coin.
// Regular oracle: MIN_STAKE = 1 SUI. System oracle: 0.1 SUI.
// Initial schemas may be empty ([]); add more via add_schema_to_oracle later.

import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_ORACLE_REGISTRY_ID',
  'VITE_ORACLE_REGISTRY_VERSION',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export const ORACLE_MIN_STAKE_MIST  = 1_000_000_000n; // 1 SUI  (regular oracle)
export const SYSTEM_MIN_STAKE_MIST  =   100_000_000n; // 0.1 SUI (system oracle)

function env(k: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[k];
}

function req(k: ConfigKey): string {
  const v = env(k);
  if (!v) throw new Error(`oracle register tx: missing env var ${k}`);
  return v;
}

export function missingOracleRegConfig(): ConfigKey[] { return CONFIG_KEYS.filter(k => !env(k)); }
export function oracleRegConfigReady(): boolean       { return missingOracleRegConfig().length === 0; }

export interface RegisterOracleArgs {
  name:               string;
  initialSchemas:     string[];  // ASCII schema IDs; may be empty
  stakeMist:          bigint;
  teeVerified:        boolean;
  teeAttestationHash: string;    // UTF-8 note or hex hash
  isSystemOracle:     boolean;
}

const enc = new TextEncoder();

export function buildRegisterOracleTx(args: RegisterOracleArgs): Transaction {
  const tx = new Transaction();

  // stake: Balance<SUI> — split from gas coin then convert
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.stakeMist)]);
  const stakeBalance = tx.moveCall({
    target:        '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments:     [stakeCoin],
  });

  tx.moveCall({
    target: `${req('VITE_PKG_ID')}::oracle_registry::register_oracle`,
    arguments: [
      tx.sharedObjectRef({
        objectId:             req('VITE_ORACLE_REGISTRY_ID'),
        initialSharedVersion: Number(req('VITE_ORACLE_REGISTRY_VERSION')),
        mutable:              true,
      }),
      tx.pure.vector('u8', Array.from(enc.encode(args.name))),
      // vector<vector<u8>>: each schema ID encoded as UTF-8 bytes
      tx.pure.vector('vector<u8>', args.initialSchemas.map(s => Array.from(enc.encode(s)))),
      stakeBalance,
      tx.pure.bool(args.teeVerified),
      tx.pure.vector('u8', Array.from(enc.encode(args.teeAttestationHash))),
      tx.pure.bool(args.isSystemOracle),
    ],
  });

  return tx;
}
