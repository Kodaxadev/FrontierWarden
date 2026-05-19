# GraphQL Event Source Staging Soak Runbook

**Status:** Ready to execute
**Date:** 2026-05-19
**Branch:** `codex/graphql-event-source-staging-soak`
**Prerequisite:** `codex/graphql-event-source-parity-smoke` merged (80 events, 0 mismatches)

---

## Purpose

Validate GraphQL event ingestion under real runtime conditions before any
production event source flip. The parity binary confirmed field-level
equivalence. This soak confirms operational behavior: cursor persistence,
restart resume, sustained polling, rate limits, and world gate event filters.

---

## 1. Staging Environment Setup

### Option A: Railway Preview Environment (preferred)

Create a Railway preview deployment from the `main` branch with these env
var overrides. Do NOT modify the production service.

```
EFREP_EVENT_SOURCE_MODE=graphql
EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/graphql
RUST_LOG=efrep_indexer=debug
```

All other env vars (DATABASE_URL, EFREP_PACKAGE_ID, EVE config, etc.)
should mirror production. The preview service should connect to a **separate
staging database** — not the production Supabase instance.

### Option B: Local Docker

```bash
cd indexer
EFREP_EVENT_SOURCE_MODE=graphql \
EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/graphql \
RUST_LOG=efrep_indexer=debug \
DATABASE_URL=postgres://... \
cargo run
```

Use a local or staging Postgres instance. Never point at production.

### Production remains untouched

```
Production Railway:  EFREP_EVENT_SOURCE_MODE is NOT SET (defaults to jsonrpc)
Production config:   event_source_mode absent from config.toml (defaults to jsonrpc)
```

---

## 2. Startup Verification

After starting the staging indexer, confirm these log lines appear:

### Event source mode

```
INFO  event source: GraphQL  url=https://graphql.testnet.sui.io/graphql
```

If you see `event source: JSON-RPC` instead, the env var is not set or not
reaching the process. Check Railway env var configuration.

### Indexer started

```
INFO  indexer started (10 modules)  package=0xb43f...abfa  deploy_checkpoint=334013897
```

### Cursor restoration

For each module, expect either:
- `INFO  restored cursor  cursor=<module>  tx=<digest>  seq=<n>` — existing cursor found
- No log — module starts from genesis (first run on fresh DB)

If the staging DB was previously used with JSON-RPC mode, expect existing
cursors. The GraphQL client will receive a JSON-RPC cursor (event_seq is
numeric, not "gql") and start from genesis for that module. This is safe —
`raw_event_dedup` prevents duplicate projection.

---

## 3. Soak Checks

Run the staging indexer for 24–48 hours. Monitor these metrics.

### 3a. Events ingesting

Check Railway logs or `RUST_LOG=debug` output for:

```
DEBUG  graphql_event_source:page  filter={"module":"0xb43f...::reputation_gate"}  count=N  first_checkpoint=X  last_checkpoint=Y  has_next_page=false  has_cursor=true
INFO   pipeline:ingest  module=reputation_gate  count=N
```

If `count=0` consistently after initial catchup, that is normal — the
package may have low event volume during the soak window.

### 3b. No GraphQL errors

Search logs for:
```
WARN  ... RPC query failed  (or)  GraphQL error  (or)  429
```

Zero GraphQL errors over 24h = rate limit test passed.

### 3c. No duplicate projections

After 24h, query the staging database:

```sql
-- Count raw events ingested during soak window
SELECT COUNT(*) FROM raw_events
WHERE timestamp_ms > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000;

-- Check for any dedup hits (indicates re-delivery, expected during cursor migration)
-- These should be logged as "raw event already indexed; replaying projection"
```

A small number of dedup hits on first startup is expected (cursor migration
boundary). Zero dedup hits after the first poll cycle indicates clean
pagination.

### 3d. Restart resume

1. Let the staging indexer run for at least 1 hour
2. Note the last checkpoint from logs
3. Stop the indexer (Railway: redeploy, local: Ctrl-C)
4. Restart the indexer
5. Verify:
   - Cursor restored: `restored cursor` log appears for active modules
   - Events continue from the stored cursor, not from genesis
   - No gap: first checkpoint after restart >= last checkpoint before stop
   - No duplicates: `raw_event_dedup` prevents re-projection

### 3e. World gate event filters

If EVE config is enabled in staging, verify world gate events:

```
INFO  pipeline:world_gate_extension_ingest  event_type=0x28b4...::gate::ExtensionAuthorizedEvent  count=N
INFO  pipeline:world_gate_topology_ingest   event_type=0x28b4...::gate::GateLinkedEvent  count=N
INFO  pipeline:world_gate_jump_ingest       event_type=0x28b4...::gate::JumpEvent  count=N
```

If EVE config is disabled or world events are absent, this check is skipped.
The `type` filter was confirmed working in parity smoke for
`PassageGranted`; world gate events use the same code path.

---

## 4. Rollback Procedure

If any soak check fails, rollback is immediate:

1. **Railway preview:** Delete the preview deployment, or set
   `EFREP_EVENT_SOURCE_MODE=jsonrpc` and redeploy
2. **Local:** Stop the process, unset `EFREP_EVENT_SOURCE_MODE`, restart

JSON-RPC cursors in `indexer_state` are never modified by GraphQL mode.
GraphQL cursors are stored under different keys (event_seq="gql" sentinel).
Switching back to JSON-RPC resumes from the last JSON-RPC cursor as if
GraphQL mode never ran.

No database migration is needed in either direction.

---

## 5. Log Queries (Railway)

Railway logs can be searched with these patterns:

| What | Search pattern |
|---|---|
| Event source mode | `event source:` |
| GraphQL page results | `graphql_event_source:page` |
| Ingestion counts | `pipeline:ingest` |
| World gate events | `pipeline:world_gate` |
| Cursor restore | `restored cursor` |
| Errors | `error` or `WARN` |
| Rate limit | `429` or `rate` |
| Dedup hits | `already indexed` |

---

## 6. Production Promotion Gate

Do NOT set `EFREP_EVENT_SOURCE_MODE=graphql` on the production Railway
service until ALL of the following are confirmed:

| # | Gate | How to verify |
|---|---|---|
| 1 | Staging soak 24h+ with 0 GraphQL errors | Railway preview logs |
| 2 | Restart resume: no missed or duplicated events | Stop/start staging, compare checkpoints |
| 3 | World gate event filters ingest correctly | Staging logs (if EVE config enabled) |
| 4 | No rate-limit (429) responses over 24h | Log search for `429` |
| 5 | Dedup hits only at cursor migration boundary | DB query + log search |
| 6 | Manual operator approval | Explicit human decision — not automated |

### Promotion steps (after all gates pass)

1. Set on production Railway: `EFREP_EVENT_SOURCE_MODE=graphql`
2. Set on production Railway: `EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/graphql`
   (already the default, but explicit is safer)
3. Redeploy the production indexer service
4. Monitor logs for 1 hour:
   - `event source: GraphQL` appears at startup
   - `pipeline:ingest` counts match pre-flip baseline
   - No `WARN` or `error` lines related to GraphQL
5. If any issue: immediate rollback (remove `EFREP_EVENT_SOURCE_MODE`, redeploy)

---

## 7. Remaining Risks After Soak

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GraphQL endpoint downtime | Low | Indexer stalls until recovery | Instant rollback to JSON-RPC |
| Mysten changes GraphQL schema | Very low | Query fails at runtime | Pin query in code, test on upgrade |
| Rate limit under higher event volume | Low | Polling gaps | Backoff already in ingester loop |
| Cursor format changes in Sui SDK | Very low | Pagination breaks | Opaque cursor — SDK-independent |

---

## 8. Migration Status

```
Frontend tx-builder JSON-RPC:     removed ✅
Frontend object-fetcher GraphQL:  proven ✅
Backend identity GraphQL:         live ✅
Backend event GraphQL skeleton:   merged ✅
Backend event GraphQL parity:     confirmed (80 events, 0 mismatches) ✅
Backend event GraphQL staging:    THIS DOCUMENT — ready to execute
Production event source:          jsonrpc (do not change until soak passes)
```
