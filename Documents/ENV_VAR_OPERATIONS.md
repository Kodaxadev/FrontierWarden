# Environment Variable Operations Guide

**Date:** 2026-05-19

---

## Build-Time vs Runtime

FrontierWarden uses two hosting platforms with fundamentally different env
var behavior. Confusing them causes silent deployment failures.

| Platform | Env var prefix | When applied | Change takes effect |
|---|---|---|---|
| Vercel (frontend) | `VITE_*` | **Build time** — baked into JS bundle | New Vercel deployment required |
| Railway (indexer/API) | `EFREP_*`, `DATABASE_URL`, etc. | **Runtime** — read on process start | Service restart or redeploy |

### The critical difference

**Vercel `VITE_*` vars are compiled into the frontend bundle by Vite.**
Changing a `VITE_*` value in the Vercel dashboard does nothing to the
currently deployed bundle. The new value only appears after a new build
is triggered and deployed. The old bundle continues serving the old value
until it is replaced.

**Railway env vars are read at process startup.** Changing a Railway env
var and redeploying (or restarting) the service applies the new value
immediately. No build step is involved — the Rust binary reads env vars
via `std::env::var()` at runtime.

---

## Frontend Env Vars (Vercel / Vite)

These are embedded in the JavaScript bundle at build time via
`import.meta.env.VITE_*`. They are visible in the browser — never put
secrets in `VITE_*` vars.

| Variable | Purpose | Example |
|---|---|---|
| `VITE_PKG_ID` | FrontierWarden Move package ID | `0xb43f...abfa` |
| `VITE_GATE_POLICY_ID` | GatePolicy shared object ID | `0x7b10...3807` |
| `VITE_GATE_POLICY_VERSION` | GatePolicy initial shared version | `334017316` |
| `VITE_GATE_ADMIN_CAP_ID` | AdminCap object ID | `0xcfcf...db8f` |
| `VITE_SUI_NETWORK` | Sui network name | `testnet` |
| `VITE_SUI_RPC_URL` | Override fullnode JSON-RPC URL | (optional) |
| `VITE_SUI_GRAPHQL_URL` | Override Sui GraphQL URL | (optional) |
| `VITE_SUI_OBJECT_FETCHER_MODE` | Object fetcher: `jsonrpc` / `graphql` / `shadow` | `jsonrpc` |
| `VITE_GAS_STATION_URL` | Gas station sponsor endpoint | `https://gas-station-...` |
| `VITE_INDEXER_URL` | Indexer/API base URL | `https://ef-indexer-...` |
| `VITE_DEBUG_TX` | Enable tx builder debug logs | `true` (dev only) |

### Changing a frontend env var

1. Update the value in Vercel dashboard (Project → Settings → Environment Variables)
2. Trigger a new deployment (push to branch, or Vercel dashboard → Deployments → Redeploy)
3. Wait for the new deployment to complete and become active
4. Verify the new deployment ID in Vercel dashboard
5. Hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) to bypass cache
6. Confirm the new value is active (browser DevTools → Console → check relevant behavior)

**Common mistake:** Setting a `VITE_*` var and assuming it is live. It is
not live until a new deployment completes and the browser loads the new bundle.

---

## Backend Env Vars (Railway)

These are read at process startup via `std::env::var()` in `config.rs`.
They override values from `config.toml`.

| Variable | Purpose | Example |
|---|---|---|
| `EFREP_PACKAGE_ID` | Override FW package ID | `0xb43f...abfa` |
| `EFREP_EVENT_SOURCE_MODE` | Event source: `jsonrpc` (default) / `graphql` | `jsonrpc` |
| `EFREP_GRAPHQL_URL` | Sui GraphQL endpoint for event ingestion | `https://graphql.testnet.sui.io/graphql` |
| `DATABASE_URL` | Postgres connection string | (Supabase URL) |
| `EFREP_EVE_WORLD_API_BASE` | EVE world API base URL | `https://world-api-stillness...` |
| `EFREP_EVE_GRAPHQL_URL` | Sui GraphQL for zkLogin verification | `https://graphql.testnet.sui.io/graphql` |
| `EFREP_WORLD_PKG_ORIGINAL_ID` | World package original-id (type origin) | `0x28b4...448c` |
| `EFREP_KILL_MAILS_ENABLED` | Enable kill mail poller | `true` / `false` |

### Changing a backend env var

1. Update the value in Railway dashboard (Service → Variables)
2. Redeploy the service (Railway → Deployments → Redeploy, or push to branch)
3. Check Railway logs for the startup line confirming the new value:
   - Event source: `event source: GraphQL` or `event source: JSON-RPC`
   - Package: `indexer started ... package=0x...`
4. Confirm behavior in API responses or database state

**Railway applies env changes on the next deploy.** If you change a var
without redeploying, the running process still has the old value.

---

## Verification Checklist

Use this checklist whenever changing an env var in either platform.

### Frontend (Vercel)

- [ ] Set or update `VITE_*` value in Vercel dashboard
- [ ] Trigger new Vercel deployment (push commit or manual redeploy)
- [ ] Verify new deployment completed (Vercel dashboard → Deployments)
- [ ] Hard-refresh browser to load new bundle
- [ ] Confirm new behavior (check DevTools console, network tab, or UI)

### Backend (Railway)

- [ ] Set or update env var in Railway dashboard
- [ ] Trigger redeploy (Railway dashboard or git push)
- [ ] Check Railway logs for startup confirmation
- [ ] Confirm new behavior (API response, database state, or log output)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend still shows old value after Vercel env change | No new deployment triggered | Trigger redeploy in Vercel |
| Frontend shows old value after redeploy | Browser cache | Hard-refresh (`Ctrl+Shift+R`) |
| Backend still shows old value after Railway env change | Service not redeployed | Redeploy in Railway |
| `VITE_*` var is `undefined` in browser | Typo in var name, or not set for correct environment (Preview vs Production) | Check Vercel env var scoping |
| Backend env var ignored | Var name mismatch with `config.rs` reader | Check exact var name in `Config::load()` |
