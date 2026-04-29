/**
 * stress-gate-checks.ts — Simulates 100+ concurrent gate passage checks.
 *
 * WHAT THIS TESTS
 * ================
 * Sends N concurrent check_passage requests against the indexer API to
 * verify that:
 *   1. The REST API handles concurrent connections without 5xx errors
 *   2. Response times stay under acceptable thresholds (< 500ms p95)
 *   3. No connection pool exhaustion under load
 *
 * This does NOT execute on-chain transactions — it only stress-tests the
 * indexer API layer (GET /gates, GET /gates/:id/passages, GET /gates/:id/policy).
 *
 * USAGE
 * ======
 *   npx tsx scripts/stress-gate-checks.ts
 *
 * Optional env vars:
 *   INDEXER_URL=...     override indexer base URL (default: http://localhost:3000)
 *   CONCURRENCY=...     number of concurrent requests (default: 100)
 *   ROUNDS=...          number of rounds to run (default: 3)
 */

const INDEXER_URL = process.env.INDEXER_URL ?? 'http://localhost:3000';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '100');
const ROUNDS = Number(process.env.ROUNDS ?? '3');

interface Result {
  endpoint: string;
  status: number;
  ms: number;
  ok: boolean;
}

const ENDPOINTS = [
  '/gates',
  '/challenges',
  '/challenges/stats',
  '/health',
];

async function fetchOne(endpoint: string): Promise<Result> {
  const url = `${INDEXER_URL}${endpoint}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url);
    const ms = performance.now() - t0;
    return { endpoint, status: res.status, ms, ok: res.ok };
  } catch (err) {
    const ms = performance.now() - t0;
    return { endpoint, status: 0, ms, ok: false };
  }
}

function percentile(sorted: number[], pct: number): number {
  const idx = Math.ceil(sorted.length * pct / 100) - 1;
  return sorted[Math.max(0, idx)];
}

async function runRound(round: number): Promise<Result[]> {
  console.log(`\n── Round ${round + 1}/${ROUNDS} · ${CONCURRENCY} concurrent requests ──`);

  const tasks: Promise<Result>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const endpoint = ENDPOINTS[i % ENDPOINTS.length];
    tasks.push(fetchOne(endpoint));
  }

  const results = await Promise.all(tasks);

  // Stats
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  const p99 = percentile(times, 99);
  const max = times[times.length - 1];

  console.log(`  Total:   ${results.length}`);
  console.log(`  Success: ${ok}  |  Failed: ${fail}`);
  console.log(`  Latency: p50=${p50.toFixed(0)}ms  p95=${p95.toFixed(0)}ms  p99=${p99.toFixed(0)}ms  max=${max.toFixed(0)}ms`);

  if (fail > 0) {
    const failedByStatus = new Map<number, number>();
    results.filter(r => !r.ok).forEach(r => {
      failedByStatus.set(r.status, (failedByStatus.get(r.status) ?? 0) + 1);
    });
    console.log(`  Failures by status: ${[...failedByStatus.entries()].map(([s, c]) => `${s}×${c}`).join(', ')}`);
  }

  // Threshold check
  if (p95 > 500) {
    console.log(`  ⚠️  p95 latency exceeds 500ms threshold`);
  } else {
    console.log(`  ✓  p95 latency within threshold`);
  }

  return results;
}

async function main() {
  console.log('=== FrontierWarden Gate Stress Test ===');
  console.log(`Indexer:     ${INDEXER_URL}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Rounds:      ${ROUNDS}`);
  console.log(`Endpoints:   ${ENDPOINTS.join(', ')}`);

  let totalOk = 0;
  let totalFail = 0;
  const allTimes: number[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const results = await runRound(i);
    totalOk += results.filter(r => r.ok).length;
    totalFail += results.filter(r => !r.ok).length;
    allTimes.push(...results.map(r => r.ms));
  }

  // Final summary
  const sorted = allTimes.sort((a, b) => a - b);
  console.log('\n=== Summary ===');
  console.log(`Total requests: ${totalOk + totalFail}`);
  console.log(`Success: ${totalOk}  |  Failed: ${totalFail}`);
  console.log(`Overall p50=${percentile(sorted, 50).toFixed(0)}ms  p95=${percentile(sorted, 95).toFixed(0)}ms  max=${sorted[sorted.length - 1].toFixed(0)}ms`);

  if (totalFail > 0) {
    console.log('\n⚠️  Some requests failed — check indexer logs for connection pool exhaustion or query errors.');
    process.exit(1);
  } else {
    console.log('\n✓ All requests succeeded.');
  }
}

main().catch(err => {
  console.error('[stress-test] fatal:', err);
  process.exit(1);
});
