# FrontierWarden Live Ops Runbook

Last updated: 2026-05-05

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

Supabase should have the migrations from `indexer/migrations/` applied in order:

```text
0001_efrep.sql
0002_efrep_indexes.sql
0002_trust_api_indexes.sql
0003_efrep_partitions.sql
0004_gate_challenge_projections.sql
0005_fix_view_security.sql
0006_revoke_public_access.sql
0007_toll_withdrawals.sql
0008_lock_public_data_api.sql
0009_raw_event_dedup.sql
0010_eve_world_data.sql
0011_eve_identity_status.sql
0012_eve_identity_character_fields.sql
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
