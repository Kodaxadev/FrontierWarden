/**
 * reset-profile-cursor.cjs — Resets the indexer's profile module cursor so
 * the rebuilt indexer replays all profile events (ProfileCreated + ScoreUpdated).
 * Also inserts a synthetic schemas row for CREDIT so the FK check passes
 * on first replay.
 *
 * Run ONCE before restarting the indexer after the profile.rs fix:
 *   node scripts/reset-profile-cursor.cjs
 */
const { Client } = require('pg');

const DB_URL = process.env.EFREP_DATABASE_URL;

if (!DB_URL) {
  console.error('EFREP_DATABASE_URL is required.');
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('connected to Supabase');

  // 1. Ensure CREDIT exists in schemas (FK guard)
  const ins = await client.query(`
    INSERT INTO schemas (schema_id, version, registered_tx)
    VALUES ('CREDIT', 1, 'synthetic-score-update')
    ON CONFLICT (schema_id) DO NOTHING
    RETURNING schema_id
  `);
  if (ins.rowCount > 0) {
    console.log('inserted CREDIT into schemas');
  } else {
    console.log('CREDIT already in schemas — skipped');
  }

  // 2. Delete the profile module cursor so the indexer re-processes from genesis
  const del = await client.query(`
    DELETE FROM indexer_state WHERE key = 'cursor:profile'
    RETURNING key
  `);
  if (del.rowCount > 0) {
    console.log('deleted cursor:profile from indexer_state — will replay from genesis');
  } else {
    console.log('cursor:profile not found (already cleared or never set)');
  }

  await client.end();
  console.log('\ndone — restart the indexer now');
}

main().catch(err => {
  console.error('fatal:', err.message);
  process.exit(1);
});
