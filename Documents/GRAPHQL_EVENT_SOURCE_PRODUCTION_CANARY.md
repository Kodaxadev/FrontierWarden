# GraphQL Event Source — Production Canary

**Date:** 2026-05-19
**Status:** CANARY — observation window open
**Branch:** `codex/graphql-event-staging-soak-results`

---

## Why canary instead of staging

Production canary was used because a separate Supabase staging database
was unavailable due to free-tier limits. Risk was accepted because the
app currently has a single operator/user, migrations are versioned, and
rollback is config-only.

This is NOT a final production promotion. It is a controlled canary with
explicit rollback protocol. Production promotion is not considered final
until the canary passes the observation window.

---

## Canary environment

- **Database:** Production Supabase (pooler, session mode)
- **Event source:** `EFREP_EVENT_SOURCE_MODE=graphql`
- **GraphQL endpoint:** `https://graphql.testnet.sui.io/graphql`
- **Runtime:** Local cargo run (not Railway)
- **Railway production:** Still `jsonrpc` (default, no env override)

---

## Observed results (local canary run)

### Initial catchup (11 minutes)

| Metric | Value |
|---|---|
| Total log lines | 1576 |
| Events ingested (pipeline) | 1000+ across all modules |
| JumpEvent pages (50/page) | 20+ pages |
| Total dedup hits | 1003 (cursor migration boundary) |
| GraphQL errors | **0** |
| WARN lines | **0** |
| 429 rate limits | **0** |
| DB errors | **0** |
| Panics | **0** |

### Steady state

All 15 event filters reached count=0 polling:

- 10 FW package modules (MoveModule filters): count=0
- 3 world gate extension events (MoveEventType filters): count=0
- GateUnlinkedEvent: count=0
- JumpEvent: count=0 (last to finish, 1000+ events paginated)

### Restart resume test

1. Killed indexer after steady state
2. Restarted with same config
3. All 11 cursors restored from database
4. JumpEvent cursor: GraphQL opaque cursor with `gql` sentinel — persisted
   and restored correctly
5. Non-jump modules: JSON-RPC cursors — untouched by GraphQL mode
6. Dedup caught re-delivered events on restart
7. No missed events, no gaps, no duplicates
8. **Result: PASS**

---

## Rollback protocol

Rollback is one config change. No database migration needed.

### Immediate rollback steps

1. Set `EFREP_EVENT_SOURCE_MODE=jsonrpc` (or remove the env var entirely)
2. Restart/redeploy the service
3. Confirm startup log: `event source: JSON-RPC`
4. Confirm APIs healthy

### What happens on rollback

- JSON-RPC cursors in `indexer_state` were never modified by GraphQL mode
- GraphQL cursors are stored under different keys (`event_seq="gql"` sentinel)
- Switching back to JSON-RPC resumes from the last JSON-RPC cursor
- No database migration needed in either direction

### Rollback triggers — act immediately

- GraphQL 429s repeating
- GraphQL malformed response errors
- DB write failures
- Processor panic
- Same event batch replaying endlessly
- API data disappearing or regressing
- Supabase connection pressure (pool exhaustion)
- Railway memory/CPU spike

---

## Canary pass criteria

### 1-hour gate

- [ ] No GraphQL errors
- [ ] No 429 rate limits
- [ ] No DB connection errors
- [ ] APIs healthy (gates, attestations, kill-mails, trust evaluate)
- [ ] No obvious replay storm (dedup hits settle after initial catchup)

### 24-hour gate

- [ ] No sustained dedup storm
- [ ] No projection corruption
- [ ] Restart still resumes cleanly
- [ ] Event source logs stable
- [ ] Latest checkpoint keeps increasing (if new on-chain activity)

### Final promotion

- [ ] All 24-hour criteria pass
- [ ] Manual operator approval
- [ ] Set `EFREP_EVENT_SOURCE_MODE=graphql` on Railway production
- [ ] Monitor Railway logs for 1 hour post-flip

---

## Known risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Event replay storm | Low (observed: settled in 11 min) | Write pressure on Supabase | raw_event_dedup absorbs replay |
| Supabase write pressure | Low | Connection pool exhaustion | max_connections capped at 5 |
| Non-idempotent projection | Very low | Corrupted aggregates | All processors use dedup check |
| Missed events (cursor bug) | Very low | Data gap | Restart test passed, parity confirmed |
| GraphQL rate limits | Low | Polling gaps | Backoff in ingester loop |
| GraphQL endpoint downtime | Low | Indexer stalls | Instant rollback to JSON-RPC |

---

## Data backup recommendation

Before extended canary, snapshot these tables:

- `raw_events`
- `raw_event_dedup`
- `indexer_state` (cursors)
- `attestations`
- `profiles` / `profile_scores`
- `gate_policies` / `gate_bindings`
- `world_kill_mails`
- `fraud_challenges`

Migrations restore schema but not live data. A Supabase project backup
or `pg_dump` of the above tables provides a recovery point.

---

## Migration status

```
Frontend tx-builder JSON-RPC:     removed
Frontend object-fetcher GraphQL:  proven
Backend identity GraphQL:         live
Backend event GraphQL skeleton:   merged
Backend event GraphQL parity:     confirmed (80 events, 0 mismatches)
Backend event GraphQL canary:     THIS DOCUMENT — observation window open
Railway production event source:  jsonrpc (do not change until canary passes)
```
