/**
 * seed-oracle.ts — PTB builders for oracle bootstrap, self-scoring,
 * gate attestations, and singleton ship-kill attestations.
 *
 * Exports three Transaction factories:
 *   txBootstrap    — create_profile + register_oracle          (TX-1)
 *   txSelfScore    — update_score(CREDIT=700)                  (TX-2)
 *   txAttestations — 12 gate attestations + 3 ship kills       (TX-4)
 *
 * Single responsibility: oracle-related PTB construction only.
 * Vouch and loan construction lives in seed-social.ts.
 */
import { Transaction }    from '@mysten/sui/transactions';
import { bcs }            from '@mysten/sui/bcs';
import {
  PKG,
  SCHEMA_REGISTRY_ID, SCHEMA_REGISTRY_VERSION,
  ORACLE_REGISTRY_ID, ORACLE_REGISTRY_VERSION,
  ORACLE_SCHEMAS, ORACLE_STAKE_MIST,
  SYNTHETIC,
} from './seed-config.js';

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function encodeStr(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

/**
 * BCS-serialize vector<vector<u8>> for initial_schemas arg in register_oracle.
 * tx.pure.vector('u8', ...) only handles vector<u8>; nested vectors require
 * raw BCS bytes.
 */
function encodeSchemasVec(tx: Transaction, schemas: string[]) {
  const nested = schemas.map(s => Array.from(new TextEncoder().encode(s)));
  const bytes  = bcs.vector(bcs.vector(bcs.u8())).serialize(nested);
  return tx.pure(bytes);
}

// ---------------------------------------------------------------------------
// Shared object refs (reused across builders)
// ---------------------------------------------------------------------------

function schemaRegistryRef(tx: Transaction, mutable: boolean) {
  return tx.sharedObjectRef({
    objectId:             SCHEMA_REGISTRY_ID,
    initialSharedVersion: SCHEMA_REGISTRY_VERSION,
    mutable,
  });
}

function oracleRegistryRef(tx: Transaction, mutable: boolean) {
  return tx.sharedObjectRef({
    objectId:             ORACLE_REGISTRY_ID,
    initialSharedVersion: ORACLE_REGISTRY_VERSION,
    mutable,
  });
}

// ---------------------------------------------------------------------------
// TX-1: create deployer profile + register as oracle
// ---------------------------------------------------------------------------

/**
 * Creates the deployer's ReputationProfile and registers them as a non-system
 * oracle with the full schema set (CREDIT + all gate/combat schemas).
 *
 * After execution, extract from objectChanges:
 *   profileId — ::profile::ReputationProfile
 *   capId     — ::profile::OracleCapability
 */
export function txBootstrap(sender: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  // Create SBT profile for deployer
  tx.moveCall({ target: `${PKG}::profile::create_profile` });

  // Split stake coin and convert to Balance<SUI> (register_oracle takes Balance, not Coin)
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(ORACLE_STAKE_MIST)]);
  const stakeBalance = tx.moveCall({
    target: '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments: [stakeCoin],
  });

  tx.moveCall({
    target: `${PKG}::oracle_registry::register_oracle`,
    arguments: [
      oracleRegistryRef(tx, true),
      tx.pure.vector('u8', encodeStr('FrontierWarden')), // name
      encodeSchemasVec(tx, ORACLE_SCHEMAS),              // initial_schemas
      stakeBalance,                                      // stake: Balance<SUI>
      tx.pure.bool(false),                              // tee_verified
      tx.pure.vector('u8', []),                         // tee_attestation_hash
      tx.pure.bool(false),                              // is_system_oracle
    ],
  });

  return tx;
}

// ---------------------------------------------------------------------------
// TX-2: update deployer's own CREDIT score to 700
// ---------------------------------------------------------------------------

/**
 * Calls profile::update_score on the deployer's own profile.
 *
 * Pre-conditions:
 *   - profileId and capId are owned by sender (output of TX-1)
 *   - OracleCapability.authorized_schemas contains "CREDIT"
 *
 * NOTE: update_score asserts cap.oracle_address == tx_context::sender(ctx).
 * This works here because deployer is both the oracle and the profile owner.
 *
 * Cross-address score writes (e.g., scoring PLAYER_A) are blocked by the SBT
 * constraint — see LOAN_SEEDING_NOTE in seed-social.ts for full explanation.
 */
export function txSelfScore(
  sender: string,
  profileId: string,
  capId: string,
): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  tx.moveCall({
    target: `${PKG}::profile::update_score`,
    arguments: [
      tx.object(capId),                              // &OracleCapability
      tx.object(profileId),                          // &mut ReputationProfile
      tx.pure.vector('u8', encodeStr('CREDIT')),
      tx.pure.u64(700),
      tx.pure.u64(1),                                // attestation_count
    ],
  });

  return tx;
}

// ---------------------------------------------------------------------------
// Gate attestation data (12 total)
// ---------------------------------------------------------------------------

const GATE_ATTESTATIONS: ReadonlyArray<{
  gate: string;
  schema: string;
  value: number;
}> = [
  // Gate 1 — mostly clear with a toll
  { gate: SYNTHETIC.GATE_1, schema: 'GATE_CLEAR',       value: 0  },
  { gate: SYNTHETIC.GATE_1, schema: 'GATE_TOLL',        value: 50 },
  { gate: SYNTHETIC.GATE_1, schema: 'HEAT_TRAP',        value: 20 },
  // Gate 2 — camped and hostile
  { gate: SYNTHETIC.GATE_2, schema: 'GATE_CAMPED',      value: 80 },
  { gate: SYNTHETIC.GATE_2, schema: 'GATE_HOSTILE',     value: 90 },
  { gate: SYNTHETIC.GATE_2, schema: 'ROUTE_VERIFIED',   value: 0  },
  // Gate 3 — safe route
  { gate: SYNTHETIC.GATE_3, schema: 'GATE_CLEAR',       value: 0  },
  { gate: SYNTHETIC.GATE_3, schema: 'ROUTE_VERIFIED',   value: 1  },
  { gate: SYNTHETIC.GATE_3, schema: 'GATE_CAMPED',      value: 30 },
  // Gate 4 — heat trap
  { gate: SYNTHETIC.GATE_4, schema: 'HEAT_TRAP',        value: 75 },
  { gate: SYNTHETIC.GATE_4, schema: 'GATE_HOSTILE',     value: 85 },
  // Contested system
  { gate: SYNTHETIC.SYSTEM_1, schema: 'SYSTEM_CONTESTED', value: 60 },
] as const;

// ---------------------------------------------------------------------------
// Singleton attestation data (3 ship kills)
// ---------------------------------------------------------------------------

const SHIP_KILLS: ReadonlyArray<{
  ship: string;
  value: number;
  metadata: string;
}> = [
  {
    ship: SYNTHETIC.SHIP_1,
    value: 1_500_000,
    metadata: '{"kill":"Rifter destroyed near gate","evt":1500000,"system":"Jita"}',
  },
  {
    ship: SYNTHETIC.SHIP_2,
    value: 12_000_000,
    metadata: '{"kill":"Rupture ambushed at gate camp","evt":12000000,"system":"Amarr"}',
  },
  {
    ship: SYNTHETIC.SHIP_3,
    value: 85_000_000,
    metadata: '{"kill":"Harbinger fleet engagement","evt":85000000,"system":"Dodixie"}',
  },
] as const;

// ---------------------------------------------------------------------------
// TX-4: all attestations in one PTB (gate × 12 + singleton × 3)
// ---------------------------------------------------------------------------

/**
 * Issues 12 gate attestations and 3 singleton ship-kill attestations.
 * All returned objects are transferred to the deployer in a single
 * transferObjects call at the end of the PTB.
 *
 * gate_intel VIEW is auto-populated when gate attestations are indexed
 * (it is a Postgres VIEW over the attestations table, not a separate table).
 */
export function txAttestations(sender: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  const schemaReg  = schemaRegistryRef(tx, false);
  const oracleReg  = oracleRegistryRef(tx, false);
  const toTransfer: ReturnType<Transaction['moveCall']>[] = [];

  // Gate attestations (attestation::issue — public fun, must transferObjects)
  for (const { gate, schema, value } of GATE_ATTESTATIONS) {
    const attest = tx.moveCall({
      target: `${PKG}::attestation::issue`,
      arguments: [
        schemaReg,
        oracleReg,
        tx.pure.vector('u8', encodeStr(schema)),
        tx.pure.address(gate),
        tx.pure.u64(value),
        tx.pure.u64(100),   // expiration_epochs
      ],
    });
    toTransfer.push(attest);
  }

  // Singleton ship-kill attestations
  for (const { ship, value, metadata } of SHIP_KILLS) {
    const singleton = tx.moveCall({
      target: `${PKG}::singleton::issue_singleton_attestation`,
      arguments: [
        schemaReg,
        oracleReg,
        tx.pure.vector('u8', encodeStr('SHIP_KILL')),
        tx.pure.address(ship),
        tx.pure.u64(value),
        tx.pure.vector('u8', encodeStr(metadata)),
        tx.pure.u64(1000),  // expiration_epochs — permanent-ish kill record
      ],
    });
    toTransfer.push(singleton);
  }

  // Transfer all 15 created objects to deployer
  tx.transferObjects(toTransfer, sender);

  return tx;
}
