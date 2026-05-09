# FrontierWarden Testnet Operations Notes

Last updated: 2026-05-07

This is the active network source of truth for FrontierWarden.

## Current Network

| Field | Value |
|---|---|
| Active Sui environment | `testnet` |
| EVE environment | Stillness/testnet |
| Move build environment | `testnet` |
| Address manifest | `scripts/testnet-addresses.json` |
| Chain ID | `4c78adac` |
| Current package | `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa` |
| Original package / type origin | `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa` |
| Active GatePolicy | `0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807` |
| GateAdminCap | `0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3` |
| Bound world Gate | `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c` |
| Binding state | `BOUND`, not `BINDING VERIFIED` |
| FrontierWarden world Gate extension evidence | absent |
| RPC | `https://fullnode.testnet.sui.io:443` |
| Frontend | `https://frontierwarden.kodaxa.dev` |
| Indexer/API | `https://ef-indexer-production.up.railway.app` |
| Gas station | `https://gas-station-production-3b45.up.railway.app` |

Evidence:

- `scripts/testnet-addresses.json` records live object IDs and proof
  transactions for the fresh package.
- `Published.toml` is retained as legacy generated package metadata until it is
  regenerated from a current publish flow; do not use it as active package
  truth.
- `indexer/config.toml` points the indexer at Sui testnet.
- `frontend/.env.example` sets `VITE_SUI_NETWORK=testnet`.
- Live health checks return success for the Vercel frontend, Railway API, and
  Railway gas station.

## Live API Status

Trust API v1 is live for:

- `gate_access`
- `counterparty_risk`
- `bounty_trust`

Gate Intel loads live testnet gates from indexed state.

Sponsored gate-passage transactions build in the browser and reach wallet
signing through the gas station handoff. Do not document this as universal final
gate-passage execution: zkLogin wallet sessions may still fail while fetching a
zkLogin proof before signing.

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
$env:EFREP_RATE_LIMIT_PER_MINUTE = "120"
cargo run --release
```

`EFREP_API_KEY` is optional for local development and server-only when used. Do
not put it in a browser `VITE_*` variable. Browser operators should use the
wallet-signed session flow exposed by `/auth/nonce` and `/auth/session`.

Current operator-session verification is native Rust Ed25519 only. There is no
JavaScript verifier process in the active backend session path. zkLogin, passkey,
secp256k1, and secp256r1 session signatures are not accepted unless backend
support is explicitly implemented later.

`EFREP_RATE_LIMIT_PER_MINUTE` is optional. When set to a positive integer, it
adds an in-process per-minute request limit for non-health API routes,
including session nonce endpoints. Treat it as a testnet guardrail; public
deployments should still use gateway or reverse proxy rate limits.

Run the frontend locally:

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
| `npm run issue:tribe-standing` | Issue `TRIBE_STANDING` to `TRIBE_STANDING_TARGET` or the EVE Vault default. |
| `npm run gas-station` | Run the sponsored transaction service. |
| `npx tsx scripts/seed-tribe-standing.ts` | Issue `TRIBE_STANDING` proof to the test traveler. |
| `npx tsx scripts/create-gate.ts` | Create a new testnet gate policy and admin cap. |

## Latest Gate Proofs

| Flow | Transaction | Checkpoint | Evidence |
|---|---|---:|---|
| Fresh package publish | `FeWLpKJSrfQRt47nd51L7NqEYWYYR6MRG6vathKbgBVw` | `334013897` | Fresh package exposes `reputation_gate::bind_world_gate`. |
| Active GatePolicy config | `GpXjDsihTtvKU4MwW8a3KHC8tny366niUqQZsDzRL7Ur` | `334017323` | Indexed in `gate_config_updates` for active GatePolicy `0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807`. |
| GateAdminCap transfer to EVE Vault | `4JSqpkZU2Ye91mq5r9RfkS3m5FyPKSG7qou9S2tqvNPf` | object owner verified in manifest | GateAdminCap `0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3` owner is `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`. |
| GatePolicy world Gate binding | `BzYVxe3z4x1fXZNnrkPXdHn7HwTsShgwqrUqKPk7o3TC` | `334098874` | Binding status is `BOUND`, not `BINDING VERIFIED`; FW extension evidence is absent. |

## Archived Legacy Network Material

Legacy network notes and package metadata live under `Documents/Obsolete/`.
They are retained only as historical context. Do not use them for current
deployment, scripting, or integration decisions.

The previous binding-preflight package is retained only as historical rollback
context:

- Legacy package: `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2`
- Legacy original/type origin: `0xfd1b1315f9002b65ac2a214d2b7d312db75836c8e67f8f00a747206b5a61876c`

The current live state is `BOUND`, not `BINDING VERIFIED`. Binding proves
`GatePolicy -> world_gate_id`; extension authorization remains a separate proof
and FrontierWarden extension evidence is currently absent.

## Decision Log

- Testnet is the current operational network because the deployed package,
  frontend environment, indexer config, and address manifest all point there.
- Stillness/testnet is the active EVE environment for identity/world data.
- The old legacy-network address manifest name was replaced with
  `testnet-addresses.json` to remove a misleading active-file name.
- Old legacy-network reports were archived instead of deleted so chain-reset history
  remains auditable without polluting the active docs.
