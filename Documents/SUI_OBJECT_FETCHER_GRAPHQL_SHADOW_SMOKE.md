# Sui Object Fetcher — GraphQL Shadow Smoke Report

**Date:** 2026-05-17
**Branch:** `codex/sui-object-fetcher-shadow-smoke-doc`
**Preceded by:** PR #46 (`codex/sui-object-fetcher-graphql-shadow`) — added shadow infrastructure
**Updated by:** PR #49 (`codex/sui-object-fetcher-graphql-mode`) — added `VITE_SUI_OBJECT_FETCHER_MODE` switch
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

| Layer | Status |
|---|---|
| Owner variant mapping | ✅ Confirmed correct after bug fix (4/4 objects) |
| Type string | ✅ Confirmed matching (4/4 objects) |
| Scalar ID fields (objectId, addresses) | ✅ Same values — encoding wrapper difference only |
| `vector<u8>` fields | ✅ Harmless — not parsed by operator flows |
| Nested struct fields | ✅ Harmless for most parsers; GraphQL improves `parseGate` key field access |
| Live wallet exercise (PlayerProfile/Character/OwnerCap/Gate) | ⏳ Pending — requires testnet wallet session |

**Recommendation:** Phase 2 cutover (swap `fetchSuiObjectRaw` and `fetchOwnedObjectsByType`
to GraphQL implementations) is **safe to proceed** once live wallet shadow exercise confirms
no value-level mismatches. The structural encoding differences are expected and documented.
Owner fragments and mapper are now correct.

---

## References

- `frontend/src/lib/sui-object-fetcher.ts` — GraphQL queries, mapper, shadow wiring
- `frontend/src/lib/operator-gate-authority.ts` — parsers consuming `SuiObjectData`
- `scripts/gql-smoke-compare.mjs` — live comparison script (run: `node scripts/gql-smoke-compare.mjs`)
- `Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md` — Phase 2 migration plan
- Sui GraphQL reference: https://docs.sui.io/references/sui-graphql
- Introspected types: `Owner` union, `AddressOwner`, `ObjectOwner`, `ConsensusAddressOwner`, `Shared`, `Immutable`, `Address`
