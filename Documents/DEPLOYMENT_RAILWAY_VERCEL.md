# FrontierWarden Live Ops Runbook

Last updated: 2026-05-10

This is the current deployment runbook for the live FrontierWarden testnet demo.
It is not a first-deploy placeholder guide.

## Live Topology

```text
Vercel frontend
  https://frontierwarden.kodaxa.dev
      |
      | HTTPS
      v
Railway indexer/API
  https://ef-indexer-production.up.railway.app
      |
      | Postgres
      v
Supabase database

Vercel frontend
      |
      | sponsored transaction handoff
      v
Railway gas station
  https://gas-station-production-3b45.up.railway.app
      |
      | Sui testnet RPC
      v
Sui Stillness/testnet
```

## Services

| Service | Host | Role |
|---|---|---|
| Frontend | Vercel | React/Vite operator console and Trust Decision Console |
| Indexer/API | Railway | Rust event indexer plus Axum REST API |
| Gas station | Railway | Sponsored transaction assembly/execution support |
| Database | Supabase Postgres | Indexed protocol state |
| Chain | Sui testnet | Active FrontierWarden package and shared objects |
| EVE environment | Stillness/testnet | EVE Frontier identity/world context |

## Health Checks

Frontend:

```bash
curl -I https://frontierwarden.kodaxa.dev
```

Expected: HTTP `200`.

Indexer/API:

```bash
curl https://ef-indexer-production.up.railway.app/health
```

Expected shape:

```json
{"status":"ok"}
```

Gas station:

```bash
curl https://gas-station-production-3b45.up.railway.app/health
```

Expected shape:

```json
{"ok":true,"ready":true}
```

## Public Vercel Variables

These variables are public browser configuration. They are safe only because
they are not secrets.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Railway API base URL |
| `VITE_GAS_STATION_URL` | Railway gas station base URL, if write/sponsor UI is enabled |
| `VITE_SUI_NETWORK` | `testnet` |
| `VITE_PKG_ID` | Current FrontierWarden testnet package ID |
| `VITE_SCHEMA_REGISTRY_ID` | Shared schema registry object ID |
| `VITE_SCHEMA_REGISTRY_VERSION` | Schema registry initial shared version |
| `VITE_ORACLE_REGISTRY_ID` | Shared oracle registry object ID |
| `VITE_ORACLE_REGISTRY_VERSION` | Oracle registry initial shared version |
| `VITE_GATE_POLICY_ID` | Shared gate policy object ID |
| `VITE_GATE_POLICY_VERSION` | Gate policy initial shared version |
| `VITE_GATE_ADMIN_CAP_ID` | Gate admin capability object ID |
| `VITE_GATE_ADMIN_OWNER` | Expected gate admin owner wallet |
| `VITE_ORACLE_ADDRESS` | Expected oracle/operator wallet address |

Do not put API keys, database URLs, private keys, sponsor secrets, or partner
tokens in `VITE_*`. Vite exposes `VITE_*` values to client code after bundling:
[vite.dev/guide/env-and-mode](https://vite.dev/guide/env-and-mode).

## Private Railway Variables

Indexer/API service:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `EFREP_DATABASE_URL` | Supabase Postgres connection string |
| `RUST_LOG` | Rust log level |
| `EFREP_PACKAGE_ID` | Active testnet package ID |
| `EFREP_START_CHECKPOINT` | Indexer start checkpoint |
| `EFREP_EVE_WORLD_API_BASE` | EVE Stillness world API base URL |
| `EFREP_EVE_GRAPHQL_URL` | Sui testnet GraphQL URL for EVE identity lookup |
| `EFREP_EVE_WORLD_PACKAGE_ID` | EVE world package ID |
| `EFREP_EVE_PLAYER_PROFILE_TYPE` | EVE player profile type |
| `EFREP_TRUST_GATE_SCHEMA` | Gate trust schema, currently `TRIBE_STANDING` |
| `EFREP_TRUST_COUNTERPARTY_SCHEMA` | Counterparty schema, currently `TRIBE_STANDING` |
| `EFREP_API_KEY` | Optional server-only partner/API gate |
| `EFREP_RATE_LIMIT_PER_MINUTE` | Optional in-process request limit |
| `EFREP_ALLOWED_ORIGINS` | Allowed browser origins for CORS |
| `EFREP_MAX_CONNECTIONS` | Database pool size |

Gas station service:

| Variable | Purpose |
|---|---|
| Sponsor private key / key material | Pays sponsored transaction gas |
| `ORACLE_API_KEY` | Protects oracle issue route |
| RPC/network variables | Sui testnet RPC configuration |
| Gas/budget caps | Abuse boundary for sponsored transactions |
| Allowed origins | Browser origin control |

Keep all private variables in Railway or another server-side secret store. Never
mirror them into Vercel `VITE_*` variables.

## Active Migrations

Supabase should have the migrations from `indexer/migrations/` applied in order.
Last confirmed applied through production: **0012** (2026-05-05).

### Applied (0001–0012)

```text
0001_efrep.sql                        — core protocol tables
0002_efrep_indexes.sql                — base indexes
0003_efrep_partitions.sql             — partition helpers
0004_gate_challenge_projections.sql   — challenge projection
0005_fix_view_security.sql            — view security fixes
0006_revoke_public_access.sql         — public access lockdown
0007_toll_withdrawals.sql             — toll withdrawal tracking
0008_lock_public_data_api.sql         — API-layer access lock
0009_raw_event_dedup.sql              — raw event dedup
0010_eve_world_data.sql               — EVE world data tables
0011_eve_identity_status.sql          — EVE identity status
0012_eve_identity_character_fields.sql — character field enrichment
```

### Pending — apply to Supabase before next Railway deploy (0013–0019)

Apply in strict order. Each is additive and non-breaking.

```text
0013_world_gates.sql                  — world Gate object projection (Step 1)
0014_trust_api_indexes.sql            — Trust API v1 performance indexes
0015_world_gate_extensions.sql        — world Gate extension state (ExtensionAuthorizedEvent)
0016_identity_enrichment.sql          — identity_resolution_queue for batch enrichment
0017_gate_policy_world_bindings.sql   — GatePolicy ↔ world Gate binding projection
0018_world_gate_links.sql             — bidirectional gate link topology (Step 2)
0019_world_gate_jumps.sql             — per-jump event log (Step 3)
```

Apply via Supabase SQL editor or `psql`:

```bash
psql "$SUPABASE_DB_URL" -f indexer/migrations/0013_world_gates.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0014_trust_api_indexes.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0015_world_gate_extensions.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0016_identity_enrichment.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0017_gate_policy_world_bindings.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0018_world_gate_links.sql
psql "$SUPABASE_DB_URL" -f indexer/migrations/0019_world_gate_jumps.sql
```

Each migration enables RLS and revokes anon/authenticated access on new tables.
All new tables are read only via the Rust API layer.

### Railway environment variable — required before indexer cold start

```bash
EFREP_WORLD_START_CHECKPOINT=308264360
```

Set this in the Railway dashboard before the first deploy that includes Steps 2/3.
This is the Stillness world-event cold-start checkpoint confirmed at the Builders call.
On resume the indexer uses persisted cursor state; this value only matters on first
boot or after a cursor reset.

### Post-deploy smoke tests

```bash
API=https://ef-indexer-production.up.railway.app

# Step 1 — world gate objects
curl "$API/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c"

# Step 2 — topology
curl "$API/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/links"

# Step 3 — jump traffic
curl "$API/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/jumps?limit=10"

# Activity counts
curl "$API/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/activity"
```

Supabase security posture:

- Public table access is locked down.
- Reads are served through the Rust API.
- Do not expose service-role credentials to the frontend.
- Keep connection pool sizing conservative unless Railway/Supabase capacity is
  confirmed.

## Deploy and Redeploy Notes

Frontend:

- Vercel project root directory should be `frontend`.
- `frontend/vercel.json` is the active Vercel config.
- Rebuild after changing any `VITE_*` variable because Vite bakes these values
  into the browser bundle.
- Clear browser cache or force refresh after deployment if the UI appears to
  call old API or gas station URLs.

Indexer/API:

- Railway builds from `indexer/Dockerfile`.
- Do not use `cargo run` as the Railway start command; the Docker image should
  run the compiled binary.
- Confirm `/health` after every redeploy.
- Confirm Trust API actions after deploy:
  - `gate_access`
  - `counterparty_risk`
  - `bounty_trust`

Gas station:

- Confirm `/health` returns `ready: true`.
- Sponsor handoff should reach wallet signing.
- Final execution can still be blocked by wallet-side zkLogin proof fetch
  failures for zkLogin sessions.

## Common Failure Modes

### Wrong `VITE_API_BASE`

Symptoms:

- Frontend loads but panels show stale fallback data or API errors.
- Browser network tab points at localhost or an old Railway URL.

Fix:

- Update `VITE_API_BASE` in Vercel.
- Redeploy the frontend.
- Hard refresh the browser.

### Secret Exposed Through `VITE_*`

Symptoms:

- API key or token appears in built JavaScript.
- Vercel warns about a public-looking key.

Fix:

- Remove the secret from Vercel frontend variables.
- Rotate the exposed secret.
- Move protection to server-side session auth, `EFREP_API_KEY`, or Railway-only
  variables.

### Supabase Connection Pool Exhaustion

Symptoms:

- API health becomes slow or intermittent.
- Railway logs show database connection acquisition errors.
- Supabase shows too many active connections.

Fix:

- Lower `EFREP_MAX_CONNECTIONS`.
- Avoid running multiple indexer replicas against the same cursor set unless
  explicitly designed for it.
- Check for long-running SQL queries before raising pool limits.

### zkLogin Proof Fetch Failure

Symptoms:

- Sponsored transaction builds and sponsor step succeeds.
- Wallet signing fails with a zkLogin proof fetch error.

Fix:

- Treat as wallet/prover availability, not proof that FrontierWarden transaction
  construction failed.
- Retry later or test with a direct-key Ed25519 wallet session where supported.
- Keep docs clear that sponsored flow reaches wallet signing, while final
  execution may be wallet-session dependent.

### Stale Browser Cache

Symptoms:

- UI still calls old endpoints after deployment.
- Wallet modal or session behavior does not match current code.

Fix:

- Hard refresh.
- Clear site data for `frontierwarden.kodaxa.dev`.
- Confirm the deployed Vercel build is the expected commit.

## Decision Log

- Stillness/testnet is the active environment because the frontend, indexer
  config, address manifest, and live API all target testnet.
- Vercel hosts only the static frontend. Long-running indexer/API and gas
  station services run on Railway.
- Public browser config uses `VITE_*`; secrets stay server-side.
- The Trust API is the public integration surface. The UI is an operator/demo
  console on top of that surface.
