# GatePolicy Binding Fresh Publish Result

Date: 2026-05-06
Environment: Sui testnet / Stillness

## Decision

The existing package upgrade path was rejected for the binding patch because the
dry run reported an incompatible `GatePolicy` layout change:

```text
GatePolicy: Incorrect number of fields: expected 7, found 8
```

The approved path is a fresh package plus fresh compatible `GatePolicy` and
`GateAdminCap`. The previous package and policies are legacy/historical.

## Fresh Package

- Package ID: `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa`
- Original ID: `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa`
- UpgradeCap ID: `0x7fc3220ea06d912afee9ab0ab2514d3cbd9c242983054a36b814a24f032650b9`
- Publish tx: `FeWLpKJSrfQRt47nd51L7NqEYWYYR6MRG6vathKbgBVw`
- Publish checkpoint: `334013897`

RPC verification confirmed `reputation_gate::bind_world_gate` exists on the
fresh package.

## Fresh Shared Objects

- SchemaRegistry: `0xc85e7257af424bd0c17c8537ad74b2e8417f3ba0b8862ac4100ee80f1c3a6e1e`
- SchemaRegistry initial version: `349181655`
- OracleRegistry: `0xcbe4f3a7bdfdcdb3035ccb091729285c5265cfd14e79207145cbde3953912688`
- OracleRegistry initial version: `349181655`

## Active GatePolicy

The active policy is the second fresh policy because it emitted
`GateConfigUpdated` and is indexable by the API.

- GatePolicy ID: `0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807`
- Initial shared version: `349181665`
- Create tx: `HPbaewQMaAR4RXuadeZpZgdiw1wEqKeqaFaXqeFrTQCc`
- Latest config tx: `GpXjDsihTtvKU4MwW8a3KHC8tny366niUqQZsDzRL7Ur`
- Latest config checkpoint: `334017323`
- GateAdminCap ID: `0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3`
- GateAdminCap transfer tx: `4JSqpkZU2Ye91mq5r9RfkS3m5FyPKSG7qou9S2tqvNPf`
- GateAdminCap owner: `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`

The first fresh policy remains recorded in `scripts/testnet-addresses.json` as
`first_unindexed_gate_policy` for audit only.

## Seed Transactions

- Schema registration: `AEDZta3AdTWiyr3yPt3KjAVdx1A5dzhJ8xMiwnGWPna3`
- Bootstrap profile/oracle setup: `FDiGrRgCpYmck3EZEfxzbdkjvGjzwfu2jZ8A7Wjg8rF1`
- CREDIT replay: `4UtKRFh2tSd3BhnQi31dvPy4CLFAKAi8XAHxeUrAydPw`
- Gate/combat attestations: `2fre5GeDQL4ZgTGvZiFJjeb1fAAScDn1YtpJk8iPTJrP`
- TRIBE_STANDING attestation for GateAdmin wallet: `Fu2pv9FnjnFLx8twXRgS3rojBxog6eVPEoGLatqXoN7p`

The broader seed script partially failed during a vouch transaction because of
a stale gas object version. The fresh package has the required schemas,
profile, oracle capability, and standing attestation for the active gate path.

## Config Changes

Frontend production config was updated to the fresh package, active policy,
fresh registries, and fresh GateAdminCap. Railway indexer production config was
updated so `EFREP_PACKAGE_ID` points to the fresh package.

No frontend bind button was enabled. The operator binding UI remains read-only
and disabled until GateAdminCap discovery and transaction construction are
implemented.

## Indexer Cursor Note

The first post-publish smoke found that the legacy `cursor:reputation_gate`
could not safely resume against a new package filter. The indexer now scopes
module cursors by package ID, preventing a fresh package from inheriting a
legacy package cursor.

## Live Smoke Result

- EF-Indexer deploy: `48cba59b-1f8a-45e0-9df6-9a758a29488b`
- EF-Indexer health: `ok`
- Frontend bundle: `/assets/index-DQoT5iAg.js`
- `/world/gates?tenant=stillness`: `41`
- `/gates`: includes the active fresh GatePolicy
- Binding status for active fresh GatePolicy: `unbound`
- `fwExtensionActive`: `false`
- Trust API `gate_access` for active fresh GatePolicy: `ALLOW_FREE`
- Gas station health: `ok`, `ready`

Current product truth remains:

```text
GatePolicy status: UNBOUND
World Gate candidates: indexed
FW extension evidence: absent
Verified binding: false
```

## Rollback State

Rollback means restoring frontend and Railway package/policy config to the
legacy package:

- Legacy package: `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2`
- Legacy GatePolicy: `0xb63c9939e28db885392e68537336f85453392ac07d4590c029d1f65938733e36`

Rollback would return the product to the pre-binding protocol surface.
