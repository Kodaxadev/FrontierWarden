# GatePolicy Binding Deployment Preflight

**Date:** 2026-05-06
**Status:** Deployment preflight only; no deployment performed
**Scope:** Package alignment before enabling `bind_world_gate` in the frontend.

## Summary

Do not implement the bind button yet.

The local Move source includes the GatePolicy binding patch, but the current
live testnet package configured by FrontierWarden does not expose
`reputation_gate::bind_world_gate`.

## Current Deployed Package

Current package documented/configured for live testnet:

```text
0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2
```

Live RPC check against that package:

```text
reputation_gate::update_thresholds  FOUND
reputation_gate::withdraw_tolls     FOUND
reputation_gate::bind_world_gate    MISSING
```

Conclusion:

```text
The current deployed package is pre-binding.
```

## Local Move Source Status

`sources/reputation_gate.move` includes:

- `GatePolicy.world_gate_id: Option<ID>`
- `GatePolicyBoundToWorldGate`
- `GatePolicyUnboundFromWorldGate`
- `bind_world_gate`
- `unbind_world_gate`
- `is_world_gate_bound`
- `get_bound_world_gate_id`

Source readiness is not the blocker. Deployment/package alignment is.

## Package Publish / Upgrade Path

Before a frontend bind flow can exist, one of these must happen:

1. Publish a new package containing the binding patch.
2. Or upgrade the existing package if the current `UpgradeCap` is available and
   the upgrade is compatible.

Preflight must confirm:

- active Sui profile/wallet for deployment
- package publish or upgrade command
- package ID produced by publish/upgrade
- whether the package keeps the same current ID or gets a new published ID
- whether old type-origin IDs matter for any existing objects/events
- whether the new package exposes `bind_world_gate`

Do not assume package upgrade semantics. Verify them with RPC and object
inspection after deployment.

## UpgradeCap Availability

Open requirement:

```text
Confirm who owns the UpgradeCap for the current FrontierWarden package.
```

If the `UpgradeCap` is unavailable:

- publish a new package;
- update frontend/backend package config;
- treat old live GatePolicy objects as legacy/unbound unless explicitly
  migrated or recreated.

If the `UpgradeCap` is available:

- validate Sui upgrade compatibility before touching production config;
- confirm whether adding `world_gate_id` to `GatePolicy` is valid for existing
  shared objects;
- still verify old objects before assuming they can be bound.

## Config Updates After Publish

Frontend public config:

- `VITE_PKG_ID` must point to the package that exposes `bind_world_gate`.
- `VITE_GATE_POLICY_ID` must point to a compatible GatePolicy object.
- `VITE_GATE_POLICY_VERSION` must be the GatePolicy initial shared version.
- `VITE_GATE_ADMIN_CAP_ID` must point to the GateAdminCap for that GatePolicy if
  the first flow remains single-policy/config based.

Backend config:

- `EFREP_PACKAGE_ID` must match the active FrontierWarden package used for
  event ingestion.
- Any processor package filters must track the package that emits
  `GatePolicyBoundToWorldGate`.
- Existing world package config is unchanged by this deploy.

Deployment implication:

```text
If VITE_PKG_ID changes, Vercel must redeploy the frontend.
If EFREP_PACKAGE_ID changes, Railway indexer/API config must update and redeploy.
```

## Existing GatePolicy Compatibility Caveat

Adding `world_gate_id` changed the `GatePolicy` struct layout.

Existing live GatePolicy objects should be treated as:

```text
legacy/unbound
```

until one of these is proven:

- Sui package upgrade compatibility allows the existing object to be read and
  mutated by the new layout;
- an explicit migration path exists;
- a replacement GatePolicy is created from the new package.

Do not assume the old live policy can be bound with the new function.

## Required Deployment Checklist

Before any frontend bind implementation:

1. Publish or upgrade a package containing `bind_world_gate`.
2. Capture the resulting active package ID.
3. Update `VITE_PKG_ID` if the frontend package ID changes.
4. Update `EFREP_PACKAGE_ID` if backend event ingestion package changes.
5. Redeploy frontend if any `VITE_*` package/object config changes.
6. Redeploy Railway indexer/API if backend package config changes.
7. Verify RPC:

```text
reputation_gate::bind_world_gate FOUND
```

8. Verify existing Trust API `gate_access` still works.
9. Verify Gate Intel still loads.
10. Verify existing passage/sponsor flows still work or are intentionally
    pointed at a recreated compatible GatePolicy.
11. Only then preflight GateAdminCap discovery.

## RPC Verification Command

Use testnet RPC after publish/upgrade:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sui_getNormalizedMoveFunction",
  "params": [
    "<ACTIVE_FRONTIERWARDEN_PACKAGE_ID>",
    "reputation_gate",
    "bind_world_gate"
  ]
}
```

Expected result:

```text
result present
```

Failure state:

```text
No function was found with function name bind_world_gate
```

If the failure state persists, keep the UI disabled as:

```text
Attempt binding unavailable
```

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
