# FrontierWarden Backend — Railway + Vercel Deployment

## Architecture

```
Vercel (static frontend) ──HTTPS──> Railway (Rust indexer + API) ──TCP──> Supabase (PostgreSQL)
                                              │
                                              └─polls─> Sui testnet RPC
                                              └─polls─> EVE World API (Stillness)
```

## Railway Service Setup

### 1. Connect Repository
- Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
- Select `Kodaxadev/FrontierWarden`
- Set **Root Directory** to `indexer`

### 2. Build Configuration
Railway auto-detects the `indexer/Dockerfile` and builds a container image.

| Setting | Value |
|---|---|
| Build Method | Dockerfile |
| Root Directory | `indexer` |
| Start Command | *(leave blank — Docker CMD runs `/app/efrep-indexer`)* |

The Dockerfile uses a multi-stage build:
1. **Builder** (`rust:1.88-bookworm`): `cargo build --release --bin efrep-indexer`
2. **Runtime** (`debian:bookworm-slim`): copies binary + migrations to `/app/`, runs `/app/efrep-indexer`

> **Important**: Do NOT set `cargo run` as the start command. The Docker CMD handles startup.

### 3. Database (Supabase)
The indexer needs a PostgreSQL database. Supabase is recommended:

1. Create a Supabase project (or use existing)
2. Get the **Connection String** (Settings → Database → Connection string → URI)
3. Run all migrations from `indexer/migrations/` in order:
   ```
   0001_efrep.sql
   0002_efrep_indexes.sql
   0003_efrep_partitions.sql
   0004_gate_challenge_projections.sql
   0005_fix_view_security.sql
   0006_revoke_public_data_api.sql
   0007_toll_withdrawals.sql
   0008_lock_public_data_api.sql
   0009_raw_event_dedup.sql
   0010_eve_world_data.sql
   0011_eve_identity_status.sql
   0012_eve_identity_character_fields.sql
   ```
   Use Supabase SQL Editor or `psql`.

4. The `config.toml` `database.url = "env:SUPABASE_DATABASE_URL"` pattern works,
   but Railway also sets `DATABASE_URL` automatically when you provision a database.
   The code checks both.

## Required Railway Environment Variables

| Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Supabase connection string (URI format) |
| `RUST_LOG` | `efrep_indexer=info` | Log level |
| `EFREP_PACKAGE_ID` | `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2` | Sui testnet package ID |
| `EFREP_START_CHECKPOINT` | `0` | Indexer start checkpoint (informational) |
| `EFREP_EVE_WORLD_API_BASE` | `https://world-api-stillness.live.tech.evefrontier.com` | EVE Stillness world API |
| `EFREP_EVE_GRAPHQL_URL` | `https://graphql.testnet.sui.io/graphql` | Sui testnet GraphQL for identity |
| `EFREP_EVE_WORLD_PACKAGE_ID` | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c` | EVE world package |
| `EFREP_EVE_PLAYER_PROFILE_TYPE` | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile` | Player profile type |
| `EFREP_TRUST_GATE_SCHEMA` | `TRIBE_STANDING` | Trust eval gate schema |
| `EFREP_TRUST_COUNTERPARTY_SCHEMA` | `TRIBE_STANDING` | Trust eval counterparty schema |
| `EFREP_MAX_CONNECTIONS` | `5` (default) | Database connection pool size (default 5 in production, clamped to max 10) |
| `EFREP_MAX_CONNECTIONS_OVERRIDE` | (set to enable >10) | Set any value to allow max_connections >10 |

**Not required on Railway** — `config.toml` is still needed for non-overridden defaults
(network.rpc_url, indexer batch_size, poll_interval, etc.). Commit `config.toml`
to the repo or add it as a Railway file mount.

## config.toml on Railway

Railway supports **File Mounts** to inject files at runtime:

1. Railway Dashboard → Environment → File Mounts
2. Create a file at `config.toml` with the content from `indexer/config.example.toml`
3. Fill in real values (package IDs, etc.)
4. Env vars override TOML values when both are set

Alternatively, commit a production `config.toml` to the repo (no secrets in it —
database URL uses `env:` prefix).

## Vercel Frontend Environment Variables

Update these on Vercel (`vercel env add` or dashboard):

| Variable | Value | Target |
|---|---|---|
| `VITE_API_BASE` | `https://<railway-app>.railway.app` | Production |
| `VITE_SUI_NETWORK` | `testnet` | Production |
| `VITE_PKG_ID` | `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2` | Production |
| (other Sui vars) | (unchanged) | Production |

**Do NOT set** for production demo:
- `VITE_GAS_STATION_URL` — sponsor/write flows disabled

## Custom Domain on Railway

1. Railway Dashboard → Settings → Networking → Domains
2. Add `api.frontierwarden.kodaxa.dev` (or similar)
3. Railway gives you a CNAME target
4. Since `kodaxa.dev` uses Vercel DNS, add the CNAME record:
   - In Vercel Dashboard → `kodaxa.dev` domain → DNS Records
   - Add CNAME: `api.frontierwarden` → Railway's target
5. Update `VITE_API_BASE` on Vercel to use the custom domain

## First Deployment Steps

1. **Supabase**: Run all 12 migrations
2. **Railway**: Deploy with env vars + config.toml
3. **Verify API**: `curl https://<railway-url>/health` → `{"status":"ok"}`
4. **Vercel**: Update `VITE_API_BASE` to Railway URL, redeploy
5. **Verify Frontend**: Load `https://frontierwarden.kodaxa.dev`, check panels don't crash

## Safety Notes for First Demo

- **No write flows**: Gas station / sponsor endpoints are NOT exposed
- **Read-only API**: All `/api/*` endpoints are public reads (attestations, scores, gates, intel)
- **Trust eval**: Runs server-side, no sensitive data exposed
- **EVE identity**: Stillness environment only — no Utopia or mainnet
- **Rate limiting**: Configured via `EFREP_RATE_LIMIT_*` env vars (optional)
- **API key auth**: Optional — set `EFREP_API_KEY` to protect write endpoints

## Operator Notes

### Freshness Warnings

The Trust API returns freshness warnings in the proof bundle when no recent FrontierWarden protocol events have been indexed. These warnings are expected and correct:

- `INDEXER_CHECKPOINT_UNKNOWN` — no events exist in `raw_events` yet
- `INDEXER_LAST_EVENT_STALE_SECONDS:N` — last indexed event was over 5 minutes ago
- `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:N` — proof checkpoint lags behind the latest indexed checkpoint

These warnings **clear automatically** when new protocol events are emitted on-chain and indexed. No action is required. The indexer polls the Sui RPC every 1 second and processes events as they appear.

If warnings persist for an extended period, verify:
1. The `EFREP_PACKAGE_ID` matches the deployed Move package on testnet
2. The Sui RPC endpoint (`https://fullnode.testnet.sui.io:443`) is reachable
3. Protocol activity is actually occurring (users registering schemas, creating profiles, issuing attestations, etc.)
