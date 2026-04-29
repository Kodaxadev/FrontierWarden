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
cargo run --release
```

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
