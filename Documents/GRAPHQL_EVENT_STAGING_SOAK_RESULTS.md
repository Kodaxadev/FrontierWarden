# GraphQL Event Staging Soak — Results

**Date:** 2026-05-19
**Branch:** `codex/graphql-event-staging-soak-results`
**Status:** BLOCKED — no staging database available

---

## Blocker

The staging soak requires a **non-production Postgres instance**. The only
`DATABASE_URL` available is the production Supabase pooler. The soak
runbook explicitly prohibits pointing the GraphQL-mode indexer at
production data.

**What is needed to unblock:**

1. A Supabase project (free tier is sufficient) or local Postgres instance
   dedicated to staging
2. Run the indexer migration (`sqlx migrate run`) against the staging DB
   to create the schema
3. Set `DATABASE_URL` to the staging instance
4. Set `EFREP_EVENT_SOURCE_MODE=graphql`
5. Set `EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/graphql`
6. Run the indexer for 30–60 min initial smoke, then extend to 24h

---

## Prerequisites — Confirmed

| Prerequisite | Status |
|---|---|
| `GraphqlEventClient` implements `SuiEventSource` | ✅ merged (skeleton branch) |
| Parity confirmed (80 events, 0 mismatches) | ✅ merged (parity smoke branch) |
| Soak runbook written with 6-gate promotion criteria | ✅ merged (staging soak branch) |
| Env var operations documented | ✅ merged (vite-env-operational-doc branch) |
| Production remains on `jsonrpc` (default) | ✅ no env override set |
| `event_source_mode` defaults to `jsonrpc` in config | ✅ confirmed in config.rs |

---

## Soak Checklist (from runbook)

All items below are **not yet executed** due to the blocker above.

- [ ] Staging environment running with `EFREP_EVENT_SOURCE_MODE=graphql`
- [ ] Startup log shows `event source: GraphQL`
- [ ] Events ingesting (`pipeline:ingest` log lines)
- [ ] Zero GraphQL errors over 24h
- [ ] No duplicate projections (dedup query clean)
- [ ] Restart resume: cursor restored, no gap, no duplicates
- [ ] World gate event filters (if EVE config enabled)

---

## Production Promotion Gate (from runbook)

| # | Gate | Status |
|---|---|---|
| 1 | Staging soak 24h+ with 0 GraphQL errors | ⏳ blocked |
| 2 | Restart resume: no missed or duplicated events | ⏳ blocked |
| 3 | World gate event filters ingest correctly | ⏳ blocked |
| 4 | No rate-limit (429) responses over 24h | ⏳ blocked |
| 5 | Dedup hits only at cursor migration boundary | ⏳ blocked |
| 6 | Manual operator approval | ⏳ blocked |

---

## Unblock Options

### Option A: Supabase Staging Project (recommended)

Create a second Supabase project for staging. Free tier provides 500 MB
storage and connection pooling — more than sufficient for soak testing.

1. Create project at `supabase.com/dashboard` → New Project
2. Copy the connection string (Settings → Database → Connection string)
3. Run migrations: `DATABASE_URL=<staging-url> cargo sqlx migrate run`
4. Proceed with soak per runbook

### Option B: Local Postgres via Docker

```bash
docker run -d --name efrep-staging-db \
  -e POSTGRES_DB=efrep_staging \
  -p 5433:5432 \
  postgres:16

# Then set DATABASE_URL to the local instance and run:
EFREP_EVENT_SOURCE_MODE=graphql \
EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/graphql \
RUST_LOG=efrep_indexer=debug \
cargo run
```

### Option C: Railway Preview Environment

Create a Railway preview deployment from `main` with env overrides per
the staging soak runbook. Railway preview environments get their own
database if configured.

---

## Migration Status

```
Frontend tx-builder JSON-RPC:     removed ✅
Frontend object-fetcher GraphQL:  proven ✅
Backend identity GraphQL:         live ✅
Backend event GraphQL skeleton:   merged ✅
Backend event GraphQL parity:     confirmed (80 events, 0 mismatches) ✅
Backend event GraphQL soak:       BLOCKED — no staging DB
Production event source:          jsonrpc (do not change until soak passes)
```
