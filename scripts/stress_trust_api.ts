/**
 * stress_trust_api.ts — Concurrent stress tests for Trust API v1.
 *
 * USAGE
 * =====
 *   npx tsx scripts/stress_trust_api.ts
 *
 * Optional env vars:
 *   TRUST_API_URL=...       override endpoint (default: http://localhost:3000/v1/trust/evaluate)
 *   DB_URL=...              PostgreSQL URL for preflight + seeding
 *   CONCURRENCY=...         requests per scenario (default: 10)
 *   API_KEY=...             optional x-api-key header
 *   SEED=1                  enable auto-seeding of test fixtures
 *
 * PASS CRITERIA
 * =============
 *   0 failed HTTP requests
 *   0 schema mismatches
 *   0 decision mismatches
 *   p95 < 250ms (local/dev)
 *   p99 < 500ms (local/dev)
 */

const TRUST_API_URL = process.env.TRUST_API_URL ?? 'http://localhost:3000/v1/trust/evaluate';
const DB_URL = process.env.DB_URL;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '10');
const API_KEY = process.env.API_KEY;
const SEED = process.env.SEED === '1';

// ---------------------------------------------------------------------------
// Seeded fixtures — these get verified in preflight and optionally created
// ---------------------------------------------------------------------------

const GATE_ID = '0x000000000000000000000000000000000000000000000000000000000057a101';
const SCHEMA_ID = 'TRIBE_STANDING';
const SUBJECT_ALLOW = '0x0000000000000000000000000000000000000000000000000000000000a110w1';
const SUBJECT_DENY = '0x0000000000000000000000000000000000000000000000000000000000d3ny01';
const SUBJECT_NO_GATE = '0x0000000000000000000000000000000000000000000000000000000000aa0001';
const MISSING_GATE = '0x0000000000000000000000000000000000000000000000000000000000bad001';
const COUNTERPARTY_ALLOW_MIN = 500;

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function preflight(): Promise<{ ok: boolean; issues: string[]; fixtures: FixtureInfo | null }> {
  if (!DB_URL) {
    console.log('  PREFLIGHT: DB_URL not set — skipping fixture verification');
    return { ok: true, issues: [], fixtures: null };
  }

  const { Client } = await import('pg');
  const client = new Client(DB_URL);
  await client.connect();

  const issues: string[] = [];
  let fixtures: FixtureInfo = {
    gateExists: false,
    allowScore: null,
    denyHasAttestation: false,
    counterpartyAllowScore: null,
  };

  try {
    // Check gate exists
    const gateRow = await client.query(
      'SELECT COUNT(*) AS count FROM gate_config_updates WHERE gate_id = $1',
      [GATE_ID]
    );
    fixtures.gateExists = parseInt(gateRow.rows[0].count) > 0;
    if (!fixtures.gateExists) issues.push(`gate ${GATE_ID} not found in gate_config_updates`);

    // Check allow subject score
    const allowRow = await client.query(
      `SELECT value FROM attestations
       WHERE subject = $1 AND schema_id = $2 AND NOT revoked
       ORDER BY issued_at DESC LIMIT 1`,
      [SUBJECT_ALLOW, SCHEMA_ID]
    );
    fixtures.allowScore = allowRow.rows[0]?.value ?? null;
    if (fixtures.allowScore === null) issues.push(`no active attestation for allow subject ${SUBJECT_ALLOW}`);
    else if (fixtures.allowScore < 500) issues.push(`allow subject score ${fixtures.allowScore} < 500 threshold`);

    // Check deny subject — should have no attestation for gate DENY test
    const denyRow = await client.query(
      `SELECT COUNT(*) AS count FROM attestations
       WHERE subject = $1 AND schema_id = $2 AND NOT revoked`,
      [SUBJECT_DENY, SCHEMA_ID]
    );
    fixtures.denyHasAttestation = parseInt(denyRow.rows[0].count) > 0;

    // Check counterparty allow subject
    const cpRow = await client.query(
      `SELECT value FROM attestations
       WHERE subject = $1 AND schema_id = $2 AND NOT revoked
       ORDER BY issued_at DESC LIMIT 1`,
      [SUBJECT_ALLOW, SCHEMA_ID]
    );
    fixtures.counterpartyAllowScore = cpRow.rows[0]?.value ?? null;

  } finally {
    await client.end();
  }

  return { ok: issues.length === 0, issues, fixtures };
}

interface FixtureInfo {
  gateExists: boolean;
  allowScore: number | null;
  denyHasAttestation: boolean;
  counterpartyAllowScore: number | null;
}

// ---------------------------------------------------------------------------
// Auto-seeding
// ---------------------------------------------------------------------------

async function seedFixtures(): Promise<void> {
  if (!DB_URL) return;
  const { Client } = await import('pg');
  const client = new Client(DB_URL);
  await client.connect();

  try {
    // Insert gate
    await client.query(
      `INSERT INTO gate_config_updates (gate_id, ally_threshold, base_toll_mist, tx_digest, event_seq, checkpoint_seq)
       VALUES ($1, 500, 100000000, $2, 1, 100)
       ON CONFLICT (tx_digest, event_seq) DO NOTHING`,
      [GATE_ID, 'seed_gate_tx']
    );

    // Insert allow attestation (score 750)
    await client.query(
      `INSERT INTO schemas (schema_id, version, registered_tx)
       VALUES ($1, 1, 'seed_schema_tx') ON CONFLICT DO NOTHING`,
      [SCHEMA_ID]
    );

    await client.query(
      `INSERT INTO attestations (attestation_id, schema_id, issuer, subject, value, issued_tx)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (attestation_id) DO UPDATE SET value = EXCLUDED.value`,
      ['0xseed_allow', SCHEMA_ID, '0xseed_issuer', SUBJECT_ALLOW, 750, 'seed_allow_tx']
    );

    // Insert deny attestation (score 0) — for counterparty_risk DENY
    await client.query(
      `INSERT INTO attestations (attestation_id, schema_id, issuer, subject, value, issued_tx)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (attestation_id) DO UPDATE SET value = EXCLUDED.value`,
      ['0xseed_deny', SCHEMA_ID, '0xseed_issuer', SUBJECT_DENY, 0, 'seed_deny_tx']
    );

    // Insert raw events so freshness queries work
    await client.query(
      `INSERT INTO raw_events (chain, package_id, module_name, event_type, tx_digest, event_seq, checkpoint_seq, payload)
       VALUES ('sui', $1, 'attestation', 'AttestationIssued', $2, 1, 101, '{}')
       ON CONFLICT (tx_digest, event_seq, created_at) DO NOTHING`,
      ['0xseed_pkg', 'seed_allow_tx']
    );

    console.log('  SEED: fixtures inserted');
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  payload: Record<string, unknown>;
  validate: (body: unknown, errors: string[]) => void;
}

function assertField(body: Record<string, unknown>, field: string, errors: string[]) {
  if (!(field in body)) errors.push(`missing field: ${field}`);
}

function assertFieldAbsent(body: Record<string, unknown>, field: string, errors: string[]) {
  if (field in body) errors.push(`unexpected field: ${field}`);
}

function scenariosForFixtures(fixtures: FixtureInfo | null): Scenario[] {
  const hasGate = fixtures?.gateExists ?? false;
  const allowScore = fixtures?.allowScore ?? 750;
  const denyHasAttestation = fixtures?.denyHasAttestation ?? false;

  const scenarios: Scenario[] = [];

  if (hasGate) {
    // Gate access scenarios (only valid when gate exists)
    scenarios.push({
      name: 'gate_access ALLOW_FREE',
      payload: { entity: SUBJECT_ALLOW, action: 'gate_access', context: { gateId: GATE_ID, schemaId: SCHEMA_ID } },
      validate(body, errors) {
        const b = body as Record<string, unknown>;
        assertField(b, 'apiVersion', errors);
        assertField(b, 'action', errors);
        assertField(b, 'decision', errors);
        assertField(b, 'allow', errors);
        assertField(b, 'gateId', errors);
        if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
        if (b.action !== 'gate_access') errors.push(`action mismatch: ${b.action}`);
        if (b.decision !== 'ALLOW_FREE' && b.decision !== 'ALLOW_TAXED') {
          errors.push(`decision mismatch: expected ALLOW_FREE or ALLOW_TAXED, got ${b.decision}`);
        }
        if (b.allow !== true) errors.push(`allow mismatch: expected true, got ${b.allow}`);
      },
    });

    scenarios.push({
      name: 'gate_access DENY (no attestation)',
      payload: { entity: denyHasAttestation ? SUBJECT_NO_GATE : SUBJECT_DENY, action: 'gate_access', context: { gateId: GATE_ID, schemaId: SCHEMA_ID } },
      validate(body, errors) {
        const b = body as Record<string, unknown>;
        assertField(b, 'apiVersion', errors);
        assertField(b, 'action', errors);
        assertField(b, 'decision', errors);
        assertField(b, 'gateId', errors);
        if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
        if (b.action !== 'gate_access') errors.push(`action mismatch: ${b.action}`);
        if (b.decision !== 'DENY') errors.push(`decision mismatch: expected DENY, got ${b.decision}`);
      },
    });
  }

  // Counterparty scenarios (don't require gate)
  scenarios.push({
    name: 'counterparty_risk ALLOW',
    payload: { entity: SUBJECT_ALLOW, action: 'counterparty_risk', context: { schemaId: SCHEMA_ID, minimumScore: COUNTERPARTY_ALLOW_MIN } },
    validate(body, errors) {
      const b = body as Record<string, unknown>;
      assertField(b, 'apiVersion', errors);
      assertField(b, 'action', errors);
      assertField(b, 'decision', errors);
      assertField(b, 'allow', errors);
      if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
      if (b.action !== 'counterparty_risk') errors.push(`action mismatch: ${b.action}`);
      if (b.decision !== 'ALLOW') errors.push(`decision mismatch: expected ALLOW, got ${b.decision}`);
      if (b.allow !== true) errors.push(`allow mismatch: expected true, got ${b.allow}`);
      assertFieldAbsent(b, 'gateId', errors);
      assertFieldAbsent(b, 'tollMultiplier', errors);
      assertFieldAbsent(b, 'tollMist', errors);
    },
  });

  scenarios.push({
    name: 'counterparty_risk DENY (low score)',
    payload: { entity: SUBJECT_DENY, action: 'counterparty_risk', context: { schemaId: SCHEMA_ID, minimumScore: COUNTERPARTY_ALLOW_MIN } },
    validate(body, errors) {
      const b = body as Record<string, unknown>;
      assertField(b, 'apiVersion', errors);
      assertField(b, 'action', errors);
      assertField(b, 'decision', errors);
      if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
      if (b.action !== 'counterparty_risk') errors.push(`action mismatch: ${b.action}`);
      if (b.decision !== 'DENY') errors.push(`decision mismatch: expected DENY, got ${b.decision}`);
      assertFieldAbsent(b, 'gateId', errors);
    },
  });

  // Gate-independent scenarios
  scenarios.push({
    name: 'missing gate → INSUFFICIENT_DATA',
    payload: { entity: SUBJECT_ALLOW, action: 'gate_access', context: { gateId: MISSING_GATE, schemaId: SCHEMA_ID } },
    validate(body, errors) {
      const b = body as Record<string, unknown>;
      assertField(b, 'apiVersion', errors);
      assertField(b, 'decision', errors);
      if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
      if (b.decision !== 'INSUFFICIENT_DATA') errors.push(`decision mismatch: expected INSUFFICIENT_DATA, got ${b.decision}`);
    },
  });

  scenarios.push({
    name: 'unsupported action → INSUFFICIENT_DATA',
    payload: { entity: SUBJECT_ALLOW, action: 'bounty_evaluation', context: { schemaId: SCHEMA_ID } },
    validate(body, errors) {
      const b = body as Record<string, unknown>;
      assertField(b, 'apiVersion', errors);
      assertField(b, 'decision', errors);
      if (b.apiVersion !== 'trust.v1') errors.push(`apiVersion mismatch: ${b.apiVersion}`);
      if (b.decision !== 'INSUFFICIENT_DATA') errors.push(`decision mismatch: expected INSUFFICIENT_DATA, got ${b.decision}`);
      assertFieldAbsent(b, 'gateId', errors);
    },
  });

  return scenarios;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface Timing { p50: number; p95: number; p99: number; max: number; }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function computeTiming(ms: number[]): Timing {
  const sorted = [...ms].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99), max: sorted[sorted.length - 1] ?? 0 };
}

async function runScenario(scenario: Scenario, count: number) {
  const results = await Promise.all(
    Array.from({ length: count }, async () => {
      const start = performance.now();
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (API_KEY) headers['x-api-key'] = API_KEY;
        const res = await fetch(TRUST_API_URL, { method: 'POST', headers, body: JSON.stringify(scenario.payload) });
        const latency = performance.now() - start;
        const text = await res.text();
        const errors: string[] = [];
        let body: unknown;
        try { body = JSON.parse(text); } catch { errors.push(`invalid JSON: ${text.substring(0, 200)}`); return { latency, errors, httpError: false }; }
        if (res.status !== 200) errors.push(`HTTP ${res.status}`);
        scenario.validate(body, errors);
        return { latency, errors, httpError: false };
      } catch (e: unknown) {
        return { latency: performance.now() - start, errors: [e instanceof Error ? e.message : String(e)], httpError: true };
      }
    })
  );

  let success = 0, httpErrors = 0, schemaMismatches = 0, decisionMismatches = 0;
  const latencies: number[] = [];
  const allErrors: string[] = [];

  for (const r of results) {
    latencies.push(r.latency);
    if (r.httpError) { httpErrors++; allErrors.push(...r.errors); }
    else if (r.errors.length > 0) {
      for (const e of r.errors) {
        if (e.includes('decision')) decisionMismatches++;
        else if (e.includes('mismatch') || e.includes('missing') || e.includes('unexpected')) schemaMismatches++;
      }
      allErrors.push(...r.errors);
    } else { success++; }
  }

  return { total: count, success, httpErrors, schemaMismatches, decisionMismatches, latencies, errors: allErrors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nTrust API v1 Stress Test`);
  console.log(`Endpoint: ${TRUST_API_URL}`);
  console.log(`Concurrency per scenario: ${CONCURRENCY}`);

  // Preflight
  console.log(`\n  PREFLIGHT`);
  const preflightResult = await preflight();
  if (!preflightResult.ok) {
    console.log(`  Issues found:`);
    for (const issue of preflightResult.issues) console.log(`    - ${issue}`);

    if (SEED && DB_URL) {
      console.log(`  SEED flag enabled — inserting fixtures...`);
      await seedFixtures();
      console.log(`  Re-running preflight...`);
      const retry = await preflight();
      if (!retry.ok) {
        console.log(`  Preflight still failing after seed. Aborting.`);
        for (const issue of retry.issues) console.log(`    - ${issue}`);
        process.exit(1);
      }
      preflightResult.fixtures = retry.fixtures;
    } else {
      console.log(`  Run with SEED=1 DB_URL=... to auto-seed fixtures.`);
      console.log(`  Continuing with available scenarios only.\n`);
    }
  } else {
    console.log(`  All fixtures verified.`);
  }

  const scenarios = scenariosForFixtures(preflightResult.fixtures);
  console.log(`  Scenarios: ${scenarios.length}\n`);

  if (scenarios.length === 0) {
    console.log('No valid scenarios — check fixture setup.');
    process.exit(1);
  }

  const allLatencies: number[] = [];
  let totalRequests = 0, totalSuccess = 0, totalHttpErrors = 0, totalSchemaMismatches = 0, totalDecisionMismatches = 0, grandFailures = 0;

  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.name.padEnd(45)} `);
    const result = await runScenario(scenario, CONCURRENCY);
    totalRequests += result.total;
    totalSuccess += result.success;
    totalHttpErrors += result.httpErrors;
    totalSchemaMismatches += result.schemaMismatches;
    totalDecisionMismatches += result.decisionMismatches;
    allLatencies.push(...result.latencies);

    const timing = computeTiming(result.latencies);
    const pass = result.httpErrors === 0 && result.schemaMismatches === 0 && result.decisionMismatches === 0;
    if (!pass) grandFailures++;

    console.log(
      `${(pass ? 'PASS' : 'FAIL').padEnd(6)} ${result.success}/${result.total} ok  ` +
      `p50=${timing.p50.toFixed(0)}ms p95=${timing.p95.toFixed(0)}ms p99=${timing.p99.toFixed(0)}ms max=${timing.max.toFixed(0)}ms`
    );
    if (result.errors.length > 0 && result.errors.length <= 3) {
      for (const e of result.errors) console.log(`    error: ${e}`);
    } else if (result.errors.length > 3) {
      console.log(`    ... and ${result.errors.length - 3} more errors`);
      for (const e of result.errors.slice(0, 2)) console.log(`    error: ${e}`);
    }
  }

  // Mixed batch
  const mixedCount = Math.min(500, scenarios.length * CONCURRENCY * 2);
  console.log(`\n  ${(`mixed batch (${mixedCount} requests)`).padEnd(45)} `);
  const mixedResults = await Promise.all(
    Array.from({ length: mixedCount }, async (_, i) => {
      const scenario = scenarios[i % scenarios.length];
      const start = performance.now();
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (API_KEY) headers['x-api-key'] = API_KEY;
        const res = await fetch(TRUST_API_URL, { method: 'POST', headers, body: JSON.stringify(scenario.payload) });
        const latency = performance.now() - start;
        const text = await res.text();
        const errors: string[] = [];
        let body: unknown;
        try { body = JSON.parse(text); } catch { errors.push(`invalid JSON: ${text.substring(0, 200)}`); return { latency, errors, httpError: false }; }
        if (res.status !== 200) errors.push(`HTTP ${res.status}`);
        scenario.validate(body, errors);
        return { latency, errors, httpError: false };
      } catch (e: unknown) {
        return { latency: performance.now() - start, errors: [e instanceof Error ? e.message : String(e)], httpError: true };
      }
    })
  );

  let mixedSuccess = 0, mixedErrors = 0;
  const mixedLatencies: number[] = [];
  for (const r of mixedResults) {
    mixedLatencies.push(r.latency);
    if (r.httpError || r.errors.length > 0) mixedErrors++; else mixedSuccess++;
  }
  totalRequests += mixedCount; totalSuccess += mixedSuccess;
  totalHttpErrors += mixedResults.filter(r => r.httpError).length;
  allLatencies.push(...mixedLatencies);

  const mixedTiming = computeTiming(mixedLatencies);
  const mixedPass = mixedErrors === 0;
  if (!mixedPass) grandFailures++;
  console.log(
    `${(mixedPass ? 'PASS' : 'FAIL').padEnd(6)} ${mixedSuccess}/${mixedCount} ok  ` +
    `p50=${mixedTiming.p50.toFixed(0)}ms p95=${mixedTiming.p95.toFixed(0)}ms p99=${mixedTiming.p99.toFixed(0)}ms max=${mixedTiming.max.toFixed(0)}ms`
  );

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Total requests:       ${totalRequests}`);
  console.log(`Successful:           ${totalSuccess}`);
  console.log(`HTTP errors:          ${totalHttpErrors}`);
  console.log(`Schema mismatches:    ${totalSchemaMismatches}`);
  console.log(`Decision mismatches:  ${totalDecisionMismatches}`);
  console.log(`Failed scenarios:     ${grandFailures}`);
  const overallTiming = computeTiming(allLatencies);
  console.log(`\nOverall latency: p50=${overallTiming.p50.toFixed(0)}ms p95=${overallTiming.p95.toFixed(0)}ms p99=${overallTiming.p99.toFixed(0)}ms max=${overallTiming.max.toFixed(0)}ms`);

  if (grandFailures > 0) { console.log(`\nRESULT: FAIL (${grandFailures} scenario(s) failed)`); process.exit(1); }
  else { console.log(`\nRESULT: PASS`); }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
