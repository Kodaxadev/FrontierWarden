/**
 * fix-credit-schema.ts — One-shot fix for the score_cache FK failure.
 *
 * Root cause: score_cache.schema_id has a FK → schemas(schema_id).
 * "CREDIT" was not registered in SchemaRegistry (it is only checked via
 * OracleCapability on-chain), so the ScoreUpdated insert failed silently.
 *
 * Fix (two TXs, no DB access needed):
 *   TX-A: register_schema("CREDIT") → indexer inserts into schemas table
 *   TX-B: update_score(CREDIT=700)  → new ScoreUpdated event; indexer picks
 *         it up AFTER CREDIT is in schemas, FK check passes, score_cache row
 *         is inserted
 *
 * Run once after the seed:
 *   npx tsx scripts/fix-credit-schema.ts
 */
import { Transaction }         from '@mysten/sui/transactions';
import { loadKeypair, makeClient, execute, findCreatedObject }
  from './lib/seed-wallet.js';
import {
  PKG,
  SCHEMA_REGISTRY_ID, SCHEMA_REGISTRY_VERSION,
  ORACLE_REGISTRY_ID, ORACLE_REGISTRY_VERSION,
} from './lib/seed-config.js';

const CREDIT_BYTES = Array.from(new TextEncoder().encode('CREDIT'));

async function main(): Promise<void> {
  const keypair = loadKeypair();
  const client  = makeClient();
  const sender  = keypair.getPublicKey().toSuiAddress();

  console.log('=== fix-credit-schema ===');
  console.log(`sender: ${sender}`);

  // --- TX-A: register CREDIT in SchemaRegistry ---
  // Caller must be the SchemaRegistry admin (the deployer).
  console.log('\n[A] registering CREDIT schema...');
  const txA = new Transaction();
  txA.setSender(sender);
  txA.moveCall({
    target: `${PKG}::schema_registry::register_schema`,
    arguments: [
      txA.sharedObjectRef({
        objectId:             SCHEMA_REGISTRY_ID,
        initialSharedVersion: SCHEMA_REGISTRY_VERSION,
        mutable:              true,
      }),
      txA.pure.vector('u8', CREDIT_BYTES),  // schema_id
      txA.pure.u64(1),                       // version
      txA.pure.option('address', null),      // resolver (none)
      txA.pure.bool(true),                   // revocable
    ],
  });
  await execute(client, keypair, txA, 'TX-A register CREDIT');

  // Wait a moment for the indexer to pick up SchemaRegistered(CREDIT)
  // before we emit ScoreUpdated — the FK check must pass.
  console.log('\nWaiting 6 s for indexer to index SchemaRegistered...');
  await new Promise(r => setTimeout(r, 6000));

  // --- TX-B: re-emit update_score(CREDIT=700) ---
  // The profile and cap IDs are taken from env vars set by seed-testnet.ts
  // output, or passed as CLI args.
  const profileId = process.argv[2];
  const capId     = process.argv[3];

  if (!profileId || !capId) {
    console.error(
      '\nUsage: npx tsx scripts/fix-credit-schema.ts <profileId> <capId>\n' +
      'Both IDs are printed by seed-testnet.ts on first run.',
    );
    process.exit(1);
  }

  console.log(`\n[B] re-emitting update_score(CREDIT=700) on profile ${profileId}...`);
  const txB = new Transaction();
  txB.setSender(sender);
  txB.moveCall({
    target: `${PKG}::profile::update_score`,
    arguments: [
      txB.object(capId),
      txB.object(profileId),
      txB.pure.vector('u8', CREDIT_BYTES),
      txB.pure.u64(700),
      txB.pure.u64(1),
    ],
  });
  await execute(client, keypair, txB, 'TX-B update_score');

  console.log('\n✓ Done. Wait ~5 s for indexer then check:');
  console.log(`  Invoke-RestMethod "http://localhost:3000/scores/${profileId}"`);
  console.log(`  Invoke-RestMethod "http://localhost:3000/leaderboard/CREDIT"`);
}

main().catch(err => {
  console.error('[fix-credit-schema] fatal:', err);
  process.exit(1);
});
