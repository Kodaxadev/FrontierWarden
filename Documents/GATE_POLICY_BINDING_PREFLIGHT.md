# GatePolicy World Gate Binding Preflight

**Date:** 2026-05-06
**Branch:** `codex/gatepolicy-binding-preflight`
**Scope:** Preflight only. No Move, Rust, frontend, deployment, or env changes.

---

## Source Inspection Summary

### Move Surface

Current source: `sources/reputation_gate.move`

- `GatePolicy` stores `owner`, `schema_id`, `ally_threshold`,
  `base_toll_mist`, `treasury`, and `paused`.
- `GatePolicy` does not store `world_gate_id`.
- `GateAdminCap` stores only `gate_id`.
- Admin-only actions already use `assert_admin(cap, gate)`.
- `create_gate` creates an unbound shared `GatePolicy` and an owned
  `GateAdminCap`.
- `check_passage` does not depend on world topology.
- Existing events are `PassageGranted`, `PassageDenied`,
  `GateConfigUpdated`, and `TollsWithdrawn`.

### Move Tests

Current source: `tests/reputation_gate_tests.move`

- Existing tests cover passage tiers, abort cases, pause, toll withdrawal, and
  threshold updates.
- No test currently covers world-gate binding.
- The file is already above the 400-line target, so binding tests should move
  into a new focused test module instead of extending it.

### Indexer Surface

Current source: `indexer/src/processor/reputation_gate.rs`

- Reputation gate processor handles `PassageGranted`, `PassageDenied`,
  `GateConfigUpdated`, and `TollsWithdrawn`.
- Binding events must be added only after the Move event shape is final.

Current source: `indexer/src/trust_db.rs`

- `world_gate_for_policy` currently uses a permissive association:

```sql
WHERE fw_gate_policy_id = $1 OR gate_id = $1
```

- This must become a strict binding-table join after binding events are live.

## Exact Move Shape For Implementation

### New Imports

Implementation should add the Move option type in `reputation_gate.move`.
The exact import syntax must be verified during implementation against the
active Sui Move toolchain before committing.

### New Errors

Use new error codes after the existing `EZeroAllyThreshold = 9`:

```move
const EAlreadyBound: u64 = 10;
const ENotBound:     u64 = 11;
```

### GatePolicy Field

Add current-state binding:

```move
world_gate_id: option::Option<ID>,
```

`create_gate` initializes:

```move
world_gate_id: option::none<ID>(),
```

### Event Structs

Use this exact event shape:

```move
public struct GatePolicyBoundToWorldGate has copy, drop {
    gate_policy_id: ID,
    world_gate_id:  ID,
    owner:          address,
    epoch:          u64,
}

public struct GatePolicyUnboundFromWorldGate has copy, drop {
    gate_policy_id: ID,
    world_gate_id:  ID,
    owner:          address,
    epoch:          u64,
}
```

Rationale:

- `gate_policy_id` is the FrontierWarden policy object ID.
- `world_gate_id` is the EVE Frontier world Gate object ID.
- `owner` is the `GatePolicy.owner`, not the transaction sender, so indexers
  can detect stale admin-cap ownership assumptions later.
- `epoch` matches existing event style.

### Entry Functions

Add:

```move
public fun bind_world_gate(
    cap:           &GateAdminCap,
    gate:          &mut GatePolicy,
    world_gate_id: ID,
    ctx:           &mut TxContext,
)
```

Add:

```move
public fun unbind_world_gate(
    cap:  &GateAdminCap,
    gate: &mut GatePolicy,
    ctx:  &mut TxContext,
)
```

## Permission Decisions

### Binding Permission

For the first patch, binding and unbinding require only:

```move
assert_admin(cap, gate)
```

Do not require a world Gate `OwnerCap` in this patch. That would couple
FrontierWarden to world-contract generic types before we have a working
extension install flow.

Security consequence:

- Binding proves the FrontierWarden gate admin asserted the relationship.
- Binding does not prove world Gate operator control by itself.
- Proof bundles must still show extension authorization separately when it
  exists.

### Rebinding Permission

Do not allow silent rebinding.

`bind_world_gate` should abort with `EAlreadyBound` if a binding already exists.
Operators must call `unbind_world_gate` first, then bind the new world Gate.

Rationale:

- Two transactions create a clearer audit trail.
- Indexer state can model active/inactive rows without guessing intent.
- Accidental overwrite becomes harder.

### Unbinding Permission

`unbind_world_gate` should abort with `ENotBound` if no binding exists.

It should emit the prior `world_gate_id`, then clear the current-state option.

## Existing Object Compatibility

Existing live `GatePolicy` objects remain unbound.

After a package upgrade, do not assume old policies have a world binding.
The operator must execute an explicit binding transaction for each policy.

Current live behavior remains valid:

```text
GatePolicy without world_gate_id:
Trust API gate_access works from policy + attestations.
Topology warnings remain dormant.
Node Sentinel remains advisory.
```

## Indexer Migration Decision

Add a new table in the implementation patch:

```text
0017_gate_policy_world_bindings.sql
```

Purpose:

- active current binding projection
- binding/unbinding audit references
- no heuristic backfill

Backfill behavior:

- No automatic backfill.
- Existing GatePolicies produce no row until a `GatePolicyBoundToWorldGate`
  event is observed.
- Optional admin/manual backfill is not part of the protocol patch.

## Indexer Processor Decision

Update `indexer/src/processor/reputation_gate.rs` only after the Move event
shape is final.

Processor behavior:

- `GatePolicyBoundToWorldGate` upserts active binding by `gate_policy_id`.
- `GatePolicyUnboundFromWorldGate` marks the matching active binding inactive.
- IDs are normalized with existing `normalize_sui_address`.
- `tx_digest`, `event_seq`, and `checkpoint_seq` are stored for proof bundles.
- Do not infer binding from `world_gate_extensions`.
- Do not write `world_gates.fw_gate_policy_id` in the first implementation
  unless a later review explicitly approves denormalization.

## Trust API Activation Decision

Topology warnings activate only when:

```text
gate_policy_world_bindings.active = true
AND gate_policy_world_bindings.world_gate_id joins world_gates.gate_id
```

Extension state remains a separate proof signal:

```text
world_gate_extensions.active = true
AND extension_type exactly matches EFREP_FW_GATE_EXTENSION_TYPENAME
```

The first activation patch should preserve ALLOW/DENY decisions and add only
warnings/proof details.

## Required Implementation Order

1. Write Move binding tests in a new focused test module.
2. Implement Move field, events, view, bind, and unbind functions.
3. Run `sui move test --build-env testnet`.
4. Add indexer parser tests for finalized event JSON.
5. Add migration `0017_gate_policy_world_bindings.sql`.
6. Add reputation gate processor branches.
7. Replace loose `world_gate_for_policy` association with strict binding join.
8. Run `cargo test` and `cargo clippy --all-targets -- -D warnings`.
9. Only then add frontend binding badges or controls.

## Blockers Before Code

- Verify exact Move option syntax with the current Sui toolchain.
- Confirm whether `get_world_gate_id` can return `option::Option<ID>` in the
  desired public API shape.
- Decide whether frontend binding controls belong in the first implementation
  branch or a follow-up branch.
