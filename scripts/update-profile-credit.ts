/**
 * update-profile-credit.ts — Oracle-signed CREDIT score update for a profile.
 *
 * Usage:
 *   npx tsx scripts/update-profile-credit.ts <profile_id> [score]
 *
 * The active CLI/deployer key must own the OracleCapability in
 * scripts/devnet-addresses.json.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { PKG } from './lib/seed-config.js';
import { execute, loadKeypair, makeClient } from './lib/seed-wallet.js';

interface DevnetAddresses {
  deployer_objects: {
    oracle_cap: { id: string };
  };
}

function loadOracleCapId(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'devnet-addresses.json');
  const addrs = JSON.parse(readFileSync(path, 'utf8')) as DevnetAddresses;
  return addrs.deployer_objects.oracle_cap.id;
}

function encodeStr(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function buildUpdateCreditTx(
  sender: string,
  oracleCapId: string,
  profileId: string,
  score: bigint,
): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  tx.moveCall({
    target: `${PKG}::profile::update_score`,
    arguments: [
      tx.object(oracleCapId),
      tx.object(profileId),
      tx.pure.vector('u8', encodeStr('CREDIT')),
      tx.pure.u64(score),
      tx.pure.u64(1),
    ],
  });

  return tx;
}

async function main(): Promise<void> {
  const profileId = process.argv[2];
  const score = BigInt(process.argv[3] ?? '700');

  if (!profileId || !/^0x[0-9a-fA-F]{64}$/.test(profileId)) {
    throw new Error('Usage: npx tsx scripts/update-profile-credit.ts <profile_id> [score]');
  }

  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const oracleCapId = loadOracleCapId();
  const client = makeClient();

  console.log('=== update-profile-credit ===');
  console.log(`oracle    : ${sender}`);
  console.log(`profile   : ${profileId}`);
  console.log(`score     : ${score}`);
  console.log('');

  const result = await execute(
    client,
    keypair,
    buildUpdateCreditTx(sender, oracleCapId, profileId, score),
    'TX-CREDIT',
  );

  console.log('');
  console.log(`credit score updated: ${result.digest}`);
}

main().catch(err => {
  console.error('[update-profile-credit] fatal:', err);
  process.exit(1);
});
