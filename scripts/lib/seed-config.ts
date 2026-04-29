/**
 * seed-config.ts — Shared constants, devnet addresses, and synthetic world
 * fixtures for the seed-devnet script.
 *
 * Single responsibility: load config. No side effects, no network calls.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Runtime config (env overrides)
// ---------------------------------------------------------------------------
export const RPC_URL =
  process.env.SUI_RPC_URL ?? defaultRpcUrl();
export const GAS_BUDGET = BigInt(process.env.GAS_BUDGET ?? '200000000');

// ---------------------------------------------------------------------------
// Devnet addresses (loaded from scripts/devnet-addresses.json)
// ---------------------------------------------------------------------------
interface DevnetAddresses {
  network?: string;
  package: { id: string };
  shared_objects: {
    schema_registry: { id: string; initial_version: number };
    oracle_registry:  { id: string; initial_version: number };
  };
}

function loadAddresses(): DevnetAddresses {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, '..', 'devnet-addresses.json');
  return JSON.parse(readFileSync(path, 'utf8')) as DevnetAddresses;
}

function defaultRpcUrl(): string {
  const network = loadAddresses().network ?? 'testnet';
  if (network === 'mainnet') return 'https://fullnode.mainnet.sui.io:443';
  if (network === 'devnet') return 'https://fullnode.devnet.sui.io:443';
  if (network === 'localnet') return 'http://127.0.0.1:9000';
  return 'https://fullnode.testnet.sui.io:443';
}

const addrs = loadAddresses();

export const PKG                      = addrs.package.id;
export const SCHEMA_REGISTRY_ID       = addrs.shared_objects.schema_registry.id;
export const SCHEMA_REGISTRY_VERSION  = addrs.shared_objects.schema_registry.initial_version;
export const ORACLE_REGISTRY_ID       = addrs.shared_objects.oracle_registry.id;
export const ORACLE_REGISTRY_VERSION  = addrs.shared_objects.oracle_registry.initial_version;

// ---------------------------------------------------------------------------
// Oracle schema authorization
// ---------------------------------------------------------------------------
// "CREDIT" is not in SchemaRegistry (no on-chain registration needed) but IS
// required in OracleCapability.authorized_schemas for update_score to pass.
// Gate/combat schemas must match what was registered via register-schemas.ts.
export const ORACLE_SCHEMAS: string[] = [
  'CREDIT',
  'GATE_HOSTILE', 'GATE_CAMPED', 'GATE_CLEAR', 'GATE_TOLL',
  'HEAT_TRAP', 'ROUTE_VERIFIED', 'SYSTEM_CONTESTED',
  'SHIP_KILL', 'PLAYER_BOUNTY',
];

// ---------------------------------------------------------------------------
// Stake amounts
// ---------------------------------------------------------------------------
// MIN_STAKE in oracle_registry.move = 1_000_000_000 MIST (1 SUI).
// Using 1.1 SUI to leave gas headroom inside the split.
export const ORACLE_STAKE_MIST = 1_100_000_000n;
// Vouch stake for create_vouch — must cover MIN_COLLATERAL_PCT of any loan.
export const VOUCH_STAKE_MIST  =   200_000_000n;

// ---------------------------------------------------------------------------
// Synthetic world fixtures (deterministic, 32-byte Sui addresses)
// ---------------------------------------------------------------------------
// These represent fake on-chain objects (gates, ships, players) so the
// seed is reproducible across devnet resets without real game objects.
export const SYNTHETIC = {
  // A second player address (receives vouch from deployer)
  PLAYER_A:  '0x000000000000000000000000000000000000000000000000000000000000aaa1',
  // Gate object IDs (represent stargate structures)
  GATE_1:    '0x0000000000000000000000000000000000000000000000000000000000001111',
  GATE_2:    '0x0000000000000000000000000000000000000000000000000000000000002222',
  GATE_3:    '0x0000000000000000000000000000000000000000000000000000000000003333',
  GATE_4:    '0x0000000000000000000000000000000000000000000000000000000000004444',
  // System object ID (contested star system)
  SYSTEM_1:  '0x000000000000000000000000000000000000000000000000000000000000b001',
  // Ship object IDs (for singleton SHIP_KILL attestations)
  SHIP_1:    '0x0000000000000000000000000000000000000000000000000000000000001a01',
  SHIP_2:    '0x0000000000000000000000000000000000000000000000000000000000001a02',
  SHIP_3:    '0x0000000000000000000000000000000000000000000000000000000000001a03',
} as const;
