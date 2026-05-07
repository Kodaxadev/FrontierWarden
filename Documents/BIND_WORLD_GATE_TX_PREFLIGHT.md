# Bind World Gate Transaction Preflight

**Date:** 2026-05-06
**Status:** Preflight only; no implementation
**Scope:** First real operator transaction flow for
`reputation_gate::bind_world_gate`.

## Decision Summary

Do not implement the bind button yet.

Current live testnet package configured by the frontend/docs is:

```text
0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2
```

Live Sui RPC verification found:

```text
reputation_gate::update_thresholds  FOUND
reputation_gate::withdraw_tolls     FOUND
reputation_gate::bind_world_gate    MISSING
```

Therefore, the Move binding patch is present in source, but the currently
configured live package does not expose `bind_world_gate`. The frontend must
not enable any binding transaction until a package containing the binding
function is deployed and `VITE_PKG_ID` points at that package.

## Core Invariant

```text
Binding proves:
GatePolicy -> world_gate_id

Extension authorization proves:
world_gate_id -> extension TypeName

Verified requires both.
```

The bind transaction can only move a policy from `UNBOUND` to `BOUND`. It must
not claim extension authorization, enforcement, or verified status.

## Move Signature

Source: `sources/reputation_gate.move`

```move
public fun bind_world_gate(
    cap:           &GateAdminCap,
    gate:          &mut GatePolicy,
    world_gate_id: ID,
    ctx:           &mut TxContext,
)
```

Required args:

- owned `GateAdminCap`
- mutable shared `GatePolicy`
- pure `ID` for selected EVE world Gate
- transaction context supplied by Sui

Abort behavior:

- `ENotAdmin` if cap does not govern the selected GatePolicy
- `EAlreadyBound` if the GatePolicy is already bound

## Exact Move Target

Once a new package is deployed:

```text
${VITE_PKG_ID}::reputation_gate::bind_world_gate
```

Do not use the current live package until RPC confirms the function exists.

## Proposed Transaction Builder Shape

Follow existing admin builders in:

- `frontend/src/lib/tx-gate-policy.ts`
- `frontend/src/lib/tx-withdraw-tolls.ts`

Expected shape:

```ts
tx.moveCall({
  target: `${pkgId}::reputation_gate::bind_world_gate`,
  arguments: [
    tx.object(Inputs.ObjectRef({
      objectId: gateAdminCapId,
      version: String(adminCapObject.data.version),
      digest: String(adminCapObject.data.digest),
    })),
    tx.object(Inputs.SharedObjectRef({
      objectId: gatePolicyId,
      initialSharedVersion: gatePolicyVersion,
      mutable: true,
    })),
    tx.pure.id(worldGateId),
  ],
});
```

Open syntax check:

- Confirm the current Mysten transaction builder supports `tx.pure.id(...)`.
- If not, use the package's accepted `ID` encoding pattern from current SDK docs
  before implementation.

## GateAdminCap Discovery

Current admin transaction builders use configured IDs:

- `VITE_GATE_ADMIN_CAP_ID`
- `VITE_GATE_POLICY_ID`
- `VITE_GATE_POLICY_VERSION`

That works for a single configured policy, but it does not prove that the
connected wallet owns the cap.

Preflight RPC check:

```text
suix_getOwnedObjects(owner = EVE wallet, StructType = current package GateAdminCap)
```

returned zero objects for the EVE wallet against the current package type. This
may be because the current package is not the binding package, the cap is owned
elsewhere, or the configured cap is not discoverable through that owner/type
pair.

Recommended next step before implementation:

- query owned objects for `${newPackageId}::reputation_gate::GateAdminCap`
- inspect each cap's `gate_id` field
- match `gate_id` to the selected GatePolicy
- only then show the action as available

If client-side discovery is unreliable, add a read-only API helper later:

```http
GET /gates/:gate_policy_id/admin-caps?wallet=0x...
```

The helper should return candidates only; it must not claim authorization until
the transaction succeeds.

## Sponsorship Recommendation

Use the existing sponsored transaction path only after package/cap discovery is
resolved.

Reasons:

- existing admin actions already use `useSponsoredTransaction`
- diagnostics are already present for wallet signing/session failures
- gas station sponsorship has been proven for gate passage

Flow:

```text
build TransactionKind
-> sponsor API
-> wallet co-sign
-> executeTransaction
-> poll binding-status until UNBOUND -> BOUND
```

## Disabled States

The first implementation should keep the action disabled when:

- package does not expose `bind_world_gate`
- wallet is disconnected
- GatePolicy is already `BOUND` or `VERIFIED`
- no world Gate candidate is selected
- no matching GateAdminCap is owned by the connected wallet
- GatePolicy shared object initial version is unavailable
- selected world Gate row is missing from `/world/gates`
- transaction is building, sponsoring, signing, or executing

Button copy:

```text
Attempt binding
```

Disabled copy examples:

```text
Binding package not deployed
Connect operator wallet
Already bound
Select a world Gate
GateAdminCap not found
GatePolicy version unavailable
Attempt binding unavailable
```

Do not use:

```text
Authorize gate
Enable enforcement
Verified
```

## Confirmation Copy

Before signing:

```text
This transaction binds a FrontierWarden GatePolicy to a selected EVE world Gate
ID. It does not authorize the FrontierWarden extension on the world Gate.
Verified status requires both the GatePolicy binding and active world extension
evidence.
```

Show:

- GatePolicy ID
- selected world Gate ID
- world Gate status
- linked Gate ID
- current binding status
- GateAdminCap object ID
- package ID

## Recommended Implementation Checklist

1. Deploy/publish the Move package that exposes `bind_world_gate`.
2. Update frontend package config to the new package ID.
3. Verify live RPC finds `reputation_gate::bind_world_gate`.
4. Implement GateAdminCap discovery for the connected wallet.
5. Match cap `gate_id` to selected GatePolicy.
6. Add `tx-bind-world-gate.ts` builder.
7. Add `useBindWorldGate` using sponsored transaction diagnostics.
8. Enable `Attempt binding` only when all preflight checks pass.
9. After execution, poll `/gates/:gate_policy_id/binding-status`.
10. Show `BOUND`, not `VERIFIED`, unless extension evidence also exists.

## Recommended Location

Keep the flow in the existing Operator Binding Preflight panel inside Gate Intel
for the first implementation. It already has:

- current GatePolicy
- current binding state
- world Gate candidate list
- extension evidence warning

Do not add a separate Operator tab until multiple operator workflows compete for
space.
