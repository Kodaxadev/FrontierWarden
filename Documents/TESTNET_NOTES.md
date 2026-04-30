# FrontierWarden Testnet Operations Notes

Last updated: 2026-04-29

This is the active network source of truth for FrontierWarden.

## Current Network

| Field | Value |
|---|---|
| Active Sui environment | `testnet` |
| Move build environment | `testnet` |
| Address manifest | `scripts/testnet-addresses.json` |
| Chain ID | `4c78adac` |
| Current package | `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2` |
| Original package / type origin | `0xfd1b1315f9002b65ac2a214d2b7d312db75836c8e67f8f00a747206b5a61876c` |
| RPC | `https://fullnode.testnet.sui.io:443` |

Evidence:

- `Published.toml` records the active `published.testnet` package and chain.
- `scripts/testnet-addresses.json` records live object IDs and proof transactions.
- `indexer/config.toml` points the indexer at Sui testnet.
- `frontend/.env.example` sets `VITE_SUI_NETWORK=testnet`.

## Standard Commands

Switch CLI:

```bash
sui client switch --env testnet
```

Run Move tests:

```bash
sui move test --build-env testnet
```

Build Move package:

```bash
sui move build --build-env testnet
```

Run the indexer/API on Windows PowerShell:

```powershell
cd indexer
$env:EFREP_DATABASE_URL = "<postgres-url>"
$env:EFREP_API_KEY = "<local-api-key>"
$env:EFREP_RATE_LIMIT_PER_MINUTE = "120"
$env:SUI_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql"
cargo run --release
```

`EFREP_API_KEY` is optional for local development, but required before exposing
the Rust API beyond localhost. When set, all API routes except `GET /health`
require `x-api-key` or `Authorization: Bearer`. Browser operators should use
the wallet-signed session flow exposed by `/auth/nonce` and `/auth/session`,
not a browser-bundled API key.

EVE Vault uses zkLogin. Keep Node.js dependencies installed so the Rust API can
call `scripts/verify-personal-message.mjs` for wallet-standard signature
verification. The helper prefers the frontend's `@mysten/sui` v2 package so it
matches the wallet stack. `SUI_GRAPHQL_URL` is optional, but setting it to the
active network removes ambiguity for zkLogin verification.

`EFREP_RATE_LIMIT_PER_MINUTE` is optional. When set to a positive integer, it
adds an in-process per-minute request limit for non-health API routes,
including the session nonce endpoints. Treat it as a testnet guardrail; public
deployments should still use gateway or reverse proxy rate limits.

Run the frontend:

```bash
cd frontend
npm run dev
```

## Active Scripts

| Command | Purpose |
|---|---|
| `npm run register:schemas` | Register the protocol schema set. |
| `npm run register:schemas:dry` | Simulate schema registration. |
| `npm run seed:testnet` | Seed deterministic testnet demo data. |
| `npm run gas-station` | Run the sponsored transaction service. |
| `npx tsx scripts/seed-tribe-standing.ts` | Issue `TRIBE_STANDING` proof to the test traveler. |
| `npx tsx scripts/create-gate.ts` | Create a new testnet gate policy and admin cap. |

## Latest Gate Proofs

| Flow | Transaction | Checkpoint | Evidence |
|---|---|---:|---|
| GateAdminCap transfer to EVE Vault | `EjhkVCtU5JfdNZL6gasvudNPzcExLAswCPXigij1HUYy` | object version `349181621` | Sui object owner is `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`. |
| EVE Vault SEAL & COMMIT | `G4fGxvgpdhbjy4yRu474S9S4vTYpYJqAVcEbSzhrTvsC` | `331437414` | Indexed in `gate_config_updates`. |
| EVE Vault WITHDRAW TOLLS | `CAJWpnWSrqGLqtQqvKQ1NQ829C1QJ6qzcEHGf8U5voud` | `331437435` | Indexed in `toll_withdrawals`. |

## Archived Devnet Material

Devnet-era notes and package metadata live under `Documents/Obsolete/`.
They are retained only as historical context. Do not use them for current
deployment, scripting, or integration decisions.

## Decision Log

- Testnet is the current operational network because the deployed package,
  frontend environment, indexer config, and address manifest all point there.
- The old `devnet-addresses.json` name was replaced with
  `testnet-addresses.json` to remove a misleading active-file name.
- Old devnet reports were archived instead of deleted so chain-reset history
  remains auditable without polluting the active docs.
