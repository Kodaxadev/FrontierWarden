# Operator Binding UX Preflight

**Date:** 2026-05-06
**Status:** Design only; no implementation
**Scope:** First operator flow for binding a FrontierWarden `GatePolicy` to an
EVE Frontier world Gate.

## Core Invariant

```text
Binding proves:
GatePolicy -> world_gate_id

Extension authorization proves:
world_gate_id -> extension TypeName

Verified state requires both.
```

Do not collapse these concepts. A bound policy is not automatically installed
as a world Gate extension. An active extension is not automatically a
FrontierWarden policy binding.

## Recommended UX Flow

### 1. Entry Point

Place the first operator binding flow behind authenticated operator UI only.
The likely home is Gate Intel or a dedicated admin/operator panel.

Rules:

- No public bind controls.
- No automatic binding suggestions that can be signed blindly.
- No bind button on generic read-only proof views.
- Show binding state before any action: `UNBOUND`, `BOUND`, or
  `BINDING VERIFIED`.

### 2. World Gate Selection

Use indexed `world_gates` as the selection source.

Initial filter:

- `tenant = "stillness"`
- Show only real indexed world Gate rows.
- Do not infer FrontierWarden extension state from package IDs or matching
  owners.

Display fields:

- world Gate ID
- item ID
- tenant
- status
- linked gate ID
- latest checkpoint/update marker
- `fw_extension_active`

Operator copy:

```text
Select the EVE world Gate this FrontierWarden GatePolicy should govern.
This creates policy binding only. It does not prove the FrontierWarden
extension is authorized on the world Gate.
```

### 3. Binding Authority

The first implementation should require `GateAdminCap` only.

Signer action:

```text
reputation_gate::bind_world_gate(cap, gate_policy, world_gate_id, ctx)
```

Do not require world Gate `OwnerCap` in this first flow. OwnerCap-backed
extension authorization is separate and should be implemented or verified in a
later flow.

### 4. Intent Confirmation

Before signing, show a confirmation panel with:

- GatePolicy ID
- selected `world_gate_id`
- world Gate status
- `linked_gate_id`
- tenant
- current binding status
- whether `fw_extension_active` is true
- warning that binding does not prove extension authorization

Suggested warning copy:

```text
This transaction binds a FrontierWarden GatePolicy to a world Gate ID.
It does not authorize the FrontierWarden extension on that world Gate.
The gate remains unverified until extension authorization evidence is indexed.
```

### 5. Transaction Result

After successful signing:

1. Wallet submits `bind_world_gate`.
2. Move emits `GatePolicyBoundToWorldGate`.
3. Indexer observes the event.
4. `GET /gates/{gate_policy_id}/binding-status` moves from `unbound` to
   `bound`.
5. Gate Intel and Node Sentinel update from the binding-status API.

Indexer-lag copy:

```text
Binding transaction submitted. Waiting for the indexer to observe
GatePolicyBoundToWorldGate.
```

## State Labels

### UNBOUND

Meaning:

```text
No active GatePolicy -> world_gate_id binding exists.
```

Use when `bindingStatus = "unbound"`.

### BOUND

Meaning:

```text
An active GatePolicy -> world_gate_id binding exists.
World extension authorization is missing or inactive.
```

Use when `bindingStatus = "bound"`.

### BINDING VERIFIED

Meaning:

```text
An active GatePolicy -> world_gate_id binding exists, and the bound world Gate
has active FrontierWarden extension TypeName evidence.
```

Use only when `bindingStatus = "verified"`.

## Failure States

### Already Bound

Copy:

```text
This GatePolicy is already bound. Unbind it before creating a new binding.
```

Reason: no silent rebinding.

### Missing GateAdminCap

Copy:

```text
Connected wallet does not control the GateAdminCap for this GatePolicy.
```

### Selected Gate Offline

Copy:

```text
Selected world Gate is offline. Binding is allowed, but proof warnings may
report the gate as offline after indexing.
```

### Selected Gate Unlinked

Copy:

```text
Selected world Gate has no linked gate. Binding is allowed, but topology proof
will report the gate as unlinked.
```

### Indexer Lag

Copy:

```text
Binding transaction succeeded, but the indexer has not observed the event yet.
```

### Bound But Extension Inactive

Copy:

```text
GatePolicy binding exists, but the world Gate has no active FrontierWarden
extension authorization.
```

### Extension Active But No Binding

Copy:

```text
World Gate extension authorization exists, but no FrontierWarden GatePolicy is
bound to this world Gate.
```

## Copy Rules

- Never say `enforced` unless `bindingStatus = "verified"`.
- Use `bound` only for the GatePolicy relation.
- Use `extension active` only for world Gate TypeName authorization.
- Use `binding verified` only when both binding and extension authorization are
  present.
- Keep `advisory` language anywhere binding or extension proof is missing.

## API Fields Needed

Existing binding-status API fields are enough for read-only display:

- `gatePolicyId`
- `bindingStatus`
- `worldGateId`
- `worldGateStatus`
- `linkedGateId`
- `fwExtensionActive`
- `extensionType`
- `active`
- `boundTxDigest`
- `boundCheckpoint`
- `updatedAt`

Additional fields likely needed for the binding form:

- list of `world_gates`
- `item_id`
- `tenant`
- latest checkpoint/update marker
- current selected GatePolicy admin capability status, if available client-side

Do not add these until implementation planning.

## Implementation Checklist

1. Confirm the latest Move package with `bind_world_gate` is deployed.
2. Confirm frontend has the current package ID.
3. Add operator-only binding entry point.
4. Load candidate `world_gates`.
5. Add confirmation panel with explicit warning copy.
6. Build and sign `bind_world_gate` transaction.
7. Show submitted digest.
8. Poll binding-status API until `unbound -> bound`.
9. Keep `verified` unavailable until extension authorization evidence exists.
10. Add unbind only as a separate follow-up.

## Future Follow-Ups

- Unbind flow.
- Extension authorization flow with world Gate OwnerCap.
- Admin-verified bridge, if needed, clearly marked non-authoritative.
- Discovery metadata update once a production gate reaches verified state.
- Proof-bundle copy that cites both binding event and extension event.

## Open Questions

1. Should the binding panel live in Gate Intel or a dedicated Operator tab?
2. Can the wallet/client reliably detect `GateAdminCap` before signing?
3. Should offline or unlinked gates be bindable with warnings, or blocked?
4. Should the first extension authorization UX live next to binding or remain a
   separate advanced flow?
5. What exact production copy should distinguish `bound` from `verified` for
   non-technical operators?
