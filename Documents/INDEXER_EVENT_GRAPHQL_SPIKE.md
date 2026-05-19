# Indexer Event GraphQL Migration Spike

**Status:** Research complete — feasible, no blockers
**Date:** 2026-05-19
**Branch:** `codex/indexer-event-graphql-spike`
**Depends on:** `SuiEventSource` trait seam (already extracted in `event_source.rs`)

---

## Executive Summary

The Rust indexer's event ingestion path uses two JSON-RPC methods:
`suix_queryEvents` (2 call sites) and `sui_getTransactionBlock` (1 call site,
checkpoint backfill only). All three have direct GraphQL replacements that are
**live and verified against testnet** as of this writing.

The `SuiEventSource` trait boundary already exists in `event_source.rs`.
Migration is a new `impl SuiEventSource` backed by GraphQL, selected by config.
No schema change required. Cursor migration uses `afterCheckpoint` filter with
the last checkpoint stored in `raw_events`.

---

## 1. JSON-RPC Method Inventory

### 1a. `suix_queryEvents` — MoveModule filter (rpc.rs:65–106)

Called by `ingester.rs` main loop for each of the 10 tracked FW modules.

```
Filter:  {"MoveModule": {"package": pkg, "module": mod}}
Cursor:  EventID {txDigest, eventSeq}  (ascending order, false = ascending)
Limit:   config batch_size (default 100)
```

**Fields consumed downstream** (via `SuiEvent` struct → `processor::process`):
| Field | Source | Used by |
|---|---|---|
| `id.tx_digest` | `id.txDigest` | raw_events PK, all projections |
| `id.event_seq` | `id.eventSeq` | raw_events PK, dedup |
| `package_id` | `packageId` | raw_events |
| `transaction_module` | `transactionModule` | processor dispatch key |
| `sender` | `sender` | raw_events |
| `type_` | `type` | event_name() dispatch, raw_events |
| `parsed_json` | `parsedJson` | all projection handlers |
| `timestamp_ms` | `timestampMs` | raw_events (epoch millis string) |
| `checkpoint` | `checkpoint` | raw_events checkpoint_seq |

### 1b. `suix_queryEvents` — MoveEventType filter (rpc.rs:109–147)

Called by `ingester.rs` for world gate events (extension, topology, jump).

```
Filter:  {"MoveEventType": "0xpkg::gate::EventName"}
Cursor:  EventID {txDigest, eventSeq}
```

Same `SuiEvent` fields consumed as 1a.

### 1c. `sui_getTransactionBlock` — checkpoint backfill (rpc.rs:167–201)

Called by `fill_missing_checkpoints()` when `SuiEvent.checkpoint` is null.
Only fetches `TransactionBlock.checkpoint` — all show* options are false.

**This call is eliminated entirely by GraphQL** because checkpoint is inline
on every event node via `transaction.effects.checkpoint.sequenceNumber`.

---

## 2. GraphQL Replacement Queries — Live Verified

### 2a. Events by module (replaces MoveModule filter)

```graphql
query EventsByModule($module: String!, $cursor: String, $limit: Int) {
  events(
    filter: { module: $module }
    after: $cursor
    first: $limit
  ) {
    nodes {
      sequenceNumber              # event_seq within tx
      timestamp                   # ISO 8601 DateTime
      sender { address }
      contents {
        json                      # parsedJson equivalent
        type { repr }             # full StructTag
      }
      transactionModule {
        package { address }       # packageId
        name                      # module name
      }
      transaction {
        digest                    # txDigest
        effects {
          checkpoint { sequenceNumber }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

**Variables:** `module` = `"0xpkg::module_name"` (package address + `::` + module).

**Verified:** Live query against `graphql.testnet.sui.io` with
`module: "0xb43f...::reputation_gate"` returned correct events in ascending
checkpoint order with all required fields populated.

### 2b. Events by type (replaces MoveEventType filter)

Same query structure, swap `module` for `type` in the filter:

```graphql
filter: { type: "0xpkg::gate::GateLinkedEvent" }
```

**Verified:** Live query with full StructTag returned matching events.

### 2c. Checkpoint filter (cursor migration bootstrap)

```graphql
filter: { module: "0xpkg::mod", afterCheckpoint: 337848469 }
```

**Verified:** `afterCheckpoint` correctly returns only events from checkpoints
strictly after the given sequence number.

---

## 3. Field Mapping: JSON-RPC → GraphQL

| `SuiEvent` field | JSON-RPC source | GraphQL source | Notes |
|---|---|---|---|
| `id.tx_digest` | `id.txDigest` | `transaction.digest` | Identical |
| `id.event_seq` | `id.eventSeq` | `sequenceNumber` | Same semantics (position in tx) |
| `package_id` | `packageId` | `transactionModule.package.address` | Identical format |
| `transaction_module` | `transactionModule` | `transactionModule.name` | Identical |
| `sender` | `sender` | `sender.address` | Identical |
| `type_` | `type` | `contents.type.repr` | Full StructTag, identical |
| `parsed_json` | `parsedJson` | `contents.json` | JSON scalar, identical structure |
| `timestamp_ms` | `timestampMs` (epoch ms string) | `timestamp` (ISO 8601) | **Convert required** |
| `checkpoint` | `checkpoint` (string) | `transaction.effects.checkpoint.sequenceNumber` | Integer, trivial |

### Timestamp conversion

JSON-RPC: `"1715049788331"` (epoch milliseconds as string).
GraphQL: `"2026-05-07T00:44:30.989Z"` (ISO 8601 with milliseconds).

Conversion: `chrono::DateTime::parse_from_rfc3339(ts)` → `.timestamp_millis()` → `String`.
Or: change `SuiEvent.timestamp_ms` to `Option<chrono::DateTime<Utc>>` internally and
convert at the database write boundary. Either approach is straightforward.

---

## 4. Cursor Semantics Comparison

| Aspect | JSON-RPC | GraphQL |
|---|---|---|
| Cursor format | `EventID{txDigest, eventSeq}` | Opaque base64: `{"t":N,"e":N}` |
| Cursor meaning | Points to last consumed event | Points to last returned node |
| Ordering | Ascending by default (`false` param) | Ascending (first/after) |
| Resume | Pass last cursor as `cursor` param | Pass last `endCursor` as `after` |
| Checkpoint filter | Not supported | `afterCheckpoint`, `atCheckpoint`, `beforeCheckpoint` |

### Cursor internal format (decoded from live data)

```json
{"t": 3499131110, "e": 0}
```

`t` = transaction sequence number (global), `e` = event index within tx.
Functionally equivalent to `EventID{txDigest, eventSeq}` but uses a numeric
tx reference. **This is opaque and must not be constructed manually.**

---

## 5. Cursor Migration Strategy

### Recommended: afterCheckpoint bootstrap (Option B from deprecation spike)

1. On first GraphQL poll, read the last `checkpoint_seq` from `raw_events`:
   ```sql
   SELECT MAX(checkpoint_seq) FROM raw_events
   WHERE package_id = $1
   ```
2. Use `afterCheckpoint: <max_checkpoint>` in the first GraphQL query.
3. Events from the same checkpoint as the last JSON-RPC cursor may be
   re-delivered. The existing `raw_event_dedup` table (PK: tx_digest + event_seq)
   makes this idempotent — duplicates are rejected at insert.
4. After the first successful page, store the GraphQL `endCursor` in
   `indexer_state` under a new key format: `gql_cursor:<pkg>:<module>`.
5. Subsequent polls use the stored GraphQL cursor via `after:`.

**Risk:** Events at the boundary checkpoint may be replayed once. The dedup
table handles this. No data corruption possible.

**Alternative — full re-index (Option A):** Start from `afterCheckpoint: 0`
(or `start_checkpoint` from config). Safe but slow for large event histories.
Only needed if the `raw_events` table is empty or unreliable.

---

## 6. Semantic Gaps and Risks

### 6a. No gaps — all required fields are present

Every field consumed by `processor::process` and `raw::insert` has a direct
GraphQL equivalent. The checkpoint backfill call (`sui_getTransactionBlock`)
is eliminated entirely.

### 6b. Timestamp format change (low risk)

Requires a format conversion in the GraphQL adapter. No database schema change —
`raw_events.timestamp_ms` is `BIGINT` and receives the epoch millis value
regardless of source format.

### 6c. Rate limits (medium risk, must measure)

`graphql.testnet.sui.io` has per-IP and per-query complexity limits.
The indexer polls at ~500ms intervals with batch_size=100. This is well within
typical GraphQL rate limits, but must be confirmed under sustained load.

Mitigation: the indexer already has backoff (`poll_interval_ms`) and logs
failures without crashing. A 429 response maps to the existing error path.

### 6d. GraphQL cursor opacity (no risk)

Cursors are opaque strings. The indexer already stores cursor values as opaque
`TEXT` in `indexer_state`. Storing a base64 GraphQL cursor instead of a JSON
`EventID` requires no schema change.

### 6e. Module filter format (verified, no risk)

GraphQL `module` filter uses `"pkg::mod"` format. JSON-RPC `MoveModule` uses
`{"package": pkg, "module": mod}`. The adapter constructs the string from the
same two config values. Verified live.

### 6f. Type filter format (verified, no risk)

GraphQL `type` filter uses the full StructTag string (same as JSON-RPC
`MoveEventType`). The indexer already constructs these strings in
`ingester.rs` for world gate events. No change needed.

---

## 7. Implementation Plan

### Phase 1 — GraphQL event adapter (no behavior change)

**Files changed:** `rpc.rs` (new struct), `event_source.rs` (new impl),
`config.rs` (new field), `main.rs` (conditional construction).

1. Add `GraphqlEventClient` struct to `rpc.rs`:
   - `reqwest::Client` + GraphQL URL (from `config.toml` or env var)
   - `query_events_graphql()` — module filter, returns `EventPage`
   - `query_events_by_type_graphql()` — type filter, returns `EventPage`
   - Map GraphQL response → existing `SuiEvent` / `EventPage` types
   - Convert ISO timestamp → epoch ms string
   - Construct `EventId{tx_digest, event_seq}` from `transaction.digest` +
     `sequenceNumber` (for cursor storage compatibility)

2. Implement `SuiEventSource` for `GraphqlEventClient` in `event_source.rs`.

3. Add `event_source_mode` field to `[network]` config:
   ```toml
   [network]
   rpc_url = "https://fullnode.testnet.sui.io:443"
   graphql_url = "https://graphql.testnet.sui.io/graphql"
   event_source_mode = "jsonrpc"  # jsonrpc | graphql | shadow
   ```

4. In `main.rs`, construct event source based on config:
   ```rust
   let event_source: Box<dyn SuiEventSource> = match mode {
       "graphql" => Box::new(GraphqlEventClient::new(graphql_url)),
       _         => Box::new(RpcClient::new(rpc_url)),
   };
   ```

5. `ingester::run` signature already accepts `S: SuiEventSource` — no change.

### Phase 2 — Shadow mode (validation, no behavior change)

Run both JSON-RPC and GraphQL in parallel. Compare event sets per poll cycle.
Log mismatches. This validates:
- Event completeness (same events returned)
- Field parity (same parsed_json values)
- Ordering (same checkpoint sequence)

Shadow mode is the existing `event_source_mode = "shadow"` value. The shadow
adapter calls JSON-RPC as the live path, fires GraphQL in background, and
compares results.

### Phase 3 — Cutover

1. Set `event_source_mode = "graphql"` in production config.
2. On first poll, bootstrap cursor via `afterCheckpoint` from `raw_events`.
3. Monitor for missed events by comparing `raw_events` counts against
   JSON-RPC baseline.
4. After 48h with no mismatches, remove shadow monitoring.

### Phase 4 — Cleanup

1. Remove `RpcClient` JSON-RPC event methods (keep field helpers).
2. Remove `fill_missing_checkpoints` and `transaction_checkpoint`.
3. Remove `SuiJsonRpcClient` from `rpc.rs` if no other consumers.
4. Update `config.example.toml` — make `graphql_url` the primary config,
   `rpc_url` optional/deprecated.

---

## 8. Rollback Plan

| Scenario | Action |
|---|---|
| GraphQL returns different events | Set `event_source_mode = "jsonrpc"` — instant rollback |
| GraphQL rate-limited | Same — revert to JSON-RPC |
| Cursor corruption | Delete `gql_cursor:*` keys from `indexer_state`, restart with `afterCheckpoint` bootstrap |
| Full rollback | `event_source_mode = "jsonrpc"` — JSON-RPC cursors in `indexer_state` are untouched during GraphQL operation |

Rollback is a config change + restart. No database migration needed in either
direction.

---

## 9. No-Go Criteria

Do NOT proceed to Phase 3 cutover if any of these are true:

1. Shadow mode reveals missing events (GraphQL returns fewer events than JSON-RPC
   for the same checkpoint range)
2. `contents.json` structure differs from `parsedJson` for any FW event type
3. GraphQL endpoint returns 429 or 5xx under sustained polling at production rate
4. `afterCheckpoint` filter skips events within the boundary checkpoint (would
   cause permanent data loss)
5. Sui team announces GraphQL event endpoint deprecation or instability

---

## 10. Effort Estimate

| Phase | Effort | Risk |
|---|---|---|
| Phase 1 — GraphQL adapter | 4–6h | Low — mechanical mapping |
| Phase 2 — Shadow validation | 2–3h + 48h soak | Medium — may reveal edge cases |
| Phase 3 — Cutover | 30 min config change | Low — if shadow passes |
| Phase 4 — Cleanup | 1–2h | Low — dead code removal |

Total: ~2 working days of implementation + 2 days shadow soak.

---

## 11. Live Verification Evidence

All queries run against `https://graphql.testnet.sui.io/graphql` on 2026-05-19.

**Module filter:** `filter: { module: "0xb43f...::reputation_gate" }` →
returned GateConfigUpdated, PassageGranted, GatePolicyBoundToWorldGate events
in ascending checkpoint order.

**Type filter:** `filter: { type: "0xb43f...::reputation_gate::PassageGranted" }` →
returned only PassageGranted events, correct field values.

**afterCheckpoint:** `filter: { module: "...", afterCheckpoint: 337848469 }` →
returned only events from checkpoint > 337848469. Confirmed exclusive boundary.

**Cursor decode:** `eyJ0IjozNDk5MTMxMTEwLCJlIjowfQ==` → `{"t":3499131110,"e":0}`.
Opaque cursor with transaction sequence + event index. Must not be constructed
manually.

**Event.sequenceNumber:** Confirmed = "position of the event among events from
the same transaction" (i.e., `event_seq`).

---

## References

- `indexer/src/rpc.rs` — JSON-RPC client (303 lines)
- `indexer/src/event_source.rs` — SuiEventSource trait (44 lines)
- `indexer/src/ingester.rs` — indexer loop (417 lines)
- `indexer/src/processor/raw.rs` — raw_events insert, field consumption
- `indexer/src/config.rs` — NetworkConfig, EveConfig
- `Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md` — parent spike
- Sui GraphQL endpoint: `https://graphql.testnet.sui.io/graphql`
- Sui GraphQL docs: https://docs.sui.io/references/sui-graphql
