/**
 * seed-tribe-standing.ts — One-shot script to set up TRIBE_STANDING on the
 * live testnet and issue a standing attestation to the GateAdmin (EVE Vault) wallet.
 *
 * What this does (single PTB):
 *   1. schema_registry::register_schema("TRIBE_STANDING", version=1, revocable=true)
 *   2. oracle_registry::add_schema_to_oracle(oracle_reg, old_cap, "TRIBE_STANDING")
 *      → consumes old OracleCapability, transfers a new one back to deployer
 *   3. attestation::issue("TRIBE_STANDING", subject=GATE_ADMIN_ADDR, value=750, ttl=200)
 *      → transferred to GATE_ADMIN_ADDR so they own the attestation object
 *
 * After this runs:
 *   - TRIBE_STANDING is in the SchemaRegistry
 *   - Deployer oracle is authorized for TRIBE_STANDING
 *   - GateAdmin (EVE Vault) wallet owns a TRIBE_STANDING Attestation (value 750, subject = self)
 *   - Indexer will pick up the AttestationIssued event and populate attestations table
 *
 * The new OracleCapability ID is printed. Update testnet-addresses.json manually
 * with the new oracle_cap.id (the old one is consumed by add_schema_to_oracle).
 *
 * Usage:
 *   npx tsx scripts/seed-tribe-standing.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Transaction } from '@mysten/sui/transactions';
import {
  PKG,
  SCHEMA_REGISTRY_ID, SCHEMA_REGISTRY_VERSION,
  ORACLE_REGISTRY_ID, ORACLE_REGISTRY_VERSION,
} from './lib/seed-config.js';
import { loadKeypair, makeClient, execute, findCreatedObject } from './lib/seed-wallet.js';

// ---------------------------------------------------------------------------
// Load addresses from testnet-addresses.json
// ---------------------------------------------------------------------------

interface TestnetAddresses {
  deployer_objects: {
    oracle_cap: { id: string; authorized_schemas?: string[] };
    tribe_standing_attestation_gate_admin?: Record<string, unknown>;
  };
  shared_objects: {
    gate_admin_cap?: { owner?: string };
  };
}

function loadAddresses(): TestnetAddresses {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'testnet-addresses.json');
  return JSON.parse(readFileSync(path, 'utf8')) as TestnetAddresses;
}

function updateAddresses(patch: (raw: Record<string, unknown>) => void): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'testnet-addresses.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  patch(raw);
  writeFileSync(path, JSON.stringify(raw, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Encoding helpers (same pattern as seed-oracle.ts)
// ---------------------------------------------------------------------------

function encodeStr(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

// ---------------------------------------------------------------------------
// PTB: register schema + expand oracle + issue attestation
// ---------------------------------------------------------------------------

function txTribeStanding(
  sender: string,
  oracleCapId: string,
  gateAdminAddress: string,
): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  // Both registries need mutable access in this PTB:
  //   - schema_registry: register_schema writes it; attestation::issue reads it
  //   - oracle_registry: add_schema_to_oracle writes it; attestation::issue reads it
  const schemaReg = tx.sharedObjectRef({
    objectId: SCHEMA_REGISTRY_ID,
    initialSharedVersion: SCHEMA_REGISTRY_VERSION,
    mutable: true,
  });
  const oracleReg = tx.sharedObjectRef({
    objectId: ORACLE_REGISTRY_ID,
    initialSharedVersion: ORACLE_REGISTRY_VERSION,
    mutable: true,
  });

  // 1. Register TRIBE_STANDING schema (deployer is SchemaRegistry admin)
  tx.moveCall({
    target: `${PKG}::schema_registry::register_schema`,
    arguments: [
      schemaReg,
      tx.pure.vector('u8', encodeStr('TRIBE_STANDING')),
      tx.pure.u64(1),                   // version
      tx.pure.option('address', null),  // no custom resolver
      tx.pure.bool(true),               // revocable
    ],
  });

  // 2. Authorize deployer oracle for TRIBE_STANDING
  //    add_schema_to_oracle consumes old_cap and transfers a new cap to sender.
  tx.moveCall({
    target: `${PKG}::oracle_registry::add_schema_to_oracle`,
    arguments: [
      oracleReg,
      tx.object(oracleCapId),   // old OracleCapability -- consumed by this call
      tx.pure.vector('u8', encodeStr('TRIBE_STANDING')),
    ],
  });

  // 3. Issue TRIBE_STANDING attestation to GateAdmin (EVE Vault) wallet
  //    attestation::issue is a public fun (returns Attestation, not entry).
  //    We must transferObjects the result to the intended owner.
  const attest = tx.moveCall({
    target: `${PKG}::attestation::issue`,
    arguments: [
      schemaReg,
      oracleReg,
      tx.pure.vector('u8', encodeStr('TRIBE_STANDING')),
      tx.pure.address(gateAdminAddress),
      tx.pure.u64(750),          // standing score -- ALLY tier (threshold = 500)
      tx.pure.u64(200),          // expiration_epochs -- ~100 days at 2 epochs/day
    ],
  });

  // Transfer attestation to GateAdmin so they own the object for check_passage
  tx.transferObjects([attest], gateAdminAddress);

  return tx;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const addrs       = loadAddresses();
  const oracleCapId = addrs.deployer_objects.oracle_cap.id;
  // GateAdmin (EVE Vault) wallet owns the GateAdminCap and is the traveler for our test passage.
  const gateAdminAddress =
    addrs.shared_objects.gate_admin_cap?.owner
    ?? process.env.GATE_ADMIN_ADDRESS
    ?? '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';

  const keypair = loadKeypair();
  const client  = makeClient();
  const sender  = keypair.getPublicKey().toSuiAddress();

  console.log('=== seed-tribe-standing ===');
  console.log(`deployer        : ${sender}`);
  console.log(`oracle_cap      : ${oracleCapId}`);
  console.log(`gate_admin_addr : ${gateAdminAddress}`);
  console.log(`package         : ${PKG}`);
  console.log('');

  console.log('[1/1] register TRIBE_STANDING + expand oracle + issue attestation');
  const r = await execute(
    client,
    keypair,
    txTribeStanding(sender, oracleCapId, gateAdminAddress),
    'TX-TRIBE',
  );
  console.log('');

  // Extract created objects
  const newOracleCapId   = findCreatedObject(r.objectChanges, '::profile::OracleCapability');
  const attestationId    = findCreatedObject(r.objectChanges, '::attestation::Attestation');

  console.log('=== Results ===');
  console.log(`new oracle_cap  : ${newOracleCapId}`);
  console.log(`attestation_id  : ${attestationId}  (owned by ${gateAdminAddress})`);
  console.log('');

  // Update testnet-addresses.json
  updateAddresses(raw => {
    const deployer = raw.deployer_objects as Record<string, unknown>;
    (deployer.oracle_cap as Record<string, unknown>).id = newOracleCapId;
    (deployer.oracle_cap as Record<string, unknown>).authorized_schemas = [
      'CREDIT', 'GATE_HOSTILE', 'GATE_CAMPED', 'GATE_CLEAR', 'GATE_TOLL',
      'HEAT_TRAP', 'ROUTE_VERIFIED', 'SYSTEM_CONTESTED', 'SHIP_KILL', 'PLAYER_BOUNTY',
      'TRIBE_STANDING',
    ];
    deployer.tribe_standing_attestation_gate_admin = {
      id: attestationId,
      type: '...::attestation::Attestation',
      owner: gateAdminAddress,
      schema: 'TRIBE_STANDING',
      value: 750,
      issued_tx: r.digest,
    };
  });

  console.log('testnet-addresses.json updated (oracle_cap.id + tribe_standing_attestation_gate_admin)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Wait ~5s for indexer to ingest AttestationIssued event');
  console.log(`  2. Verify: curl http://localhost:3000/attestations/${gateAdminAddress}?schema_id=TRIBE_STANDING`);
  console.log('  3. Open FrontierWarden → Gate Intel → connect EVE Vault → CHECK PASSAGE');
}

main().catch(err => {
  console.error('[seed-tribe-standing] fatal:', err);
  process.exit(1);
});
