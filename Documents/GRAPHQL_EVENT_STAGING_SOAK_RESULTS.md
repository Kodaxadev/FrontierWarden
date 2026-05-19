# GraphQL Event Source Soak — Results

**Date:** 2026-05-19
**Branch:** `codex/graphql-event-staging-soak-results`
**Status:** PRODUCTION CANARY — observation window open

---

## Context

A dedicated staging database was unavailable. The soak was executed as
a **production canary** against the live Supabase instance (local cargo
run, not Railway). This was accepted because the app has a single
operator/user, migrations are versioned, and rollback is config-only.

See `GRAPHQL_EVENT_SOURCE_PRODUCTION_CANARY.md` for the full canary
protocol, rollback procedures, and pass criteria.

---

## Prerequisites — Confirmed

| Prerequisite | Status |
|---|---|
| `GraphqlEventClient` implements `SuiEventSource` | ✅ merged |
| Parity confirmed (80 events, 0 mismatches) | ✅ merged |
| Soak runbook written with 6-gate promotion criteria | ✅ merged |
| Env var operations documented | ✅ merged |
| `event_source_mode` defaults to `jsonrpc` in config | ✅ confirmed |
| Page size clamp (50 max for GraphQL) | ✅ fixed during canary |

---

## Soak Checklist

- [x] Environment running with `EFREP_EVENT_SOURCE_MODE=graphql`
- [x] Startup log shows `event source: GraphQL`
- [x] Events ingesting (`pipeline:ingest` log lines)
- [x] Zero GraphQL errors during canary run
- [x] No duplicate projections (dedup absorbed cursor migration replay)
- [x] Restart resume: cursor restored, no gap, no duplicates
- [x] World gate event filters working (Extension, Topology, Jump)

---

## Canary Run Results

### Initial catchup (11 minutes)

| Metric | Value |
|---|---|
| Total log lines | 1576 |
| Events ingested | 1000+ across all 15 filters |
| JumpEvent pages (50/page) | 20+ pages |
| Dedup hits (cursor migration) | 1003 |
| GraphQL errors | **0** |
| WARN lines | **0** |
| 429 rate limits | **0** |
| DB errors | **0** |

### Steady state

All 15 event filters reached count=0 polling:

- 10 FW package modules (MoveModule): count=0
- ExtensionAuthorizedEvent: count=0
- ExtensionRevokedEvent: count=0
- GateLinkedEvent: count=0
- GateUnlinkedEvent: count=0
- JumpEvent: count=0

### Restart resume test — PASS

1. Killed indexer after reaching steady state
2. Restarted with same GraphQL config
3. All 11 cursors restored from database
4. JumpEvent cursor: GraphQL opaque cursor (`gql` sentinel) — persisted
   and restored correctly
5. Non-jump modules: JSON-RPC cursors — untouched by GraphQL mode
6. Dedup caught re-delivered events on restart
7. No missed events, no gaps
8. **Result: PASS**

### Bug found and fixed during canary

**Page size clamp:** The Sui GraphQL endpoint rejects pages > 50. The
ingester config has `batch_size=100`. Fixed by clamping `limit.min(50)`
inside `GraphqlEventClient::fetch_events`. The parity binary had
hardcoded `limit: 50` so this was not caught earlier.

---

## Production Promotion Gate

| # | Gate | Status |
|---|---|---|
| 1 | Soak with 0 GraphQL errors | ✅ 0 errors in canary run |
| 2 | Restart resume: no missed or duplicated events | ✅ passed |
| 3 | World gate event filters ingest correctly | ✅ all 3 types confirmed |
| 4 | No rate-limit (429) responses | ✅ 0 in canary run |
| 5 | Dedup hits only at cursor migration boundary | ✅ 1003 hits, all at boundary |
| 6 | Manual operator approval | ⏳ pending 24h observation |

---

## Migration Status

```
Frontend tx-builder JSON-RPC:     removed
Frontend object-fetcher GraphQL:  proven
Backend identity GraphQL:         live
Backend event GraphQL skeleton:   merged
Backend event GraphQL parity:     confirmed (80 events, 0 mismatches)
Backend event GraphQL canary:     observation window open
Railway production event source:  jsonrpc (do not change until canary passes)
```
