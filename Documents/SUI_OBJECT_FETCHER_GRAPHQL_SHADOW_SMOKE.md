# Sui Object Fetcher — GraphQL Shadow Smoke Report

**Date:** 2026-05-17
**Branch:** `codex/sui-object-fetcher-shadow-smoke-doc`
**Preceded by:** PR #46 (`codex/sui-object-fetcher-graphql-shadow`) — added shadow infrastructure
**Updated by:** PR #49 (`codex/sui-object-fetcher-graphql-mode`) — added `VITE_SUI_OBJECT_FETCHER_MODE` switch
**Updated by:** PR #54 (`codex/sponsored-action-path-telemetry`) — added browser-local action lifecycle telemetry
**Scope:** Validate GraphQL object-fetch path against JSON-RPC before Phase 2 cutover

---

## Mode Switch

`VITE_SUI_OBJECT_FETCHER_MODE` controls the active object source (default: `jsonrpc`):

| Value | Behaviour |
|---|---|
| `jsonrpc` | JSON-RPC only (default). |
| `shadow` | JSON-RPC returned; GraphQL fires in background and semantic-compares. Use for smoke testing. |
| `graphql` | GraphQL is the active return path. Use only after shadow confirms parity. |

The legacy `VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true` flag still works and maps to `shadow` mode.

---

## Telemetry Coverage Map

Three layers of browser-local telemetry, each with its own inspector:

| Layer | Inspector | What it covers | Fires from |
|---|---|---|---|
| **Action path** | `window.__fwActionTelemetry` | Sponsored & direct-sign wallet flows: started / build / sponsor / wallet sign / execute / done / failed | `useSponsoredTransaction`, `useVouchActions`, `useDisputeActions` — guaranteed to fire on every button click that reaches the hook (even before wallet is connected) |
| **Tx-builder JSON-RPC** | `window.__suiFetcherTelemetry` (tx-client counters) | `makeSuiJsonRpcClient(label)` proxied `getObject` / `getCoins` | Inside `build()` callback of sponsored tx builders — only after wallet+config checks pass |
| **Operator discovery** | `window.__suiFetcherTelemetry` (fetch + shadow counters) | `fetchOwnedObjectsByType`, `fetchSuiObjectRaw`, semantic shadow comparison | `useOperatorGateAuthority` — only when operator panels mount with a connected wallet |

**Why three layers?** Earlier production observation showed the tx-builder and discovery telemetry both stayed at zero across heavy UI exercise. Investigation found that those telemetry paths are downstream of gates (wallet connected, config present, sponsored build phase reached) — if any of those gates rejects, no telemetry fires and you can't tell whether the button didn't work or the user never finished clicking. The action-path telemetry sits at the very top of every hook, so `started` always increments on a click.

**Not covered by browser telemetry** (and not migration-blocking for the frontend):

- **`/eve/identity/{wallet}`** — backend (`efrep_indexer::eve_identity::client`) already uses Sui GraphQL server-side. Confirmed in Railway logs: `source="sui_graphql"`. The frontend hits this endpoint instead of Sui directly for character/profile lookup.
- **Other `/api/*` endpoints** — Railway-backed; the indexer aggregates and serves cached projections.

### Action telemetry: phases and labels

| Phase | Sponsored | Direct |
|---|---|---|
| `started` | ✓ on entry to `execute()` | ✓ |
| `build_ok` / `build_failed` | ✓ after `await build()` | ✓ |
| `sponsor_request` / `sponsor_ok` / `sponsor_failed` | ✓ | — |
| `wallet_sign_requested` / `wallet_sign_ok` / `wallet_sign_failed` | ✓ via `dAppKit.signTransaction` | ✓ via `dAppKit.signAndExecuteTransaction` |
| `execute_requested` / `execute_ok` / `execute_failed` | ✓ via `client.core.executeTransaction` | ✓ implied from `signAndExecuteTransaction` result |
| `done` / `failed` | ✓ terminal | ✓ terminal |

`errorClass` reuses `SponsoredErrorClass` from `sponsored-diagnostics` plus `wallet_not_connected` and `config_missing` for the gate cases.

Labels: `check_passage`, `update_gate_policy`, `bind_world_gate`, `authorize_fw_extension`, `submit_intel`, `transfer_gate_admin_cap`, `wallet_attestation_issue`, `withdraw_tolls`, `create_gate`, `bind_operator_world_gate`, `vouch-create`, `vouch-redeem`, `dispute-create`, `dispute-vote`, `dispute-resolve`. The sponsored label is whatever the caller passes as `flow` to `execute({ flow })`; the direct labels are hardcoded inside `useVouchActions` / `useDisputeActions`.

Tx-builder labels in use:

| Label | File |
|---|---|
| `tx-authorize-fw-extension` | `tx-authorize-fw-extension.ts` |
| `tx-bind-operator-gate` | `tx-bind-operator-gate.ts` |
| `tx-bind-world-gate` | `tx-bind-world-gate.ts` |
| `tx-check-passage` | `tx-check-passage.ts` |
| `tx-dispute-vote` | `tx-dispute.ts` (`buildVoteChallengeTx`) |
| `tx-dispute-resolve` | `tx-dispute.ts` (`buildResolveChallengeTx`) |
| `tx-gate-policy` | `tx-gate-policy.ts` |
| `tx-withdraw-tolls` | `tx-withdraw-tolls.ts` |

`makeSuiJsonRpcClient()` without a label records as `unlabeled` — no callsites should produce that bucket; if `unlabeled > 0` in production, a new callsite was added without a label.

---

## Shadow Mode Summary

`VITE_SUI_OBJECT_FETCHER_MODE=shadow` fires parallel GraphQL calls fire-and-forget alongside
every `fetchSuiObjectRaw` and `fetchOwnedObjectsByType` call.
JSON-RPC remains the returned value; the GraphQL path is read-only.

**Shadow comparison is semantic, not raw-JSON-equal.** Results are compared field by field
(`objectId`, `type`, `owner`, `version`, `digest`). Expected structural encoding differences
(`content.fields` serialization) are logged at `console.debug` only, not warned.

### Semantic comparison rules

| Field | How compared | Mismatch action |
|---|---|---|
| `objectId` | Exact string equality | `console.warn ✗ semantic mismatch` |
| `type` | Exact string equality | `console.warn ✗ semantic mismatch` |
| `owner` | `JSON.stringify` of normalized shape | `console.warn ✗ semantic mismatch` |
| `version` | String equality (when both present) | `console.warn ✗ semantic mismatch` |
| `digest` | String equality (when both present) | `console.warn ✗ semantic mismatch` |
| `content.fields` | `JSON.stringify` inequality detected | `console.debug ✓ semantic match (encoding diff)` |
| Object set (array calls) | objectId set equality | `console.warn ✗ set mismatch` |

---

## Bugs Found and Fixed (this branch)

Two bugs were found in the GraphQL owner inline fragments committed in PR #46 via live
GraphQL schema introspection (`__type` queries against `graphql.testnet.sui.io`).

### Bug 1 — `AddressOwner` wrong field name

**Committed (broken):**
```graphql
... on AddressOwner { owner { address } __typename }
```

**Actual schema:** `AddressOwner { address: Address }` — the field is `address`, not `owner`.
`Address.address: SuiAddress` is then the hex string.

**Fixed:**
```graphql
... on AddressOwner { address { address } __typename }
```

### Bug 2 — `Parent` type does not exist; `ObjectOwner` and `ConsensusAddressOwner` missing

**Committed (broken):**
```graphql
... on Parent { parent { address } __typename }
```

**Actual schema:** The `Owner` union has five members:
`AddressOwner | ObjectOwner | Shared | Immutable | ConsensusAddressOwner`

`ObjectOwner` — represents object-owned objects; same field shape as `AddressOwner`:
`ObjectOwner { address: Address }`

`ConsensusAddressOwner` — represents consensus-based address ownership (newer variant);
has `address: Address` plus a `startVersion: UInt53` field.

**Fixed:**
```graphql
... on ObjectOwner  { address { address } __typename }
... on ConsensusAddressOwner { address { address } __typename }
```

`ConsensusAddressOwner` maps to the JSON-RPC `AddressOwner` shape since both represent
address ownership of an object.

### Files changed

`frontend/src/lib/sui-object-fetcher.ts`:
- `GQL_GET_OBJECT` owner fragments — corrected
- `GQL_GET_OWNED_OBJECTS` owner fragments — corrected
- `GqlObjectOwner` interface — removed `owner?` and `parent?`; added `address?: { address: string }`
- `mapGqlOwner` — removed `'AddressOwner': owner.owner`, removed `'Parent': owner.parent`; added `ConsensusAddressOwner` case; all three address-owned variants use `owner.address?.address`

---

## Live Comparison Results — 4 Testnet Objects

Script: `scripts/gql-smoke-compare.mjs`
Network: `https://fullnode.testnet.sui.io:443` vs `https://graphql.testnet.sui.io/graphql`

| Object | Label | Type ✓ | Owner ✓ | Fields |
|---|---|---|---|---|
| `0x7b10f2ee...` | GatePolicy (Shared) | ✅ | ✅ | ⚠ encoding diff |
| `0xcbe4f3a7...` | OracleRegistry (Shared) | ✅ | ✅ | ⚠ encoding diff |
| `0x7b4c0652...` | Attestation (AddressOwner) | ✅ | ✅ | ⚠ encoding diff |
| `0x019f5307...` | World Gate (Shared) | ✅ | ✅ | ⚠ encoding diff |

**Owner: 4/4 matching** (after bug fix above).
**Type: 4/4 matching.**
**Fields: 0/4 exact JSON match** — but all mismatches are structural encoding differences
explained below. No mismatch affects parsed output for operator flows.

---

## Structural `content.fields` Encoding Differences

These are systematic differences in how Mysten's JSON-RPC vs GraphQL serialize Move fields.
They affect the raw JSON comparison but not the values extracted by the parsers in
`operator-gate-authority.ts`. All four are irreducible properties of the two serialization
formats — they will always produce shadow `✗ mismatch` logs for any object containing
these field types.

### D1 — `UID` field (`id: UID`)

| Format | Representation |
|---|---|
| JSON-RPC | `"id": { "id": "0x..." }` |
| GraphQL | `"id": "0x..."` |

**Parser impact:** None. `idValue()` in `operator-gate-authority.ts` already handles both:
```typescript
if (typeof value === "string") return value;   // GraphQL bare address
return typeof record.id === "string" ? record.id : null;  // JSON-RPC wrapped
```

### D2 — `vector<u8>` fields (e.g. `schema_id`)

| Format | Representation |
|---|---|
| JSON-RPC | `[84, 82, 73, 66, 69, 95, ...]` (byte array) |
| GraphQL | `"VFJJQkVfU1RBTkRJTkc="` (base64) |

**Parser impact:** None. No `operator-gate-authority.ts` parser reads `schema_id` or any
other `vector<u8>` field from the returned `SuiObjectData`.

### D3 — Nested struct fields

| Format | Representation |
|---|---|
| JSON-RPC | `{ "type": "0x...::Module::StructName", "fields": { field1: v1 } }` |
| GraphQL | `{ field1: v1 }` (flat, no type/fields wrapper) |

**Parser impact:** Partial. `parseCharacter` uses `metadata.fields ?? metadata` which
handles both forms. `parseGate` uses `asRecord(fields.key)` then reads `key.item_id`
and `key.tenant` — with JSON-RPC this returns null (wrapper prevents direct access),
with GraphQL this correctly populates both values. GraphQL is strictly better here.

### D4 — Enum/variant fields

| Format | Representation |
|---|---|
| JSON-RPC | `{ "type": "...", "variant": "ONLINE", "fields": {} }` |
| GraphQL | `{ "@variant": "ONLINE" }` |

**Parser impact:** None. `parseGate`'s `stringValue(fields.status)` returns null for both
object shapes (neither is a string). The status field is informational in the operator UI.

---

## Shadow Log Interpretation

When running with `VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true`, expect:

| Log entry | Meaning |
|---|---|
| `✓ match: fetchSuiObjectRaw(0x...)` | Full structural equality — unlikely for complex objects |
| `✓ semantic match (encoding diff): fetchSuiObjectRaw(0x...)` | objectId/type/owner/version/digest all match; only `content.fields` differs due to encoding. **Normal — not a problem.** |
| `✓ semantic match (encoding diffs): fetchOwnedObjectsByType(…) (N)` | Same as above for an N-object array |
| `✗ semantic mismatch [objectId,type,owner]: fetchSuiObjectRaw(0x...)` | Real divergence — investigate before cutover |
| `✗ set mismatch: fetchOwnedObjectsByType(…) {missing:[…], extra:[…]}` | GQL returned a different object set — investigate before cutover |
| `shadow GraphQL error (object/owned):` in `console.warn` | Network error or GQL endpoint unavailable — JSON-RPC result returned unchanged |

**Expected baseline:** all objects with `id: UID`, `vector<u8>`, or nested struct fields
will log `✓ semantic match (encoding diff)`. This is normal, expected behavior.

**Actionable signal:** any entry with `✗` — especially `objectId`, `type`, or `owner`
field differences — warrants investigation before Phase 2 cutover.

---

## Operator Flows — Live Exercise Status

| Flow | Shadow testable | Status |
|---|---|---|
| Operator Gate Authority discovery (PlayerProfile → Character → OwnerCap → Gate) | Yes — uses `fetchOwnedObjectsByType` + `fetchSuiObjectRaw` | **Requires connected wallet with EVE game objects** — not exercised in this branch (no testnet wallet in CI) |
| GatePolicy provisioning / bind views | No — uses `SuiJsonRpcClient.getObject()` via tx builders, not the shadow-covered path | Out of shadow scope |
| `check_passage` tx build | No — uses `SuiJsonRpcClient.getObject()` | Out of shadow scope |
| `bind_world_gate` tx build | No — uses `SuiJsonRpcClient.getObject()` | Out of shadow scope |
| `authorize_extension` tx build | No — uses `SuiJsonRpcClient.getObject()` | Out of shadow scope |
| update thresholds / gate policy edit | No | Out of shadow scope |
| withdraw tolls | No | Out of shadow scope |
| dispute/challenge tx builder | No | Out of shadow scope |

**Shadow mode scope:** `fetchOwnedObjectsByType` (used by gate cap discovery) and
`fetchSuiObjectRaw` (used for Character and Gate lookups). The tx builder `rpcClient.getObject()`
calls use `SuiJsonRpcClient` directly and are NOT covered by this shadow mode. They will
be addressed separately in Phase 2 of the deprecation plan.

### To complete live wallet exercise

1. Run `npm --prefix frontend run dev` with `.env.local` containing:
   ```
   VITE_SUI_OBJECT_FETCHER_MODE=shadow
   VITE_SUI_NETWORK=testnet
   VITE_PKG_ID=0x31199a56010e6177482b97fa18ddb391f55ac7049275396e98e6a1337cc283c1
   VITE_ORACLE_REGISTRY_ID=0xcbe4f3a7bdfdcdb3035ccb091729285c5265cfd14e79207145cbde3953912688
   VITE_ORACLE_REGISTRY_VERSION=349181655
   VITE_GATE_POLICY_ID=0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807
   VITE_GATE_POLICY_VERSION=349181665
   VITE_GATE_ADMIN_CAP_ID=0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3
   VITE_GATE_ADMIN_OWNER=0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f
   VITE_ORACLE_ADDRESS=0xcfcf2247346d7a0676e2018168f94b86e1d1263fd3afd6862685725c8c49db8f
   ```
2. Connect a wallet that owns an EVE Frontier PlayerProfile on Stillness testnet
3. Navigate to the Operator Console — gate cap discovery fires `fetchOwnedObjectsByType`
   and `fetchSuiObjectRaw`
4. Open DevTools console — filter for `sui-object-fetcher`
5. Count `✓ shadow match` and `✗ shadow mismatch` entries
6. For any mismatch, verify scalar ID values are identical between `rpc` and `graphql` sides

---

## Parity Assessment

### Production shadow result — 2026-05-18

Production browser exercise produced valid evidence for two separate surfaces:

```text
Object-fetcher shadow parity:
fetch total: 12 (shadow=12)
exact: 6
encoding-diff: 6
mismatch: 0
null-mismatch: 0
set-mismatch: 0
error: 0

Tx-builder JSON-RPC observability:
tx-client created: 6
tx-method total: 7
getObject: 6
getCoins: 1
errors: 0
```

Interpretation:

- The object-fetcher adapter path is shadow-proven for the observed production
  flows: `fetchOwnedObjectsByType` and `fetchSuiObjectRaw` produced zero
  actionable divergence.
- The tx-builder JSON-RPC path is observable and healthy in the exercised
  flows, but it is still active. `VITE_SUI_OBJECT_FETCHER_MODE=graphql` does
  not replace `makeSuiJsonRpcClient().getObject()` or `.getCoins()`.
- Dispute vote/resolve does touch the instrumented tx-client path; earlier
  assumptions that it did not were incorrect.

Promotion gate:

| Gate | Status |
|---|---|
| Script-level object smoke | Passed |
| Browser object-fetcher shadow parity | Passed: 12 comparisons, 0 actionable mismatches |
| Tx-builder JSON-RPC observability | Passed: 6 clients, 7 methods, 0 errors |
| Action-path phase telemetry | Merged in PR #54; deploy/use for future top-level action tracing |
| Tx-builder GraphQL replacement | Not implemented |
| Full frontend JSON-RPC removal readiness | Not ready |

Current status:

```text
Backend identity: GraphQL-backed and working.
Object-fetcher adapter: shadow-proven with no actionable mismatches.
Tx-builder JSON-RPC: active, observable, currently healthy.
Action lifecycle telemetry: merged in PR #54; use after deploy for button-to-terminal tracing.
Full JSON-RPC migration: not done because tx-builder getObject/getCoins remain.
```

Recommended next technical branch:

```text
codex/tx-builder-rpc-replacement-spike
```

Goal: determine how to replace `makeSuiJsonRpcClient()` usage. `getObject`
appears GraphQL-replaceable; `getCoins` needs separate design because coin
selection is not equivalent to object metadata lookup.

---

| Layer | Status |
|---|---|
| Owner variant mapping | ✅ Confirmed correct after bug fix (4/4 objects) |
| Type string | ✅ Confirmed matching (4/4 objects) |
| Scalar ID fields (objectId, addresses) | ✅ Same values — encoding wrapper difference only |
| `vector<u8>` fields | ✅ Harmless — not parsed by operator flows |
| Nested struct fields | ✅ Harmless for most parsers; GraphQL improves `parseGate` key field access |
| Production browser shadow exercise | ✅ 12 comparisons, 0 actionable mismatches |

**Recommendation:** Promote only the object-fetcher adapter surface with care.
`VITE_SUI_OBJECT_FETCHER_MODE=graphql` is likely safe for the observed
discovery/object-read path. Do not remove JSON-RPC globally: tx builders still
use `makeSuiJsonRpcClient().getObject()` and `.getCoins()`, and need their own
replacement plan.

---

## References

- `frontend/src/lib/sui-object-fetcher.ts` — GraphQL queries, mapper, shadow wiring
- `frontend/src/lib/operator-gate-authority.ts` — parsers consuming `SuiObjectData`
- `scripts/gql-smoke-compare.mjs` — live comparison script (run: `node scripts/gql-smoke-compare.mjs`)
- `Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md` — Phase 2 migration plan
- Sui GraphQL reference: https://docs.sui.io/references/sui-graphql
- Introspected types: `Owner` union, `AddressOwner`, `ObjectOwner`, `ConsensusAddressOwner`, `Shared`, `Immutable`, `Address`
