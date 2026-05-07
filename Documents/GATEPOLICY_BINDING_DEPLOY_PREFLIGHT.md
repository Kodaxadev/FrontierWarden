# GatePolicy Binding Deployment Preflight

**Date:** 2026-05-06
**Status:** Deployment preflight only; no deployment performed
**Scope:** Package alignment before enabling `bind_world_gate` in the frontend.

## Decision

Do not implement the bind button yet.

The local Move source includes the GatePolicy binding patch, but the current
live testnet package configured by FrontierWarden does not expose
`reputation_gate::bind_world_gate`.

The current deployment wallet owns an `UpgradeCap` for the configured package,
but upgrade compatibility is not proven because the local Sui CLI is behind the
testnet protocol. The safest approved path is:

```text
fresh package + fresh compatible GatePolicy + fresh GateAdminCap
```

Use the upgrade path only if a current CLI dry run proves compatibility and an
object-level test proves old GatePolicy objects are usable.

## Current Evidence

Current configured package:

```text
0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2
```

Live RPC function check:

```text
reputation_gate::create_gate               FOUND
reputation_gate::update_thresholds         FOUND
reputation_gate::withdraw_tolls            FOUND
reputation_gate::bind_world_gate           MISSING
reputation_gate::get_bound_world_gate_id   MISSING
```

Local source includes:

- `GatePolicy.world_gate_id: Option<ID>`
- `GatePolicyBoundToWorldGate`
- `GatePolicyUnboundFromWorldGate`
- `bind_world_gate`
- `unbind_world_gate`
- `is_world_gate_bound`
- `get_bound_world_gate_id`

Local build:

```powershell
sui move build --dump-bytecode-as-base64 --silence-warnings
```

Result:

```text
build succeeded
```

Active Sui profile:

```text
active address: 0xcfcf2247346d7a0676e2018168f94b86e1d1263fd3afd6862685725c8c49db8f
active env:     testnet
testnet RPC:    https://fullnode.testnet.sui.io:443
```

UpgradeCap evidence:

```text
UpgradeCap ID:
0x60913b9130eecf0966d30bcb211a55369107de68083e0692dfe263a782058fea

UpgradeCap package:
0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2

UpgradeCap owner:
0xcfcf2247346d7a0676e2018168f94b86e1d1263fd3afd6862685725c8c49db8f

Upgrade policy:  0
Upgrade version: 2
```

Upgrade dry-run attempted:

```powershell
sui client upgrade `
  --upgrade-capability 0x60913b9130eecf0966d30bcb211a55369107de68083e0692dfe263a782058fea `
  --dry-run `
  --json `
  --gas-budget 500000000 `
  .
```

Observed result:

```text
Network protocol version is ProtocolVersion(123), but the maximum supported
version by the binary is 121. Please upgrade the binary.
```

Conclusion:

```text
UpgradeCap ownership is confirmed.
Upgrade compatibility is not confirmed.
The local Sui CLI must be upgraded before any publish/upgrade dry run can be
trusted.
```

Sui's official upgrade docs say upgrades require the `UpgradeCap` flow and
layout-compatible changes, including unchanged existing struct layouts. They
also recommend versioning/migration patterns for shared objects:

- <https://docs.sui.io/develop/publish-upgrade-packages/upgrade>

## Compatibility Warning

Adding `world_gate_id` changed the `GatePolicy` struct layout.

Existing live GatePolicy objects must be treated as:

```text
legacy/unbound
```

until one of these is proven:

- Sui package upgrade compatibility accepts the new layout;
- an explicit migration path exists;
- a replacement GatePolicy is created from the new package.

Because Sui's documented upgrade rules require existing struct layouts to remain
the same for compatible upgrades, this change is likely unsafe for existing
`GatePolicy` objects unless a current CLI dry run and object-level test prove
otherwise.

## Recommended Path

Prefer fresh package plus fresh compatible policy.

Reason:

- current live package is pre-binding;
- local source changes the `GatePolicy` layout;
- UpgradeCap exists, but compatibility is unproven;
- a fresh compatible `GatePolicy` avoids mutating assumptions around old shared
  object layout.

Consider upgrade only if:

1. the local Sui CLI supports the current testnet protocol;
2. `sui client upgrade --dry-run` succeeds;
3. compatibility output explicitly accepts the package change;
4. a test call proves the existing live `GatePolicy` can still be read and used;
5. the team intentionally chooses to keep the old policy rather than replace it.

## Command Sequence

### 1. Upgrade Local Sui CLI

```powershell
sui --version
sui client active-env
sui client active-address
```

The CLI must support the current testnet protocol before deployment commands are
meaningful.

### 2. Build

```powershell
sui move build
```

If dependency verification is intentionally skipped, record why.

### 3. Upgrade Dry Run

```powershell
sui client upgrade `
  --upgrade-capability 0x60913b9130eecf0966d30bcb211a55369107de68083e0692dfe263a782058fea `
  --dry-run `
  --json `
  --gas-budget 500000000 `
  .
```

If this fails on layout compatibility, stop and use the fresh package path.

### 4. Fresh Package Dry Run

```powershell
sui client publish --dry-run --json --gas-budget 500000000 .
```

### 5. Fresh Package Publish

Do not run until explicitly approved:

```powershell
sui client publish --json --gas-budget 500000000 .
```

Capture:

- new package ID;
- new UpgradeCap ID;
- transaction digest.

### 6. Create Compatible GatePolicy

After `scripts/testnet-addresses.json` or the package source for
`scripts/lib/seed-config.ts` points at the new package:

```powershell
npx tsx scripts/create-gate.ts <ADMIN_OWNER_ADDRESS>
```

The script calls `<NEW_PACKAGE_ID>::reputation_gate::create_gate` and captures:

- GatePolicy ID;
- GatePolicy initial shared version;
- GateAdminCap ID;
- GateAdminCap owner;
- create transaction digest;
- optional transfer transaction digest.

### 7. Normalized Function Verification

Call `sui_getNormalizedMoveFunction` for:

```text
<ACTIVE_FRONTIERWARDEN_PACKAGE_ID>::reputation_gate::bind_world_gate
```

Expected:

```text
result present
```

If missing, keep the UI disabled as `Attempt binding unavailable`.

## Config Updates

Frontend public config:

- `VITE_PKG_ID`
- `VITE_GATE_POLICY_ID`
- `VITE_GATE_POLICY_VERSION`
- `VITE_GATE_ADMIN_CAP_ID`, only while the first flow remains single-cap based

Backend config:

- `EFREP_PACKAGE_ID`

Also review `scripts/testnet-addresses.json` because `scripts/create-gate.ts`
updates it after creating the compatible policy/cap pair.

Deployment implication:

```text
If VITE_PKG_ID changes, Vercel must redeploy the frontend.
If EFREP_PACKAGE_ID changes, Railway indexer/API config must update and redeploy.
```

World package config is unchanged.

## Required Checklist

Before any frontend bind implementation:

1. Upgrade local Sui CLI until dry-run commands support the current testnet
   protocol.
2. Decide fresh package or compatible upgrade from dry-run evidence.
3. Publish or upgrade a package containing `bind_world_gate`.
4. Capture the active package ID.
5. Create a compatible `GatePolicy` and `GateAdminCap` if using the fresh path.
6. Capture GatePolicy ID, initial shared version, and GateAdminCap ID.
7. Update frontend `VITE_*` config if package/object config changes.
8. Update Railway `EFREP_PACKAGE_ID` if event ingestion package changes.
9. Redeploy Vercel and Railway as required.
10. Verify RPC says `reputation_gate::bind_world_gate FOUND`.
11. Verify Trust API `gate_access` still works.
12. Verify Gate Intel still loads.
13. Verify passage/sponsor flows still work or are intentionally switched.
14. Verify `/gates/:gate_policy_id/binding-status` returns `unbound`.
15. Only then preflight GateAdminCap discovery.

## Rollback Plan

If the fresh package path fails after config update:

1. Revert Vercel `VITE_PKG_ID`, `VITE_GATE_POLICY_ID`,
   `VITE_GATE_POLICY_VERSION`, and `VITE_GATE_ADMIN_CAP_ID`.
2. Revert Railway `EFREP_PACKAGE_ID` if it changed.
3. Redeploy Vercel and Railway.
4. Keep the operator bind UI disabled as `Attempt binding unavailable`.
5. Keep the old package/policy as legacy/historical.

If an upgrade path fails before execution:

```text
No production rollback is needed because no chain/config mutation occurred.
```

If an upgrade transaction succeeds but object compatibility fails:

```text
Treat existing policies as legacy/unbound.
Create a fresh compatible GatePolicy.
Point config at the compatible policy only after Trust API and Gate Intel pass
smoke tests.
```

## Open Risks

- Local Sui CLI is stale relative to testnet protocol and must be upgraded.
- `GatePolicy` layout compatibility is unproven and likely unsafe to assume.
- Frontend `VITE_*` config and Railway `EFREP_PACKAGE_ID` can drift.
- Binding events can become invisible if Railway watches the wrong package.
- Existing live GatePolicy objects remain legacy/unbound unless explicitly
  migrated or replaced.

## Next Step After Package Alignment

Once RPC confirms `bind_world_gate` exists:

1. Query GateAdminCap ownership for the connected wallet.
2. Confirm cap `gate_id` matches the selected GatePolicy.
3. Confirm transaction builder encoding for the `ID` argument.
4. Only then implement `Attempt binding`.

Button copy remains:

```text
Attempt binding
```

Never use:

```text
Authorize gate
Enable enforcement
Verified
```
