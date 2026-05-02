# Patch Plan — GLM5.1 + Kimi k2.6 Audit Remediation

> Generated 2026-05-02. Six patches ordered by priority.
> Each patch is small, testable, and does not rewrite architecture.

---

## Patch 1 — Secure the oracle / gas-station attestation endpoint

### Problem
`POST /oracle/issue-attestation` in `scripts/gas-station.ts` is **completely unauthenticated**.
Line 148 says `// NOTE: No auth header in dev. Add API key middleware before production use.`
Anyone who can reach the port can issue arbitrary attestations with the oracle key.

### Files affected
| File | Change |
|------|--------|
| `scripts/gas-station.ts` | Add API-key gate before `handleOracleIssue` body |
| `.env.pull.tmp` (or `.env.example`) | Document new `ORACLE_API_KEY` var |

### Exact change
1. Read `ORACLE_API_KEY` from `process.env` at startup (alongside `PORT`, `ORIGINS`).
2. At the top of `handleOracleIssue`, check `req.headers['x-api-key']` against `ORACLE_API_KEY`.
   - If env var is unset **and** `NODE_ENV !== 'development'`, reject with `403 { error: "oracle_auth_disabled" }`.
   - If env var is set and header doesn't match, reject with `401 { error: "unauthorized" }`.
3. Log every oracle call (schema, subject, caller IP) regardless of auth result.

### Risk
- **Low.** Additive middleware; existing callers just add a header.
- If `ORACLE_API_KEY` is left unset in dev, behaviour is unchanged (gate only enforced when env ≠ development).

### Validation
```bash
# Without key — expect 401
curl -s -X POST http://localhost:3001/oracle/issue-attestation \
  -H "Content-Type: application/json" \
  -d '{"schema_id":"TRIBE_STANDING","subject":"0x0000000000000000000000000000000000000000000000000000000000000001","value":100}' \
  | jq .error
# Should print "unauthorized"

# With key — expect 200 or tx_failed (if no chain)
curl -s -X POST http://localhost:3001/oracle/issue-attestation \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ORACLE_API_KEY" \
  -d '{"schema_id":"TRIBE_STANDING","subject":"0x0000000000000000000000000000000000000000000000000000000000000001","value":100}' \
  | jq .
```

### Rollback
Remove the auth guard from `handleOracleIssue`; unset `ORACLE_API_KEY`. Single function, no DB migration.

---

## Patch 2 — Remove or hard-label demo fallback data

### Problem
`fw-data.ts` contains fictional pilot/gate/kill data (`FW_DATA`). When the indexer is unreachable or returns empty, `useFrontierWardenData.ts` silently merges this into the UI via `mergeLiveData()`. Users cannot distinguish real from fake data. The fallback defaults to **ON even in production** if `localStorage` has no stored preference.

### Files affected
| File | Change |
|------|--------|
| `frontend/src/hooks/useDemoFallback.ts` | Change `readDefault()` to return `false` for non-localhost |
| `frontend/src/hooks/useFrontierWardenData.ts` | When `demoEnabled && !live`, tag every fallback field with `[DEMO]` prefix |
| `frontend/src/components/features/frontierwarden/fw-data.ts` | Prefix all mock pilot/gate/kill names with `[DEMO]` |

### Exact change
1. **`useDemoFallback.ts:17`** — Already correct (`hostname === 'localhost'`). **Verify** the production domain (`frontierwarden.kodaxa.dev`) never matches. No change needed if so; add explicit `window.location.hostname.endsWith('.kodaxa.dev')` exclusion otherwise.
2. **`fw-data.ts`** — Prefix mock names: `'[DEMO] Vex Korith'`, `'[DEMO] GATE#7712'`, etc. Add a top-level const `DEMO_LABEL = '[DEMO] '` and prepend to all `name`, `id`, `victim`, `target` fields in `FW_DATA`.
3. **`useFrontierWardenData.ts` `mergeLiveData()`** — When returning `FW_DATA.pilot` as fallback (line 251), set `pilot.syndicate = '[DEMO] Design mockup — not live data'`. Same for gates/kills/contracts fallback arrays.

### Risk
- **Very low.** Visual-only change. No backend or on-chain impact.
- Might break snapshot tests if any exist for the dashboard.

### Validation
```bash
# Start frontend with indexer offline
cd frontend && npm run dev
# Open http://localhost:5173 → every card should show [DEMO] prefix
# Toggle demo off in settings → cards should show "NO LIVE DATA"
```

### Rollback
Revert the three files. `git checkout -- frontend/src/hooks/useDemoFallback.ts frontend/src/hooks/useFrontierWardenData.ts frontend/src/components/features/frontierwarden/fw-data.ts`

---

## Patch 3 — Make trust_evaluator use profile scores / ScoreCache

### Problem
`trust_evaluator.rs` calls `latest_standing_attestation()` which queries the `attestations` table for the single latest raw attestation. It ignores the `score_cache` table (populated by `processor/profile.rs` from on-chain `ScoreUpdated` events), which is the canonical aggregated score. This means the trust decision can diverge from what the profile module actually recorded.

### Files affected
| File | Change |
|------|--------|
| `indexer/src/trust_evaluator.rs` | Add `score_cache_lookup()` query; use it as primary score source when available, fall back to raw attestation |
| `indexer/src/trust_evaluator_tests.rs` | Add test for score_cache path |
| `indexer/src/trust_types.rs` | Add `score_source: &'static str` field to `TrustObserved` |

### Exact change
1. Add new query function:
   ```rust
   async fn score_from_cache(pool: &PgPool, subject: &str, schema: &str) -> Result<Option<CachedScore>> {
       sqlx::query_as::<_, CachedScore>(
           "SELECT value, last_tx_digest, last_checkpoint
            FROM score_cache sc
            JOIN profiles p ON p.profile_id = sc.profile_id
            WHERE p.owner = $1 AND sc.schema_id = $2"
       ).bind(subject).bind(schema).fetch_optional(pool).await.map_err(Into::into)
   }
   ```
2. In `evaluate_gate_access` and `evaluate_counterparty_risk`, call `score_from_cache` concurrently with existing queries. If cache hit exists, use its `value` as the authoritative score; still reference the raw attestation for proof linkage.
3. Add `score_source` (`"score_cache"` or `"raw_attestation"`) to `TrustObserved` so consumers know which path was taken.

### Risk
- **Medium.** Changes trust decision logic. The `score_cache` value may differ from the latest raw attestation value if the profile was updated via `update_score` but no new attestation was issued (e.g., decay).
- Mitigation: when both exist and disagree, use `score_cache` but add warning `"SCORE_CACHE_ATTESTATION_DIVERGENCE"`.

### Validation
```bash
cd indexer && cargo test trust_evaluator
# Manually: insert a score_cache row with value=900, attestation with value=500
# POST /v1/trust/evaluate → should see score=900, score_source="score_cache"
```

### Rollback
Revert `trust_evaluator.rs`, `trust_types.rs`, `trust_evaluator_tests.rs`. No DB migration to undo.

---

## Patch 4 — Add provenance labels to every frontend panel

### Problem
`LiveStatus` component and provenance tracking exist but not all panels use them. The views that accept `provenance` props sometimes receive `undefined`. The dashboard should show `LIVE`, `DEMO`, or `EMPTY` on **every** data panel so users always know data origin.

### Files affected
| File | Change |
|------|--------|
| `frontend/src/components/features/frontierwarden/FrontierWardenDashboard.tsx` | Pass `provenance[key]` to every view component |
| `frontend/src/components/features/frontierwarden/views/ContractsView.tsx` | Accept and render `provenance` prop via `LiveStatus` |
| `frontend/src/components/features/frontierwarden/views/DisputesView.tsx` | Same |
| `frontend/src/components/features/frontierwarden/views/GateIntelView.tsx` | Verify provenance prop is passed through |
| `frontend/src/components/features/frontierwarden/LiveStatus.tsx` | No change (already supports all states) |

### Exact change
1. In `FrontierWardenDashboard.tsx`, ensure `provenance` record from `useFrontierWardenData` is destructured and forwarded:
   - `<ContractsView provenance={provenance.contracts} ... />`
   - `<DisputesView provenance={provenance.disputes ?? 'EMPTY'} ... />`
   - Every view gets its matching key.
2. In any view that currently lacks `<LiveStatus>`, add one at the top of the panel with the appropriate `liveText` / `emptyText`.
3. Add `disputes` and `social` keys to the provenance record in `mergeLiveData()`.

### Risk
- **Very low.** Purely presentational. No logic changes.

### Validation
```
Open each tab in the dashboard; confirm a colored provenance badge appears.
Disconnect indexer → all badges should flip to DEMO or EMPTY.
```

### Rollback
Revert dashboard and view files. No backend changes.

---

## Patch 5 — Add confidence/provenance consistently to ALLOW and DENY trust responses

### Problem
- `response_counterparty()` hardcodes `confidence: if allow { 0.95 } else { 0.0 }` (line 487), **ignoring** the `compute_confidence()` result that accounts for challenges and staleness.
- DENY responses in `evaluate_gate_access` set `confidence: 0.0` — but a confident DENY (e.g., score=0, fresh data, no challenges) should have high confidence. `0.0` signals "we don't know," not "we're sure you're blocked."
- No `provenance` / `data_source` field in the response tells the consumer whether the answer came from indexed chain state vs. cache vs. fallback.

### Files affected
| File | Change |
|------|--------|
| `indexer/src/trust_evaluator.rs` | Call `compute_confidence` for every path (ALLOW and DENY); pass result into all response builders |
| `indexer/src/trust_types.rs` | Add `data_source: &'static str` to `TrustEvaluationResponse` |
| `indexer/src/trust_evaluator_tests.rs` | Update assertions for new confidence values on DENY |

### Exact change
1. In `evaluate_gate_access` DENY branch (no attestation, line 122–137): compute confidence from proof_bundle and pass it instead of `0.0`.
2. In `response_counterparty`: replace hardcoded ternary with the `confidence` parameter passed by caller. Update function signature to accept `confidence: f64`.
3. In `evaluate_counterparty_risk` DENY branches: call `compute_confidence(&proof_bundle, 0.9)` and pass the result.
4. Add `data_source: "indexed_protocol_state"` to `TrustEvaluationResponse`. Populate from `proof.source`.

### Risk
- **Medium.** Downstream consumers that parse `confidence` may see changed values. DENY going from 0.0→0.9 could surprise callers that interpret 0.0 as "no data."
- Mitigation: document the semantic change in the response; add `apiVersion: "trust.v1.1"` bump.

### Validation
```bash
cd indexer && cargo test trust_evaluator
# Manual: POST a counterparty_risk DENY → check confidence > 0.0
# POST a gate_access DENY with stale indexer → check confidence is reduced
```

### Rollback
Revert `trust_evaluator.rs`, `trust_types.rs`, `trust_evaluator_tests.rs`. Bump `apiVersion` back.

---

## Patch 6 — Define the narrowest real EVE event → oracle attestation → reputation update pipeline

### Problem
The system has the pieces (ingester polls → processors write DB → trust_evaluator reads DB) but there is no documented or enforced **minimal pipeline** that traces a single real EVE Frontier event through oracle attestation issuance to a score_cache update. Without this, it's unclear which event types actually produce reputation changes vs. which are aspirational.

### Files affected
| File | Change |
|------|--------|
| `Documents/PIPELINE.md` | **New file.** Formal definition of the narrowest pipeline |
| `indexer/src/ingester.rs` | Add structured log at pipeline entry point |
| `indexer/src/processor/attestation.rs` | Add structured log linking attestation → source event |
| `indexer/src/processor/profile.rs` | Add structured log linking score_cache update → attestation that caused it |
| `scripts/lib/oracle-actions.ts` | Add JSDoc documenting which EVE events trigger this path |

### Exact change
1. **`PIPELINE.md`** — Document the narrowest happy path:
   ```
   EVE SmartAssembly event (on-chain)
     → indexer polls `reputation_gate` / `attestation` module events
     → processor/attestation.rs inserts into `attestations` table
     → oracle script calls buildIssueAttestationTx (off-chain trigger currently)
     → processor/profile.rs upserts `score_cache` from ScoreUpdated event
     → trust_evaluator reads score_cache + attestations for gate decisions
   ```
   Explicitly mark which steps are **automated** (ingester→processor) vs. **manual/scripted** (oracle issuance).

2. **`ingester.rs`** — After processing each event batch, emit:
   ```rust
   tracing::info!(module, events_processed = batch.len(), "pipeline:ingest");
   ```
3. **`processor/attestation.rs`** — After `attestation_issued` insert:
   ```rust
   tracing::info!(attestation_id, schema_id, subject, "pipeline:attestation_indexed");
   ```
4. **`processor/profile.rs`** — After `score_updated` upsert:
   ```rust
   tracing::info!(profile_id, schema_id, new_value, "pipeline:score_cache_updated");
   ```
5. **`oracle-actions.ts`** — Add JSDoc on `buildIssueAttestationTx`:
   ```ts
   * Pipeline trigger: This is currently invoked manually or via gas-station.ts.
   * No automated EVE event → oracle attestation path exists yet.
   ```

### Risk
- **Very low.** Logging + documentation only. No logic changes.
- The honest documentation may surface that the oracle issuance step is entirely manual — that's the point.

### Validation
```bash
# Run indexer with RUST_LOG=info, trigger a ScoreUpdated event
# Grep logs for "pipeline:" — should see ingest → attestation_indexed → score_cache_updated
cd indexer && RUST_LOG=info cargo run 2>&1 | grep "pipeline:"
```

### Rollback
Revert log lines and delete `PIPELINE.md`.

---

## Summary matrix

| # | Patch | Severity | Risk | Lines changed (est.) |
|---|-------|----------|------|---------------------|
| 1 | Oracle endpoint auth | **CRITICAL** | Low | ~25 |
| 2 | Demo data labeling | **HIGH** | Very low | ~30 |
| 3 | trust_evaluator → score_cache | **HIGH** | Medium | ~60 |
| 4 | Provenance labels on all panels | **MEDIUM** | Very low | ~40 |
| 5 | Confidence/provenance in trust API | **MEDIUM** | Medium | ~45 |
| 6 | Pipeline definition + tracing | **LOW** | Very low | ~50 |

**Apply order:** 1 → 2 → 3 → 5 → 4 → 6 (patches 3 and 5 share `trust_types.rs`; do them adjacently to avoid merge conflicts).
