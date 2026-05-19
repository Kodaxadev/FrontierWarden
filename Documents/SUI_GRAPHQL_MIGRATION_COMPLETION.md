# Sui GraphQL Migration — Completion Report

**Date:** 2026-05-19
**Status:** COMPLETE — JSON-RPC is now fallback, not active architecture

---

## Summary

FrontierWarden is no longer blocked by Sui JSON-RPC deprecation. Active
production paths use Sui GraphQL for event ingestion, identity resolution,
object fetching, tx-builder object/coin resolution, and zkLogin signature
verification. JSON-RPC remains only as a rollback mode where intentionally
retained.

---

## What Migrated

| Layer | Component | Before | After | Verified |
|---|---|---|---|---|
| Backend | Event ingestion | JSON-RPC `getEvents` polling | GraphQL `events` query with cursor | Railway prod, 0 errors |
| Backend | Identity resolution | JSON-RPC `getObject` | GraphQL `object` query | Railway prod |
| Backend | zkLogin session auth | N/A (new) | GraphQL `verifySignature` | EVE Vault signed session live |
| Frontend | Object fetcher | `SuiJsonRpcClient.getObject` | `fetchSuiObjectGraphQL` via mode switch | Vercel prod, shadow parity confirmed |
| Frontend | Tx-builder object refs | `makeSuiJsonRpcClient().getObject` (11 sites) | `resolveObjectRef` (mode-switched) | All 7 tx builders migrated |
| Frontend | Tx-builder coin selection | `makeSuiJsonRpcClient().getCoins` (1 site) | `resolvePaymentCoin` (mode-switched) | `tx-check-passage.ts` migrated |
| Frontend | RPC client factory | `makeSuiJsonRpcClient` + instrumented proxy | Removed | Only referenced in comments |

---

## Production Verification Evidence

### Backend (Railway)

- **Event ingestion:** `EFREP_EVENT_SOURCE_MODE=graphql` on Railway since 2026-05-19
- **Canary results:** 0 GraphQL errors, 0 rate limits, restart resume clean,
  dedup absorbed cursor migration boundary
- **Page size fix:** Clamped to 50 (Sui GraphQL endpoint max) in PR #70
- **Pre-promotion backup:** `indexer/backups/pre_graphql_promotion_2026-05-19.json`

### Frontend (Vercel)

- **Object fetcher:** `VITE_SUI_OBJECT_FETCHER_MODE=graphql` on Vercel prod since 2026-05-19
- **Shadow parity:** 12 production comparisons, 0 actionable mismatches (confirmed prior to promotion)
- **Tx builders:** All 7 files migrated off `SuiJsonRpcClient.getObject` in commit `308d55d`
- **Coin selection:** Migrated off `SuiJsonRpcClient.getCoins` in commit `285e28a`

### Session Auth

- **zkLogin:** EVE Vault operator signed session confirmed live 2026-05-19
- **Verification path:** Sui GraphQL `verifySignature` at `https://graphql.testnet.sui.io/`
- **Schemes:** `0x00` Ed25519 (local), `0x05` zkLogin (GraphQL delegation)

---

## What Remains as Fallback

| Component | Fallback mode | How to activate | Why retained |
|---|---|---|---|
| Backend events | `EFREP_EVENT_SOURCE_MODE=jsonrpc` | Set env on Railway, redeploy | Rollback if GraphQL endpoint degrades |
| Frontend object fetcher | `VITE_SUI_OBJECT_FETCHER_MODE=jsonrpc` | Set env on Vercel, redeploy | Rollback if GraphQL responses diverge |
| Frontend tx builders | `resolveObjectRef` jsonrpc path | Same env var as object fetcher | Shares mode switch |

The `SuiEventSource` trait abstracts both backends. The `objectFetcherMode()`
function reads the env var at build time. No code changes needed for rollback.

---

## Active Environment Variables

### Railway (Backend)

| Variable | Value | Purpose |
|---|---|---|
| `EFREP_EVENT_SOURCE_MODE` | `graphql` | Event ingestion transport |
| `EFREP_GRAPHQL_URL` | `https://graphql.testnet.sui.io/graphql` | Sui GraphQL endpoint |
| `EFREP_RATE_LIMIT_PER_MINUTE` | `300` | Global rate limit |
| `EFREP_SUI_GRAPHQL_URL` | (default) | zkLogin verifier endpoint |

Tiered rate limits (no env vars needed — defaults active):
- Sensitive tier: 30/min (identity batch, character jumps)
- Elevated tier: 60/min (kill-mails, leaderboard, reputation)

### Vercel (Frontend)

| Variable | Value | Environment |
|---|---|---|
| `VITE_SUI_OBJECT_FETCHER_MODE` | `graphql` | Production |
| `VITE_SUI_OBJECT_FETCHER_MODE` | `shadow` | Preview |
| `VITE_SUI_NETWORK` | `testnet` | All |

---

## Rollback Plan

### Backend event ingestion

```bash
# Railway CLI
railway variables set EFREP_EVENT_SOURCE_MODE=jsonrpc
# Redeploy triggers automatically
```

The indexer will resume JSON-RPC polling from the last stored cursor. The
`SuiEventSource` trait handles both backends transparently.

### Frontend object fetcher + tx builders

```bash
# Vercel CLI (from frontend/ or project root)
vercel env rm VITE_SUI_OBJECT_FETCHER_MODE production -y
printf "jsonrpc" | vercel env add VITE_SUI_OBJECT_FETCHER_MODE production
vercel --prod
```

All `resolveObjectRef` and `resolvePaymentCoin` calls revert to JSON-RPC.
No code change needed.

### zkLogin session auth

zkLogin uses `EFREP_SUI_GRAPHQL_URL` which defaults to the testnet endpoint.
If the endpoint is unavailable, session creation returns 503. Ed25519 sessions
(`0x00` scheme) are unaffected — they verify locally without GraphQL.

---

## Known Caveats

1. **Preview still on shadow mode.** `VITE_SUI_OBJECT_FETCHER_MODE=shadow` on
   Preview branches. This is intentional — preview deployments run both paths
   for continued parity monitoring.

2. **GraphQL page size max is 50.** Sui's GraphQL endpoint silently caps at 50
   events per page. The indexer clamps to this limit (PR #70). JSON-RPC had no
   such cap.

3. **Coin query uses `address.objects` with type filter.** There is no dedicated
   `Address.coins` field in Sui GraphQL. Coin resolution uses
   `address.objects(filter: { type: "0x2::coin::Coin<0x2::sui::SUI>" })`.
   Verified live against testnet 2026-05-18.

4. **`makeSuiJsonRpcClient` references in comments only.** Three files still
   mention the removed function in comments for historical context. The function
   itself is deleted.

5. **`event_source_parity` binary retained.** The parity smoke-test binary
   (`src/bin/event_source_parity.rs`) remains in the codebase for future
   regression testing. It is not part of the production build.

---

## Deprecation Readiness

Mysten has indicated Sui JSON-RPC deprecation targeting ~July 2026.

**FrontierWarden readiness:** No action required at deprecation time. All active
production paths already use GraphQL. When JSON-RPC is removed:

1. Remove the `jsonrpc` mode from `objectFetcherMode()` in `sui-object-fetcher.ts`
2. Remove `JsonRpcEventClient` from `event_source.rs`
3. Remove `resolveObjectRef`/`resolvePaymentCoin` jsonrpc fallback paths
4. Remove `EFREP_EVENT_SOURCE_MODE` env var (GraphQL becomes the only mode)

These are cleanup tasks, not migration tasks. Production is unaffected.

---

## Migration Timeline

| Date | Milestone |
|---|---|
| 2026-05-14 | In-game SmartGate surface production-proven |
| 2026-05-15 | Object-fetcher shadow comparison infrastructure |
| 2026-05-16 | Object-fetcher GraphQL mode + shadow parity (12 comparisons, 0 mismatches) |
| 2026-05-16 | zkLogin session auth implemented and deployed to Railway |
| 2026-05-17 | Tx-builder `resolveObjectRef` — 7 files migrated off `SuiJsonRpcClient.getObject` |
| 2026-05-17 | Tx-builder `resolvePaymentCoin` — `makeSuiJsonRpcClient` removed |
| 2026-05-18 | GraphQL event source spike — feasible, no blockers |
| 2026-05-18 | GraphQL event client skeleton + parity smoke (80 events, 0 mismatches) |
| 2026-05-18 | Staging soak runbook written (6-gate promotion criteria) |
| 2026-05-18 | Tx-builder coin query verified live against testnet GraphQL |
| 2026-05-19 | GraphQL event source promoted to Railway production |
| 2026-05-19 | API weaponization audit — unbounded queries capped |
| 2026-05-19 | Tiered per-endpoint rate limits deployed |
| 2026-05-19 | Object-fetcher promoted to `graphql` on Vercel production |
| 2026-05-19 | EVE Vault zkLogin signed session confirmed live |
| 2026-05-19 | **Migration complete** |
