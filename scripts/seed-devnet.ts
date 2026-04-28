/**
 * seed-devnet.ts — Deterministic devnet seeding script.
 *
 * WHAT THIS SCRIPT SEEDS & WHY
 * =============================
 *
 * The seed script executes 4 transactions in sequence to populate all core
 * projection tables with realistic test data. Each transaction targets a
 * specific layer of the protocol:
 *
 * TX-1: BOOTSTRAP LAYER
 *   Functions called: profile::create_profile, oracle_registry::register_oracle
 *   Tables populated: profiles, oracles
 *   Purpose: Establishes the deployer as a registered oracle with a
 *            ReputationProfile SBT (soul-bound token). All subsequent
 *            transactions depend on this oracle's OracleCapability.
 *   Why: Every score write and attestation requires a valid oracle signing
 *        the transaction. The deployer must be known to the protocol.
 *
 * TX-2: CREDIT LAYER
 *   Function called: profile::update_score(CREDIT → 700)
 *   Tables populated: score_cache (composite scores)
 *   Purpose: Sets the deployer's CREDIT score to 700, making them eligible
 *            to vouch for other players (MIN_VOUCH_CREDIT = 500).
 *   Why: Represents the oracle's own creditworthiness. High credit enables
 *        downstream operations like vouching and lending. The value 700 is
 *        a reasonable baseline showing a trustworthy actor.
 *
 * TX-3: VOUCH LAYER
 *   Function called: vouch::create_vouch(deployer → SYNTHETIC.PLAYER_A)
 *   Tables populated: vouches
 *   Purpose: Creates a vouch from the deployer to a synthetic test player
 *            (0x...aaa1). This represents social trust — the deployer
 *            stakes collateral to back PLAYER_A's creditworthiness.
 *   Why: Vouches are the foundation for undercollateralized lending.
 *        Tests that the social trust layer can be bootstrapped. Vouch
 *        objects are transferred to the vouchee (PLAYER_A) on-chain.
 *
 * TX-4: ATTESTATION & INTEL LAYER
 *   Functions called: attestation::issue (×12), singleton::issue_singleton_attestation (×3)
 *   Tables populated: attestations, gate_intel (VIEW), singleton_attestations
 *   Purpose: Seeds two types of attestations:
 *
 *     a) GATE ATTESTATIONS (×12)
 *        - 4 gates (GATE_1–4) with mixed schemas:
 *          GATE_CLEAR (safe), GATE_TOLL (cost), GATE_CAMPED (hostile),
 *          GATE_HOSTILE (high threat), HEAT_TRAP (temperature risk),
 *          ROUTE_VERIFIED (certified path)
 *        - 1 system (SYSTEM_1) with SYSTEM_CONTESTED flag
 *        → Represents real-time gate intel: availability, threats, heat.
 *        → Indexer auto-populates gate_intel VIEW from these rows.
 *
 *     b) SHIP KILL ATTESTATIONS (×3)
 *        - Singleton attestations for combat events:
 *          SHIP_1: Rifter destroyed (1.5M EVT value)
 *          SHIP_2: Rupture ambushed (12M EVT value)
 *          SHIP_3: Harbinger fleet (85M EVT value)
 *        → Represents historical combat kills with metadata (system, target, value).
 *        → Singletons are immutable kill records (permanent-ish, 1000 epoch TTL).
 *
 *   Why: Gate attestations drive routing decisions, threat assessment, and
 *        policy enforcement. Kill attestations feed reputation scores and
 *        bounty systems. Together, they populate the foundation of player
 *        standing and killboard visibility.
 *
 * MISSING: Loans (intentionally empty)
 *   Function NOT called: lending::issue_loan
 *   Tables populated: (none)
 *   Reason: Loans require a two-wallet setup (lender + borrower) due to
 *           SBT constraints on ReputationProfile. See LOAN_SEEDING_NOTE
 *           in scripts/lib/seed-social.ts for full details. The loans
 *           table is intentionally seeded empty; the indexer handles this.
 *
 * POPULATION SUMMARY
 * ===================
 * After running seed-devnet, the following tables are populated:
 *   ✓ profiles (1 row: deployer)
 *   ✓ oracles (1 row: deployer as oracle)
 *   ✓ score_cache (1 row: deployer CREDIT=700)
 *   ✓ vouches (1 row: deployer → PLAYER_A)
 *   ✓ attestations (12 rows: gate intel + 1 system)
 *   ✓ gate_intel VIEW (4 rows: aggregated from attestations)
 *   ✓ singleton_attestations (3 rows: ship kills)
 *   ✗ loans (empty — requires second wallet)
 *
 * SMOKE CHECKS & API VERIFICATION
 * ================================
 * After the seed completes, verify the indexer is synced (wait ~5 seconds)
 * and run these curl commands to confirm tables are populated:
 *
 *   curl http://localhost:3001/scores/<profileId>
 *   curl http://localhost:3001/scores/<profileId>/CREDIT
 *   curl http://localhost:3001/attestations/<deployer_address>
 *   curl http://localhost:3001/leaderboard/CREDIT
 *   curl http://localhost:3001/intel/<system_id>
 *
 * All should return 200 OK with realistic test data.
 *
 * ENVIRONMENT & USAGE
 * ====================
 * Usage:
 *   DEPLOYER_KEY=suiprivkey1... npx tsx scripts/seed-devnet.ts
 *   # or rely on ~/.sui/sui_config/sui.keystore (first entry)
 *
 * Optional env vars:
 *   SUI_RPC_URL=...    override RPC endpoint (default: https://fullnode.devnet.sui.io:443)
 *   GAS_BUDGET=...     override gas budget in MIST (default: 200000000)
 *   INDEXER_URL=...    override indexer base URL for smoke check output (default: http://localhost:3001)
 */
import { loadKeypair, makeClient, execute, findCreatedObject }
  from './lib/seed-wallet.js';
import { PKG, ORACLE_REGISTRY_ID, SYNTHETIC }
  from './lib/seed-config.js';
import { txBootstrap, txSelfScore, txAttestations }
  from './lib/seed-oracle.js';
import { txCreateVouch }
  from './lib/seed-social.js';

async function main(): Promise<void> {
  const keypair = loadKeypair();
  const client  = makeClient();
  const sender  = keypair.getPublicKey().toSuiAddress();

  console.log('=== EFRep Devnet Seed ===');
  console.log(`sender          : ${sender}`);
  console.log(`package         : ${PKG}`);
  console.log(`oracle registry : ${ORACLE_REGISTRY_ID}`);
  console.log('');

  // -------------------------------------------------------------------------
  // TX-1: create profile + register oracle
  // -------------------------------------------------------------------------
  console.log('[1/4] bootstrap: create_profile + register_oracle');
  const r1       = await execute(client, keypair, txBootstrap(sender), 'TX-1');
  const profileId = findCreatedObject(r1.objectChanges, '::profile::ReputationProfile');
  const capId     = findCreatedObject(r1.objectChanges, '::profile::OracleCapability');
  console.log(`  profile ID : ${profileId}`);
  console.log(`  cap ID     : ${capId}`);
  console.log('');

  // -------------------------------------------------------------------------
  // TX-2: set deployer CREDIT score to 700
  // -------------------------------------------------------------------------
  console.log('[2/4] self-score: update_score(CREDIT → 700)');
  await execute(client, keypair, txSelfScore(sender, profileId, capId), 'TX-2');
  console.log('');

  // -------------------------------------------------------------------------
  // TX-3: vouch deployer → SYNTHETIC.PLAYER_A
  // -------------------------------------------------------------------------
  console.log(`[3/4] vouch: create_vouch(deployer → ${SYNTHETIC.PLAYER_A})`);
  await execute(client, keypair, txCreateVouch(sender, profileId), 'TX-3');
  console.log('');

  // -------------------------------------------------------------------------
  // TX-4: gate attestations (×12) + singleton ship kills (×3)
  // -------------------------------------------------------------------------
  console.log('[4/4] attestations: 12 gate + 3 SHIP_KILL');
  await execute(client, keypair, txAttestations(sender), 'TX-4');
  console.log('');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const indexer = process.env.INDEXER_URL ?? 'http://localhost:3001';
  console.log('=== Seed complete ===');
  console.log('');
  console.log('Tables populated:');
  console.log('  profiles, oracles, score_cache, vouches,');
  console.log('  attestations (12 gate), gate_intel VIEW, singleton_attestations (3)');
  console.log('  loans: empty (see LOAN_SEEDING_NOTE in scripts/lib/seed-social.ts)');
  console.log('');
  console.log('Smoke checks (wait ~5 s for indexer to catch up):');
  console.log(`  curl ${indexer}/scores/${profileId}`);
  console.log(`  curl ${indexer}/scores/${profileId}/CREDIT`);
  console.log(`  curl ${indexer}/attestations/${sender}`);
  console.log(`  curl ${indexer}/leaderboard/CREDIT`);
  console.log(`  curl ${indexer}/intel/${SYNTHETIC.SYSTEM_1}`);
}

main().catch(err => {
  console.error('[seed-devnet] fatal:', err);
  process.exit(1);
});
