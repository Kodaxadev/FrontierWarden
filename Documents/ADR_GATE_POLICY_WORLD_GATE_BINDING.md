# ADR: GatePolicy to World Gate Binding

**Date:** 2026-05-05
**Status:** Proposed
**Decision scope:** Architecture only; no code implementation in this ADR.

## Context

FrontierWarden has live Trust API `gate_access` evaluation and live world gate
topology/extension indexing:

- `world_gates` tracks EVE Frontier world Gate objects.
- `world_gate_extensions` tracks world Gate extension TypeName authorization.
- FrontierWarden `GatePolicy` objects evaluate schema, threshold, toll,
  treasury, and pause state.

The missing edge is binding a FrontierWarden `GatePolicy` to an EVE world Gate.
Current `GatePolicy` objects do not store `world_gate_id`. World extension
authorization events prove only:

```text
world_gate_id -> extension TypeName
```

They do not prove:

```text
world_gate_id -> FrontierWarden GatePolicy
```

Therefore FrontierWarden must not activate topology-derived proof warnings from
`world_gates` until the evaluated GatePolicy is bound to a world Gate through
either on-chain binding evidence or an explicitly marked temporary admin binding.

## Option 1: Move-Level Binding

Add binding at the protocol layer. Two viable shapes:

- Add `world_gate_id: ID` to `GatePolicy`.
- Emit `GatePolicyBoundToWorldGate { gate_policy_id, world_gate_id }`.

### Security Properties

This is the strongest option. The binding becomes part of on-chain protocol
state or the event log, so proof bundles can cite chain evidence instead of an
operator-maintained database assertion.

### Migration Impact

Requires a Move upgrade or new binding function/event. Existing GatePolicy
objects need either a compatibility path or an admin binding transaction.

### Implementation Cost

Medium. It touches Move, indexer processors, deployment docs, and frontend
operator flows. It also requires careful upgrade testing.

### Trust API Impact

Topology warnings become authoritative once the indexed binding exists:

- `WARN_WORLD_GATE_OFFLINE`
- `WARN_WORLD_GATE_NOT_LINKED`
- `WARN_FW_EXTENSION_NOT_ACTIVE`

Decision logic should remain unchanged at first; warnings remain additive.

### Gate Intel Impact

Gate Intel can display a clean relationship:

```text
FW GatePolicy -> world Gate -> linked gate/status/extension
```

### Failure Modes

- Binding transaction points to the wrong world Gate.
- Binding exists but world Gate extension authorization is missing or revoked.
- GatePolicy ownership and world Gate OwnerCap authority diverge.

## Option 2: Off-Chain Verified Admin Binding

Add an operator-managed mapping table:

```text
gate_policy_id
world_gate_id
verified_by
proof_tx_digest
created_at
status
```

### Security Properties

This is weaker than Move-level binding. It can be useful as a bridge, but must be
marked non-authoritative unless backed by a verifiable transaction or signed
operator proof.

### Migration Impact

Requires an additive database migration and an admin/operator workflow. No Move
upgrade required.

### Implementation Cost

Low to medium. It can be built faster than a Move upgrade, but needs careful
copy and UI treatment so it does not masquerade as protocol truth.

### Trust API Impact

Trust API can emit topology warnings only when the binding row is marked
verified. Proof bundles should include:

```text
binding_source: "admin_verified"
proof_tx_digest
verified_by
```

### Gate Intel Impact

Gate Intel can show a binding status badge:

```text
UNBOUND | ADMIN VERIFIED | ON-CHAIN VERIFIED
```

### Failure Modes

- Manual mapping mistakes.
- Stale binding after GatePolicy or OwnerCap transfer.
- Operator proof is unclear or not reproducible.

## Option 3: Gate-Keyed Policy Redesign

Redesign FrontierWarden policy state so policy is keyed directly by world
`gate_id`, similar to CivilizationControl's per-gate policy pattern.

### Security Properties

Strong if implemented cleanly, because the policy surface speaks in world Gate
IDs from the start.

### Migration Impact

High. This changes the shape of the current protocol and UI assumptions.
Existing `GatePolicy` object IDs would no longer be the primary product handle.

### Implementation Cost

High. This is closer to a protocol redesign than a binding patch.

### Trust API Impact

`context.gateId` could mean world Gate ID rather than FW GatePolicy ID, which is
clean long-term but breaks current integration expectations unless versioned.

### Gate Intel Impact

Gate Intel becomes simpler because world topology and policy share the same
primary key.

### Failure Modes

- Breaks current Trust API callers.
- Requires a careful migration story for existing GatePolicy objects.
- May duplicate CivilizationControl's design before CCP confirms this is the
intended dApp pattern.

## Recommendation

Adopt **Option 1: Move-Level Binding** as the target architecture.

Permit **Option 2: Off-Chain Verified Admin Binding** only as a temporary bridge,
and label it non-authoritative unless backed by a reproducible proof.

Defer **Option 3: Gate-Keyed Policy Redesign** unless CCP confirms that EVE
Frontier dApps should store gate policy directly by `world_gate_id`.

## Phased Plan

1. Keep topology warnings dormant for unbound GatePolicies.
2. Ask CCP whether gate dApps should use explicit binding objects/events or
   world-gate-keyed policy state.
3. If Move-level binding is approved, add `GatePolicyBoundToWorldGate` or a
   `world_gate_id` field in a protocol upgrade.
4. Index binding evidence and expose binding status in Gate Intel.
5. Activate additive topology warnings only for bound policies.
6. Consider admin-verified binding only if a demo or integration requires a
   bridge before the Move upgrade.

## Open CCP Questions

1. Should dApps store policy keyed directly by `world_gate_id`?
2. Should extensions emit an explicit policy-to-gate binding event?
3. Is `ExtensionAuthorizedEvent` intended to be sufficient proof of extension
   installation, or should dApps also store their own policy binding?
4. How should tools detect stale bindings after OwnerCap transfer?
5. Should proof bundles cite extension authorization, policy binding, or both?

## Decision Guardrail

FrontierWarden should not activate topology-derived proof warnings from
`world_gates` until the gate being evaluated is bound to a world Gate through
either an on-chain binding event/object or an explicitly verified temporary admin
binding.
