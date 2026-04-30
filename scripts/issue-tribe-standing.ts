/**
 * issue-tribe-standing.ts -- issue TRIBE_STANDING to a target wallet.
 *
 * Precondition: the active deployer key is a registered oracle authorized for
 * TRIBE_STANDING. This script does not register schemas or mutate oracle caps.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import {
  PKG,
  SCHEMA_REGISTRY_ID,
  SCHEMA_REGISTRY_VERSION,
  ORACLE_REGISTRY_ID,
  ORACLE_REGISTRY_VERSION,
} from './lib/seed-config.js';
import { execute, findCreatedObject, loadKeypair, makeClient } from './lib/seed-wallet.js';

const DEFAULT_TARGET =
  '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';
const TARGET = process.env.TRIBE_STANDING_TARGET ?? DEFAULT_TARGET;
const SCORE = Number(process.env.TRIBE_STANDING_SCORE ?? '750');
const TTL_EPOCHS = Number(process.env.TRIBE_STANDING_TTL_EPOCHS ?? '200');

function encodeStr(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function addressesPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, 'testnet-addresses.json');
}

function txIssueStanding(sender: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  const schemaReg = tx.sharedObjectRef({
    objectId: SCHEMA_REGISTRY_ID,
    initialSharedVersion: SCHEMA_REGISTRY_VERSION,
    mutable: false,
  });
  const oracleReg = tx.sharedObjectRef({
    objectId: ORACLE_REGISTRY_ID,
    initialSharedVersion: ORACLE_REGISTRY_VERSION,
    mutable: false,
  });

  const attestation = tx.moveCall({
    target: `${PKG}::attestation::issue`,
    arguments: [
      schemaReg,
      oracleReg,
      tx.pure.vector('u8', encodeStr('TRIBE_STANDING')),
      tx.pure.address(TARGET),
      tx.pure.u64(SCORE),
      tx.pure.u64(TTL_EPOCHS),
    ],
  });

  tx.transferObjects([attestation], TARGET);
  return tx;
}

function recordAttestation(attestationId: string, digest: string): void {
  const path = addressesPath();
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const deployer = raw.deployer_objects as Record<string, unknown>;
  deployer.tribe_standing_attestation_eve = {
    id: attestationId,
    type: '...::attestation::Attestation',
    owner: TARGET,
    schema: 'TRIBE_STANDING',
    value: SCORE,
    issued_tx: digest,
  };
  writeFileSync(path, JSON.stringify(raw, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  if (!Number.isInteger(SCORE) || SCORE <= 0) throw new Error('TRIBE_STANDING_SCORE must be positive');
  if (!Number.isInteger(TTL_EPOCHS) || TTL_EPOCHS <= 0) {
    throw new Error('TRIBE_STANDING_TTL_EPOCHS must be positive');
  }

  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = makeClient();

  console.log('=== issue-tribe-standing ===');
  console.log(`issuer : ${sender}`);
  console.log(`target : ${TARGET}`);
  console.log(`score  : ${SCORE}`);
  console.log('');

  const result = await execute(client, keypair, txIssueStanding(sender), 'TRIBE-STANDING');
  const attestationId = findCreatedObject(result.objectChanges, '::attestation::Attestation');
  recordAttestation(attestationId, result.digest);

  console.log(`attestation_id: ${attestationId}`);
  console.log(`digest        : ${result.digest}`);
  console.log('testnet-addresses.json updated.');
}

main().catch(err => {
  console.error('[issue-tribe-standing] fatal:', err);
  process.exit(1);
});
