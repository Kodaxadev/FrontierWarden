# GatePolicy World Gate Binding Patch Design

**Date:** 2026-05-06
**Status:** Design only, no implementation
**Scope:** Move-level GatePolicy binding, indexer projection, API warning activation, and UI visibility.

---

## Decision

FrontierWarden should bind a `GatePolicy` to an EVE Frontier world Gate with a
hybrid object-plus-event model:

```text
GatePolicy current state:
GatePolicy.world_gate_id: Option<ID>

Binding history:
GatePolicyBoundToWorldGate { gate_policy_id, world_gate_id, owner, epoch }
GatePolicyUnboundFromWorldGate { gate_policy_id, world_gate_id, owner, epoch }
```

Current state is authoritative for proof decisions. Events are required for the
indexer, audit trail, Gate Intel, Node Sentinel, and proof bundles.

## Evidence From Current Source

- `sources/reputation_gate.move` defines `GatePolicy` with policy fields only:
  owner, schema, threshold, toll, treasury, and paused state. It does not store
  `world_gate_id`.
- `sources/reputation_gate.move` already uses `GateAdminCap` plus
  `assert_admin(cap, gate)` for admin-only mutations.
- `GateConfigUpdated` currently carries `gate_id`, `ally_threshold`, and
  `base_toll_mist`; it does not carry world-gate binding state.
- `indexer/src/processor/reputation_gate.rs` already projects
  `GateConfigUpdated`, `PassageGranted`, `PassageDenied`, and `TollsWithdrawn`.
- `indexer/src/trust_db.rs` keeps topology warnings dormant unless a reliable
  `world_gates` association exists.
- `Documents/ADR_GATE_POLICY_WORLD_GATE_BINDING.md` records the hybrid binding
  model confirmed by the 2026-05-06 Builders call.

## Non-Goals

- Do not replace `GatePolicy` with a gate-keyed redesign.
- Do not treat `ExtensionAuthorizedEvent` as a GatePolicy binding.
- Do not activate topology warnings without indexed binding evidence.
- Do not change Trust API v1 request or response envelope.
- Do not implement JumpEvent indexing in this patch.
- Do not infer binding from matching owners, timestamps, or package IDs.

## Move Design

### Struct Change

Add optional current-state binding to `GatePolicy`:

```move
world_gate_id: option::Option<ID>,
```

`create_gate` should initialize it to `option::none<ID>()` so existing policy
creation remains compatible with the current operator flow.

### Events

Add binding events:

```move
public struct GatePolicyBoundToWorldGate has copy, drop {
    gate_policy_id: ID,
    world_gate_id: ID,
    owner: address,
    epoch: u64,
}

public struct GatePolicyUnboundFromWorldGate has copy, drop {
    gate_policy_id: ID,
    world_gate_id: ID,
    owner: address,
    epoch: u64,
}
```

### Entry Functions

Add admin-only functions:

```move
public fun bind_world_gate(
    cap: &GateAdminCap,
    gate: &mut GatePolicy,
    world_gate_id: ID,
    ctx: &mut TxContext,
)
```

```move
public fun unbind_world_gate(
    cap: &GateAdminCap,
    gate: &mut GatePolicy,
    ctx: &mut TxContext,
)
```

Both functions must call `assert_admin(cap, gate)`.

`bind_world_gate` should set `gate.world_gate_id = option::some(world_gate_id)`
and emit `GatePolicyBoundToWorldGate`.

`unbind_world_gate` should abort if there is no current binding, clear the
option, and emit `GatePolicyUnboundFromWorldGate` with the previous world gate
ID.

### View Function

Add:

```move
public fun get_world_gate_id(gate: &GatePolicy): option::Option<ID>
```

This lets clients inspect authoritative current state without reconstructing
from events.

## Indexer Design

### Migration

Add `0017_gate_policy_world_bindings.sql` with:

```sql
CREATE TABLE gate_policy_world_bindings (
    gate_policy_id VARCHAR(66) PRIMARY KEY,
    world_gate_id VARCHAR(66) NOT NULL,
    owner_address VARCHAR(66) NOT NULL,
    bound_tx_digest TEXT NOT NULL,
    bound_event_seq BIGINT NOT NULL,
    bound_checkpoint BIGINT NOT NULL,
    unbound_tx_digest TEXT,
    unbound_event_seq BIGINT,
    unbound_checkpoint BIGINT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Enable RLS and revoke anon/authenticated access following existing migration
style.

### Processor

Extend `processor/reputation_gate.rs`:

- `GatePolicyBoundToWorldGate` upserts active binding by `gate_policy_id`.
- `GatePolicyUnboundFromWorldGate` marks the matching row inactive only when
  `world_gate_id` matches the active row.
- Both paths normalize Sui IDs and store tx digest, event sequence, and
  checkpoint.

Do not write `world_gates.fw_gate_policy_id` from this processor unless the
binding and extension evidence are both exact. Prefer reading through the
binding table first.

### Trust DB Join

Replace the current loose association query:

```sql
WHERE fw_gate_policy_id = $1 OR gate_id = $1
```

with a strict active binding join:

```sql
SELECT wg.status, wg.linked_gate_id
FROM gate_policy_world_bindings b
JOIN world_gates wg ON wg.gate_id = b.world_gate_id
WHERE b.gate_policy_id = $1 AND b.active
LIMIT 1
```

Later, add extension-state enforcement as a separate warning:

```text
WARN_FW_EXTENSION_NOT_ACTIVE
```

Only emit it when binding exists but exact TypeName authorization is absent or
revoked.

## Frontend Design

Gate Intel should display:

```text
WORLD BINDING
UNBOUND | BOUND | EXTENSION ACTIVE | EXTENSION MISSING
```

Node Sentinel should stay advisory until both conditions are true:

```text
active GatePolicy -> world Gate binding
exact world Gate -> FrontierWarden extension TypeName authorization
```

Policy tab should add a small admin-only binding panel after the Move functions
and indexer projection exist. It should not appear before backend support is
live.

## Test Plan

### Move Tests

- `create_gate` initializes with no world binding.
- `bind_world_gate` succeeds with matching `GateAdminCap`.
- `bind_world_gate` aborts with the wrong `GateAdminCap`.
- `unbind_world_gate` emits the previous `world_gate_id`.
- `unbind_world_gate` aborts when no binding exists.
- `check_passage` behavior is unchanged for bound and unbound policies.

### Rust Tests

- Parse `GatePolicyBoundToWorldGate`.
- Parse `GatePolicyUnboundFromWorldGate`.
- Binding upsert creates active row.
- Unbinding clears only matching active row.
- `world_gate_for_policy` returns none when no binding exists.
- `world_gate_for_policy` returns world status only for active binding.
- Topology warnings remain additive and do not change ALLOW/DENY.

### Frontend Tests

- Unbound policy shows `UNBOUND`.
- Bound policy with no extension shows `EXTENSION MISSING`.
- Bound policy with exact TypeName extension shows `EXTENSION ACTIVE`.
- Node Sentinel still labels enforcement advisory when extension is missing.

## Deployment Plan

1. Implement and test Move patch on local/testnet.
2. Publish upgraded package.
3. Update package IDs in Railway/Vercel config using existing deployment process.
4. Apply `0017_gate_policy_world_bindings.sql`.
5. Deploy indexer processor.
6. Run one admin binding transaction for the live GatePolicy.
7. Confirm binding event indexes.
8. Confirm Trust API emits topology warnings only for the bound policy.
9. Add Policy tab binding controls.

## Rollback Plan

- If Move upgrade fails, keep current unbound GatePolicy deployment.
- If indexer deployment fails, revert API to dormant warning behavior.
- If a wrong binding is created, call `unbind_world_gate` and create a new
  binding transaction.
- Never delete binding rows; mark inactive for audit continuity.

## Open Questions Before Implementation

1. Should `bind_world_gate` also require a proof that the caller controls the
   world Gate OwnerCap, or is `GateAdminCap` sufficient for the first patch?
2. Should a `GatePolicy` permit rebinding directly, or require explicit unbind
   before bind?
3. Should `GateConfigUpdated` include `world_gate_id` after binding, or should
   binding remain separate?
4. Should proof bundles cite both the latest binding event and current object
   state once object inspection is wired?
