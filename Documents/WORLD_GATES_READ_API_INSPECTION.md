# World Gates Read API Inspection

**Date:** 2026-05-06
**Status:** Inspection only; no implementation
**Branch:** `codex/world-gates-read-api-inspection`

## Question

Can the frontend already load candidate EVE world Gates for the operator
binding selector?

Required selector fields:

- `world_gate_id`
- `item_id`
- `tenant`
- `status`
- `linked_gate_id`
- checkpoint/update marker
- `fw_extension_active`

## Finding

No. The frontend cannot load candidate `world_gates` today.

The existing `/gates` route is a FrontierWarden policy/passages summary, not an
EVE world Gate list. Reusing it for the operator binding selector would confuse
two different concepts:

```text
FrontierWarden GatePolicy / gate passage summary
EVE Frontier world Gate object
```

That distinction must remain explicit.

## Existing `/gates` Payload

Live `/gates` returns fields shaped like `GateSummaryRow`:

```json
{
  "gate_id": "0x...",
  "ally_threshold": 500,
  "base_toll_mist": 100000000,
  "config_updated_at": "2026-05-05 15:35:38.032795+00",
  "latest_checkpoint": 333482336,
  "passages_24h": 0,
  "denies_24h": 0
}
```

Available:

- GatePolicy/gate summary ID
- policy threshold
- toll
- config update timestamp
- latest checkpoint
- recent passage/deny counts

Missing for world Gate selection:

- `item_id`
- `tenant`
- world Gate `status`
- `linked_gate_id`
- `fw_extension_active`
- explicit world Gate naming

## Existing Frontend Data Path

`fetchGates()` currently calls:

```text
GET /gates
```

The frontend maps that payload into `FwGate` for Gate Intel. `FwGate.sourceId`
is still the FrontierWarden gate/policy identifier. It is not a safe candidate
world Gate ID for operator binding.

The binding-status endpoint can expose a bound world Gate once a binding exists,
but it cannot populate the initial candidate list:

```text
GET /gates/{gate_policy_id}/binding-status
```

For the current unbound state it correctly returns `worldGateId = null`.

## Backend Data Availability

The indexed data exists in `world_gates`.

The migration defines:

- `gate_id`
- `item_id`
- `tenant`
- `owner_character_id`
- `owner_address`
- `solar_system_id`
- `linked_gate_id`
- `status`
- `fw_extension_active`
- `fw_gate_policy_id`
- `checkpoint_updated`
- timestamps

The sync path populates this table from Sui GraphQL object reads, filtered by
configured tenant. The missing piece is a read-only API route exposing this
projection to the frontend.

## Route Check

Live production currently has:

```text
GET /gates
GET /gates/{gate_policy_id}/binding-status
```

It does not expose:

```text
GET /world/gates
```

`GET /world/gates` currently returns `404`.

## Recommendation

Add a small read-only endpoint before implementing operator binding UI:

```http
GET /world/gates?tenant=stillness
```

Do not overload `/gates`. In this codebase `/gates` already means
FrontierWarden gate policy/passages summary.

Suggested response:

```json
{
  "tenant": "stillness",
  "gates": [
    {
      "worldGateId": "0x...",
      "itemId": 123456,
      "tenant": "stillness",
      "status": "online",
      "linkedGateId": "0x...",
      "fwExtensionActive": false,
      "checkpointUpdated": 123456789,
      "updatedAt": "2026-05-06T00:00:00Z"
    }
  ]
}
```

Optional later fields:

- `ownerCharacterId`
- `ownerAddress`
- `solarSystemId`

Leave those out of the first endpoint unless the UI needs them immediately.

## Implementation Scope For Next Slice

Backend/API only:

- Add response types.
- Add `GET /world/gates`.
- Filter by tenant with default `stillness`.
- Query `world_gates`.
- Return only read-only indexed fields.
- Add tests for default tenant, explicit tenant, empty result, and field casing.

No bind button yet. No Move changes. No DB migration should be required.

## Operator UI Copy Guardrail

When the UI is implemented, use:

```text
Attempt binding
```

Do not use:

```text
Bind gate
Authorized
```

Authority is proven by the transaction result and indexed binding event, not by
preflight UI state.
