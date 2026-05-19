# TX Builder RPC Replacement Spike

**Branch:** `codex/tx-builder-rpc-replacement-spike`
**Date:** 2026-05-18
**Status:** Design complete — ready for implementation
**Depends on:** `SUI_JSON_RPC_DEPRECATION_SPIKE.md` Phase 2 (shadow infra live)

---

## Problem

All 7 tx builders create a `SuiJsonRpcClient` via `makeSuiJsonRpcClient()` to
pre-resolve object refs before building PTBs. Sui JSON-RPC deprecation (~July
2026) will break every operator transaction flow.

Production telemetry from `window.__suiFetcherTelemetry.summary()` confirmed
active usage: `getObject=6 getCoins=1`.

---

## Call Site Inventory

### getObject — 11 call sites across 7 files

Every getObject call extracts the same data: `version`, `digest`, and
optionally `owner.Shared.initial_shared_version`. None read `content.fields`.

| File | Call sites | What it resolves | Data extracted |
|------|-----------|------------------|----------------|
| `tx-check-passage.ts:161` | 1 | Attestation | version, digest → ObjectRef |
| `tx-bind-operator-gate.ts:52,67` | 2 | GatePolicy + AdminCap | owner.Shared.initial_shared_version + version, digest |
| `tx-authorize-fw-extension.ts:69,78` | 2 | Gate + OwnerCap | version, digest → ObjectRef |
| `tx-bind-world-gate.ts:42` | 1 | AdminCap | version, digest → ObjectRef |
| `tx-gate-policy.ts:59` | 1 | AdminCap | version, digest → ObjectRef |
| `tx-withdraw-tolls.ts:57` | 1 | AdminCap | version, digest → ObjectRef |
| `tx-dispute.ts:90,143,169` | 3 | FraudChallenge (×3 flows) | owner.Shared.initial_shared_version |

**Pattern:** All 11 calls are identical in shape — `getObject({ id, options: { showBcs: false } })`
→ extract `data.version`, `data.digest`, and sometimes `data.owner`.

### getCoins — 1 call site in 1 file

| File | Call sites | What it resolves | Data extracted |
|------|-----------|------------------|----------------|
| `tx-check-passage.ts:88` | 1 | Payment SUI coin | coinObjectId, version, digest, balance |

**Pattern:** `getCoins({ owner, coinType: '0x2::sui::SUI', limit: 50 })` →
sort by balance ascending → select first coin with `balance >= paymentMist`.

---

## Existing Infrastructure

The `sui-object-fetcher.ts` adapter already has:

1. **GraphQL query for single object** (`GQL_GET_OBJECT`): returns address,
   version, digest, owner — exactly what tx builders need.
2. **GraphQL query for owned objects** (`GQL_GET_OWNED_OBJECTS`): paginated,
   type-filtered.
3. **`fetchSuiObjectGraphQL(objectId)`**: returns `SuiObjectData` (address,
   version, digest, type, owner, content).
4. **Mode switch**: `VITE_SUI_OBJECT_FETCHER_MODE=jsonrpc|graphql|shadow`.
5. **Shadow comparison**: `compareObject()` / `compareArray()` in telemetry.
6. **Telemetry**: tx-client method tracking (`getObject`, `getCoins` counters).

What's missing: the tx builders don't use the `fetchSuiObjectGraphQL` path —
they use `SuiJsonRpcClient.getObject()` directly via the instrumented proxy.

---

## Replacement Design

### getObject: Use existing GraphQL path

**Approach:** Add a `resolveObjectRef(objectId)` helper to `sui-object-fetcher.ts`
that returns `{ objectId, version, digest, owner }` using the current mode
switch (jsonrpc → `SuiJsonRpcClient.getObject`, graphql → `fetchSuiObjectGraphQL`).

```typescript
export interface ObjectRefData {
  objectId: string;
  version: string;
  digest: string;
  owner: unknown; // JSON-RPC-compatible owner shape
}

export async function resolveObjectRef(
  objectId: string,
  label: string,
): Promise<ObjectRefData>
```

Each tx builder replaces:
```typescript
const rpcClient = makeSuiJsonRpcClient('tx-check-passage');
const obj = await rpcClient.getObject({ id, options: { showBcs: false } });
// use obj.data.version, obj.data.digest
```
With:
```typescript
const ref = await resolveObjectRef(id, 'tx-check-passage');
// use ref.version, ref.digest
```

**Why this works:**
- `fetchSuiObjectGraphQL` already returns version, digest, owner in
  JSON-RPC-compatible shapes (the mapper handles AddressOwner, Shared, etc.)
- The mode switch already routes jsonrpc/graphql/shadow
- Telemetry already tracks fetches by mode and label
- The valibot constraint (`tx.build()` must have no client) is preserved
  because `resolveObjectRef` is a standalone fetch, not a client

**Shared version extraction** for `Inputs.SharedObjectRef`:
```typescript
export function extractSharedVersion(owner: unknown): number | null
```
Replaces inline `owner.Shared.initial_shared_version` parsing in
`tx-bind-operator-gate.ts` and `tx-dispute.ts`.

**Effort:** ~40 lines added to `sui-object-fetcher.ts`, ~5–10 line change per
tx builder (7 files). No behavior change in jsonrpc mode.

### getCoins: Reuse existing owned-objects GraphQL query

**Verified against live testnet endpoint (2026-05-18).** There is no dedicated
`coins` query on the `Address` type. Coin objects are fetched via the same
`address.objects(filter: { type })` query already used by
`fetchOwnedObjectsByTypeGraphQL`.

**Live-verified GraphQL query:**

```graphql
query OwnerCoins($owner: SuiAddress!, $first: Int) {
  address(address: $owner) {
    objects(filter: { type: "0x2::coin::Coin<0x2::sui::SUI>" }, first: $first) {
      nodes {
        address
        version
        digest
        contents { json type { repr } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

**Live result (testnet address `0x1732...4148`):**
```json
{
  "address": "0xd596...b780",
  "version": 869125831,
  "digest": "6UFb5SPEKCgLLX1xHdnp1gUNve9q5C3HH785aqJ2YBWY",
  "contents": {
    "json": { "id": "0xd596...b780", "balance": "18470418354" },
    "type": { "repr": "0x...02::coin::Coin<0x...02::sui::SUI>" }
  }
}
```

**Key findings:**
1. No `Address.coins` field exists — use `address.objects` with type filter
2. Balance is in `contents.json.balance` as a string (not a dedicated field)
3. Type filter uses the full generic type: `0x2::coin::Coin<0x2::sui::SUI>`
4. This is the SAME query as `GQL_GET_OWNED_OBJECTS` already in the codebase
5. FrontierWarden operator wallets have zero SUI coins (gas is sponsored) —
   the `selectPaymentCoin` runs against the **traveler's** wallet, not the
   operator's

**Proposed approach:**

Add `resolvePaymentCoin(owner, coinType, minBalance, label)` to
`sui-object-fetcher.ts`:

```typescript
export interface CoinRefData {
  objectId: string;
  version: string;
  digest: string;
  balance: bigint;
}

export async function resolvePaymentCoin(
  owner: string,
  coinType: string,
  minBalance: bigint,
  label: string,
): Promise<CoinRefData>
```

**Implementation:** Mode-switched like `resolveObjectRef`. In jsonrpc mode,
calls `SuiJsonRpcClient.getCoins()`. In graphql mode, uses the new GraphQL
query. In shadow mode, runs both and compares.

**Effort:** ~60 lines for the GraphQL query + mapper + shadow comparison.
~5 line change in `tx-check-passage.ts`.

**Risk:** The GraphQL coin query shape must be verified against the live
testnet endpoint before implementation. If the shape differs significantly,
the mapper may be more complex.

---

## Replacement NOT Needed

| Component | Why |
|-----------|-----|
| `dapp-kit.ts` SuiGrpcClient | Preferred transport, not at risk |
| `useSponsoredTransaction.ts` `executeTransaction` | SDK-managed via dapp-kit |
| `fetchOwnedObjectsByType` / `fetchSuiObjectRaw` | Already mode-switched in `sui-object-fetcher.ts` |
| `operator-gate-authority.ts` raw fetch calls | Already migrated in PR #45 |

---

## Implementation Sequence

### Step 1: ~~Verify GraphQL coin query~~ DONE (2026-05-18)

Verified live against `https://graphql.testnet.sui.io/graphql`:
- No `Address.coins` field — use `address.objects(filter: { type })` instead
- Balance is `contents.json.balance` (string)
- Type filter: `"0x2::coin::Coin<0x2::sui::SUI>"`
- Same query as existing `GQL_GET_OWNED_OBJECTS` — no new GraphQL needed
- Schema introspection confirmed: `ObjectFilter { ownerKind, owner, type }`

### Step 2: Add `resolveObjectRef` + `extractSharedVersion` to `sui-object-fetcher.ts`

- Mode-switched: uses existing jsonrpc/graphql/shadow paths
- Telemetry: records via existing `recordTxClient` (or new `recordResolve`)
- Tests: shadow comparison validates parity

### Step 3: Migrate getObject call sites (7 files, ~5 lines each)

Replace `makeSuiJsonRpcClient` + `rpcClient.getObject` with `resolveObjectRef`.
Each file loses its `import { makeSuiJsonRpcClient }` and gains
`import { resolveObjectRef, extractSharedVersion }`.

Order (by frequency / risk):
1. `tx-check-passage.ts` — highest frequency, production-proven path
2. `tx-gate-policy.ts` — operator uses this for threshold updates
3. `tx-withdraw-tolls.ts` — same shape as gate-policy
4. `tx-bind-world-gate.ts` — same shape
5. `tx-bind-operator-gate.ts` — two calls, one needs extractSharedVersion
6. `tx-authorize-fw-extension.ts` — two calls
7. `tx-dispute.ts` — three calls, all need extractSharedVersion

### Step 4: Add `resolvePaymentCoin` to `sui-object-fetcher.ts`

- GraphQL coin query + mapper
- Shadow comparison for coin selection parity
- Mode-switched like resolveObjectRef

### Step 5: Migrate getCoins call site (1 file)

Replace `selectPaymentCoin` in `tx-check-passage.ts` with `resolvePaymentCoin`.

### Step 6: Remove `makeSuiJsonRpcClient` (cleanup)

Once all 7 tx builders are migrated:
- Remove `makeSuiJsonRpcClient` export
- Remove `SuiJsonRpcClient` import
- Remove the instrumented proxy (`instrumentTxClient`)
- Update telemetry (tx-client counters → resolve counters)

**Do NOT remove `SuiJsonRpcClient` from the codebase yet** — it may still be
needed as the jsonrpc-mode backend inside `resolveObjectRef` until full
GraphQL cutover.

---

## Validation Plan

### Shadow mode (pre-cutover)

Set `VITE_SUI_OBJECT_FETCHER_MODE=shadow` on Vercel. Every operator action
runs both JSON-RPC and GraphQL paths. Inspect:

```js
window.__suiFetcherTelemetry.summary()
// Expected: tx-method counters match, no shadow mismatches
```

### GraphQL mode (cutover)

Set `VITE_SUI_OBJECT_FETCHER_MODE=graphql` on Vercel. All tx builders use
GraphQL for object/coin resolution. Production smoke:

1. CHECK PASSAGE from in-game surface → telemetry shows graphql mode
2. Gate policy update → telemetry shows graphql mode
3. Dispute vote → telemetry shows graphql mode

### Rollback

Set `VITE_SUI_OBJECT_FETCHER_MODE=jsonrpc` on Vercel + rebuild. All tx
builders revert to JSON-RPC. Zero code change needed.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GraphQL coin query shape differs from assumption | **Resolved** | N/A | Verified live 2026-05-18: uses `address.objects` with type filter, balance in `contents.json.balance` |
| Shadow mismatch on version/digest for coins | Low | Delays cutover | Shadow mode catches before production |
| GraphQL rate limits on testnet | Low | Slows tx flows | Coin selection is 1 call per tx, not polling |
| valibot constraint violation | Very low | Breaks all tx flows | resolveObjectRef is standalone, not wired into tx.build |

---

## File Impact Summary

| File | Change type | Lines delta |
|------|------------|-------------|
| `sui-object-fetcher.ts` | Add resolveObjectRef, resolvePaymentCoin, extractSharedVersion | +80–100 |
| `tx-check-passage.ts` | Replace makeSuiJsonRpcClient + selectPaymentCoin | -20, +10 |
| `tx-bind-operator-gate.ts` | Replace makeSuiJsonRpcClient + inline shared version | -15, +8 |
| `tx-authorize-fw-extension.ts` | Replace makeSuiJsonRpcClient | -10, +6 |
| `tx-bind-world-gate.ts` | Replace makeSuiJsonRpcClient | -8, +5 |
| `tx-gate-policy.ts` | Replace makeSuiJsonRpcClient | -8, +5 |
| `tx-withdraw-tolls.ts` | Replace makeSuiJsonRpcClient | -8, +5 |
| `tx-dispute.ts` | Replace makeSuiJsonRpcClient × 3 | -15, +10 |

All files stay under 400 lines. No new files needed.
