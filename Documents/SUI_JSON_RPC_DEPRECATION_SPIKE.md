# Sui JSON-RPC Deprecation Spike

**Status:** Research complete
**Date:** 2026-05-17
**Branch:** `codex/sui-json-rpc-deprecation-spike`
**Risk horizon:** Mysten targeting JSON-RPC deprecation ~July 2026 (flagged at 2026-05-06 Builders call)

---

## Executive Summary

FrontierWarden has **two distinct RPC layers** that must be addressed separately:

| Layer | Current API | Deprecation risk | Impact if deprecated |
|---|---|---|---|
| Indexer event ingestion | `suix_queryEvents` (JSON-RPC) | **HIGH** — primary deprecation target | Indexer goes dark entirely |
| Frontend object resolution | `SuiJsonRpcClient.getObject` (JSON-RPC) | **HIGH** — same deprecation wave | All operator tx flows break |
| Frontend dapp-kit transport | `SuiGrpcClient` (gRPC/HTTP2) | **LOW** — preferred transport | Not at risk |
| Frontend raw JSON-RPC | Manual `fetch()` → `suix_getOwnedObjects`, `sui_getObject` | **HIGH** | Gate discovery breaks |
| Sponsored tx submission | `client.core.executeTransaction` (dapp-kit) | **LOW** — SDK-managed | Not at risk |
| zkLogin verification | GraphQL `verifySignature` | **NONE** — already migrated | Already compliant |

The indexer and the frontend tx builders are the two production-critical paths.

---

## Phase 0 — Inventory (This Document)

### Indexer (Rust)

#### `indexer/src/rpc.rs` — CRITICAL

Custom `RpcClient` struct (`reqwest` + manual JSON-RPC envelopes). All event ingestion flows through this file.

| Line | Method | Purpose | Deprecation risk |
|---|---|---|---|
| 80 | `suix_queryEvents` | Poll FrontierWarden package events (MoveModule filter) | **HIGH** |
| 121 | `suix_queryEvents` | Poll EVE world package events (MoveEventType filter) | **HIGH** |
| ~171 | `sui_getTransactionBlock` | Fetch checkpoint for events with null `timestampMs` | **HIGH** |

**Notes:**
- Pagination is by `EventID` cursor (tx_digest + event_seq), not checkpoint sequence
- `config.toml` `start_checkpoint` field is informational only; cursor-based pagination ignores it
- The struct is a clean abstraction — this is the adapter boundary for Phase 1

#### `indexer/src/ingester.rs:61`

```rust
let rpc = RpcClient::new(&cfg.network.rpc_url);
```

Single construction point — all event ingestion goes through one `RpcClient` instance.

#### `indexer/src/zklogin_verifier.rs` — ALREADY MIGRATED

GraphQL `verifySignature` query. Not at risk. Endpoint: `EFREP_SUI_GRAPHQL_URL` (default `https://graphql.testnet.sui.io/graphql`).

#### `indexer/src/bin/verify_signature_spike.rs` — DEV ONLY

Dev harness, not deployed. Not at risk. Comment in `Cargo.toml` notes it should be removed when `verifySignature` integration completes in `api_sessions.rs`.

#### Configuration files

| File | Value | Risk |
|---|---|---|
| `indexer/config.example.toml:6` | `rpc_url = "https://fullnode.testnet.sui.io:443"` | config only |
| `indexer/config.prod.toml:5` | `rpc_url = "https://fullnode.testnet.sui.io:443"` | reflects testnet |
| `indexer/config.prod.toml:26` | `graphql_url = "https://graphql.testnet.sui.io/graphql"` | already GraphQL |

---

### Frontend (TypeScript)

#### `frontend/src/lib/dapp-kit.ts:2,5,18` — LOW RISK

```typescript
import { SuiGrpcClient } from '@mysten/sui/grpc';
GRPC_URLS = { testnet: 'https://fullnode.testnet.sui.io:443', ... }
return new SuiGrpcClient({ url: GRPC_URLS[network] });
```

`SuiGrpcClient` is the **preferred** transport. Not at risk. The hardcoded fullnode URL is fine for testnet; configurable via `VITE_SUI_RPC_URL`.

#### `frontend/src/lib/tx-check-passage.ts:15,84,122,167` — CRITICAL

```typescript
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
const rpcClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const attestationObject = await rpcClient.getObject({ id, options: { showContent: true } });
```

**Critical constraint documented in the file's own comment (lines 6–10):**

> IMPORTANT: use SuiJsonRpcClient (not dapp-kit SuiGrpcClient) for object resolution (getCoins, getObject). tx.build MUST be called without a client — passing any client (even SuiJsonRpcClient) in a dapp-kit Provider context triggers valibot schema validation conflicts.

This means migration must preserve the "no client in tx.build()" pattern. A GraphQL replacement for `getObject` must still work as a standalone pre-fetch, not wired into `tx.build()`.

**Affects:** gate passage flow — the highest-frequency operator action.

#### `frontend/src/lib/tx-authorize-fw-extension.ts:17,72,78,87` — HIGH

```typescript
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
const rpcClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const gateObject     = await rpcClient.getObject({ id: worldGateId, options: { showContent: true } });
const ownerCapObject = await rpcClient.getObject({ id: ownerCapId,  options: { showContent: true } });
```

Affects FW extension authorization — operator onboarding flow.

#### `frontend/src/lib/tx-bind-operator-gate.ts:13,55,61,76` — HIGH

```typescript
const rpcClient    = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const policyObject = await rpcClient.getObject({ id: gatePolicyId,  options: { showContent: true } });
const adminCap     = await rpcClient.getObject({ id: adminCapId,    options: { showContent: true } });
```

Affects gate-policy-to-world-gate binding.

#### `frontend/src/lib/tx-bind-world-gate.ts:2,46,51` — HIGH

```typescript
const rpcClient   = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const adminCap    = await rpcClient.getObject({ id: adminCapId, options: { showContent: true } });
```

Affects world gate binding.

#### `frontend/src/lib/tx-gate-policy.ts:8,58,64` — HIGH

```typescript
const rpcClient   = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const adminCap    = await rpcClient.getObject({ id: adminCapId, options: { showContent: true } });
```

Affects gate policy updates.

#### `frontend/src/lib/tx-withdraw-tolls.ts:8,56,62` — MEDIUM

```typescript
const rpcClient   = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const adminCap    = await rpcClient.getObject({ id: adminCapId, options: { showContent: true } });
```

Affects toll withdrawal.

#### `frontend/src/lib/tx-dispute.ts:2,68,71,127,157` — MEDIUM

```typescript
const rpcClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
const obj       = await rpcClient.getObject({ id: objectId, options: { showContent: true, showOwner: true } });
```

Affects fraud challenge / dispute flows.

#### `frontend/src/lib/operator-gate-authority.ts:58,166–216` — HIGH

```typescript
const TESTNET_RPC_URL = "https://fullnode.testnet.sui.io:443";

// Manual raw JSON-RPC envelope (fetch, not SuiJsonRpcClient):
const res = await fetch(rpcUrl(), { method: 'POST', body: JSON.stringify({
  jsonrpc: '2.0', method: 'suix_getOwnedObjects', params: [...]
})});

async function getObject(objectId: string): Promise<SuiObjectData | null> {
  const envelope = await suiRpc<SuiObjectEnvelope>("sui_getObject", [...]);
}
```

Two concerns: (1) hardcoded `TESTNET_RPC_URL` constant, (2) raw `fetch()` JSON-RPC bypasses any SDK abstraction — most fragile path.

Affects: gate cap discovery, operator authority panel.

#### `frontend/src/hooks/useSponsoredTransaction.ts:229,231` — LOW

```typescript
result = await client.core.executeTransaction({ ... });
```

`client` is the dapp-kit `SuiClient` (SuiGrpcClient-backed). `executeTransaction` on the gRPC client is the current supported path. Not at risk.

---

## Risk Ranking

| # | Path | Criticality | Replacement difficulty | Stillness/Utopia |
|---|---|---|---|---|
| 1 | `indexer/src/rpc.rs` — `suix_queryEvents` | **CRITICAL** | High — pagination model changes | Both |
| 2 | `indexer/src/rpc.rs` — `sui_getTransactionBlock` | **HIGH** | Medium | Both |
| 3 | `frontend/src/lib/tx-check-passage.ts` — `SuiJsonRpcClient.getObject` | **CRITICAL** | Medium — valibot constraint must be preserved | Both |
| 4 | `frontend/src/lib/operator-gate-authority.ts` — raw `suix_getOwnedObjects`, `sui_getObject` | **HIGH** | Medium — lowest abstraction, most brittle | Both |
| 5 | `frontend/src/lib/tx-authorize-fw-extension.ts` — `SuiJsonRpcClient.getObject` | **HIGH** | Low (same pattern as #3) | Both |
| 6 | `frontend/src/lib/tx-bind-*.ts` and `tx-gate-policy.ts` — `SuiJsonRpcClient.getObject` | **HIGH** | Low (same pattern as #3) | Both |
| 7 | `frontend/src/lib/tx-dispute.ts` — `SuiJsonRpcClient.getObject` | **MEDIUM** | Low | Both |
| 8 | `frontend/src/lib/tx-withdraw-tolls.ts` — `SuiJsonRpcClient.getObject` | **MEDIUM** | Low | Both |
| 9 | `frontend/src/lib/dapp-kit.ts` — `SuiGrpcClient` init | **LOW** | N/A — not at risk | Both |
| 10 | `indexer/src/zklogin_verifier.rs` — GraphQL `verifySignature` | **NONE** | N/A — already migrated | Both |
| 11 | `indexer/src/bin/verify_signature_spike.rs` | **NONE** | Dev-only, not deployed | N/A |

---

## GraphQL Replacement Candidates

### For `suix_queryEvents`

```graphql
query EventsPage($filter: EventFilter, $cursor: String, $limit: Int) {
  events(filter: $filter, after: $cursor, first: $limit) {
    nodes {
      sendingModule { package { address } name }
      type { repr }
      sender { address }
      json
      timestamp
      checkpoint { sequenceNumber }
      transactionBlock { digest }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

**Pagination difference:** JSON-RPC uses `EventID` cursor (txDigest + eventSeq). GraphQL uses opaque string cursor. Backfill logic in `ingester.rs` stores the last cursor in Postgres — cursor format must be migrated.

**Filter difference:** JSON-RPC supports `MoveModule` filter (package + module). GraphQL filter `emittingModule` may differ. Needs verification against live endpoint.

**Checkpoint in GraphQL:** Available inline on each event node — removes need for the separate `sui_getTransactionBlock` call at item #2.

### For `SuiJsonRpcClient.getObject` / `sui_getObject`

```graphql
query GetObject($id: SuiAddress!) {
  object(address: $id) {
    version
    digest
    asMoveObject {
      contents { json type { repr } }
    }
    owner {
      ... on AddressOwner { owner { address } }
      ... on Shared { initialSharedVersion }
    }
  }
}
```

**Important:** The GraphQL response shape differs from the JSON-RPC `SuiObjectData` shape. All callers that destructure `object.data?.content?.fields` will need adaptation.

**Valibot constraint:** The existing `tx-check-passage.ts` comment documents that `tx.build()` must be called with no client passed — the object refs are pre-fetched and supplied manually. A GraphQL replacement keeps the same pre-fetch pattern; just swap the fetch mechanism and adapt the response parser.

### For `suix_getOwnedObjects`

```graphql
query OwnedObjects($owner: SuiAddress!, $type: String, $cursor: String) {
  address(address: $owner) {
    objects(filter: { type: $type }, after: $cursor, first: 50) {
      nodes { address version digest asMoveObject { contents { json } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

### For `sui_getTransactionBlock` (checkpoint lookup)

Already solved by inline `checkpoint { sequenceNumber }` on GraphQL event nodes — this call can be eliminated entirely after migrating `suix_queryEvents`.

---

## Migration Sequence

### Phase 0 — Inventory (done — this document)

Locate all JSON-RPC usage, classify by criticality, document replacement candidates.

### Phase 1 — Isolate RPC clients behind adapters

**Goal:** No JSON-RPC calls outside adapter boundaries. No behavior change.

**Indexer (Rust):**
- Extract a `SuiEventSource` trait from `rpc.rs`:
  ```rust
  pub trait SuiEventSource: Send + Sync {
      async fn query_events(&self, filter: &EventFilter, cursor: Option<&str>, limit: u64)
          -> Result<(Vec<SuiEvent>, Option<String>)>;
  }
  ```
- `RpcClient` implements `SuiEventSource` (current behavior)
- `GraphQLEventClient` will implement `SuiEventSource` (Phase 3)
- `ingester.rs` takes `&dyn SuiEventSource` — zero behavior change, seam added

**Frontend (TypeScript):**
- Extract `suiObjectFetcher(objectId: string, network: SuiNetwork): Promise<SuiObjectData | null>` into `lib/sui-object-fetcher.ts`
- All 6 `tx-*.ts` files call this shared helper instead of constructing `SuiJsonRpcClient` inline
- `operator-gate-authority.ts` raw `fetch()` calls also move to this helper
- No behavior change — still calls `SuiJsonRpcClient` internally, but callsites are unified

**Quick win — config centralization:**
- Move `TESTNET_RPC_URL` in `operator-gate-authority.ts` to `dapp-kit.ts` / shared network config
- Ensures a single fullnode URL override point in the frontend

### Phase 2 — Migrate read-only object lookups (frontend)

**Goal:** Replace `SuiJsonRpcClient.getObject` with GraphQL in `lib/sui-object-fetcher.ts`.

- Implement `suiObjectFetcherGraphQL()` alongside existing `suiObjectFetcherRpc()`
- Run both and compare response shapes in development (feature-flagged or env-switched)
- Adapt response parsers — `asMoveObject.contents.json` → current `data.content.fields` shape
- Validate that the valibot constraint still holds (pre-fetch remains separate from `tx.build()`)
- Replace `suix_getOwnedObjects` raw calls in `operator-gate-authority.ts`
- This phase requires no indexer changes

**Tests to add:**
- Snapshot test: given a known object ID, both implementations return structurally equivalent data
- Type-check the GraphQL response shape against `SuiObjectData` fields used by each tx builder

### Phase 3 — Migrate event ingestion (indexer)

**Goal:** Replace `suix_queryEvents` with Sui GraphQL `events` query via `GraphQLEventClient`.

- Implement `GraphQLEventClient` as `impl SuiEventSource`
- Handle cursor format migration: last stored `EventID` cursor → GraphQL opaque cursor
  - Option A: full re-index from start checkpoint (safe, slow)
  - Option B: translate `EventID` to approximate checkpoint cursor via the checkpoint in the last stored event row
- Handle filter migration: `MoveModule` → `emittingModule` (verify parity against testnet)
- Inline checkpoint from GraphQL events — remove `sui_getTransactionBlock` calls entirely
- Run GraphQL client in shadow mode alongside RPC client to validate event parity before cutover
- Cutover: `SuiEventSource` trait swap in `ingester.rs` — one line change after Phase 1

**Risk:** This is the highest-risk migration step. Shadow mode is essential.

### Phase 4 — Migrate scripts and debug tooling

- `indexer/src/bin/verify_signature_spike.rs` — dev tool, remove or gate; already has a removal note
- Integration tests in `tests/integration/runner.test.ts` — update checkpoint queries to use GraphQL
- Any scripts using `getCheckpoints()` or checkpoint-based validation

### Phase 5 — Remove deprecated paths

- Delete `lib/sui-object-fetcher.ts` RPC implementation
- Remove `SuiJsonRpcClient` imports from all `tx-*.ts` files
- Remove `operator-gate-authority.ts` `TESTNET_RPC_URL` hardcoded constant and raw `fetch()` JSON-RPC calls
- Remove `indexer/src/rpc.rs` JSON-RPC `RpcClient` impl (keep file if `SuiEventSource` trait lives there)
- Update `config.example.toml` — remove `rpc_url` if no longer needed, or rename to clarify it's fullnode-only for GraphQL transport

---

## Quick Wins (No Migration Required)

These can be done before Phase 1 without behavior risk:

| Win | What | File | Effort |
|---|---|---|---|
| Config centralization | Move `TESTNET_RPC_URL` to shared network config | `operator-gate-authority.ts:58` | 5 min |
| Shared fetcher stub | Create empty `lib/sui-object-fetcher.ts` with current impl | 6 tx-*.ts files | 30 min |
| Comment cleanup | Add deprecation warning comments to all `SuiJsonRpcClient` instantiation sites | All tx-*.ts files | 15 min |
| Remove spike binary | Remove `verify_signature_spike.rs` (already noted for removal) | `indexer/src/bin/` | 5 min |
| Cursor field note | Add a comment to the cursor field in Postgres schema noting format will change in Phase 3 | `indexer/src/ingester.rs` or migration SQL | 5 min |

---

## Open Questions

1. **GraphQL event filter parity.** Does `emittingModule: { package, module }` in GraphQL produce identical event sets to `MoveModule: { package, module }` in JSON-RPC? Must be verified against testnet before Phase 3 cutover.

2. **Cursor migration strategy.** The indexer stores `EventID` (txDigest + eventSeq) as its pagination cursor. GraphQL uses opaque base64 cursors. Phase 3 needs a migration plan — either full re-index or an approximate translation via the last stored checkpoint value.

3. **GraphQL rate limits.** Does `graphql.testnet.sui.io` impose per-IP rate limits that could affect the indexer's polling loop (currently ~500ms interval)? Needs measurement.

4. **`SuiJsonRpcClient` removal timeline.** When does `@mysten/sui/jsonRpc` module become unavailable? The Mysten SDK may deprecate the module separately from the network endpoint. Need to watch `@mysten/sui` changelog.

5. **Stillness vs Utopia GraphQL endpoints.** Both currently point to `graphql.testnet.sui.io`. Are there separate GraphQL endpoints for Utopia after its restart, or does Utopia also use testnet GraphQL? No change required until Utopia restart, but the Utopia config section in `config.example.toml` should note this.

---

## Recommended Next Implementation Branch

```
codex/sui-rpc-adapter-layer
```

Scope: Phase 1 only.

- Extract `SuiEventSource` trait in `indexer/src/rpc.rs`
- Extract `suiObjectFetcher()` helper in `frontend/src/lib/sui-object-fetcher.ts`
- Point all `tx-*.ts` files and `operator-gate-authority.ts` at the shared helper
- Move `TESTNET_RPC_URL` to shared network config
- No behavior change. No network call changes. No GraphQL yet.

This creates the seams that make Phase 2 and 3 safe incremental migrations.

---

## References

- `indexer/src/rpc.rs` — JSON-RPC client implementation (302 lines)
- `indexer/src/zklogin_verifier.rs` — GraphQL verifySignature (already migrated)
- `indexer/src/ingester.rs` — indexer loop, `RpcClient` usage
- `frontend/src/lib/tx-check-passage.ts` — valibot constraint comment (lines 6–10)
- `frontend/src/lib/operator-gate-authority.ts` — raw JSON-RPC calls
- `frontend/src/lib/dapp-kit.ts` — `SuiGrpcClient` init
- Sui GraphQL reference: https://docs.sui.io/references/sui-graphql
- Mysten SDK changelog: https://github.com/MystenLabs/sui/blob/main/sdk/typescript/CHANGELOG.md
