# FrontierWarden World Topology Spike

**Date:** 2026-05-05  
**Type:** Architecture spike — no implementation  
**Constraint:** No schema or deployment changes until CCP guidance is confirmed  
**References:**
- Ocky-Public/Frontier-Indexer (world contract reference indexer, Rust/TimescaleDB)
- EVE Frontier Builder Documentation — Smart Assemblies, Gate Build API
- EVE_NATIVE_BRIDGE_DISCOVERY.md — World API findings (gateLinks empty on Cycle 5)
- EVE_STILLNESS_IDENTITY_DISCOVERY.md — Character/tribe resolution confirmed working
- Current FW migrations 0001–0012, existing trust evaluator

---

## 1. Relevant World Concepts

### Gates

A Smart Gate is a programmable Sui shared object (`gate.move`) that enables space travel between two linked locations. Key fields confirmed by Ocky's reference schema:

```
id              — Sui object ID (VARCHAR 66)
item_id         — in-game numeric ID (not a Sui address)
tenant          — "stillness" | "utopia"
type_id         — game type ID (BIGINT)
owner_cap_id    — OwnerCap<Gate> currently held by Character
location        — solar system object ID
status          — "online" | "offline"
energy_source_id — NetworkNode providing energy
linked_id       — partner gate object ID (NULL until linked)
package_id      — extension package ID (FW's package when FW extension is authorized)
module_name     — extension module name
struct_name     — Auth witness struct name (e.g. "FrontierWardenAuth")
```

**Critical distinction:** FrontierWarden's `GatePolicy` is FW's own on-chain object (not the world gate). The relationship is: one world `Gate` object → authorizes FW's `reputation_gate` module as its extension. The `gates.package_id` / `gates.module_name` / `gates.struct_name` fields in the reference schema identify which extension is active — this is how to detect which world gates have FW running on them.

**Default behavior:** Without any extension, any player can jump through a world gate freely. FW adds the reputation check as an extension layer.

### Linked Gates

Two gates become a linked pair when:
1. Both are owned by the same Character
2. They are ≥ 20 km apart (server-signed distance proof in the linking tx)
3. A linking transaction is authorized

The `linked_id` field on each gate points to its partner. **On Cycle 5 testnet, the World API `/v2/solarsystems/:id` `gateLinks` field is empty** — gate adjacency is only available from the world contract objects themselves (via GraphQL or checkpoint indexing), not the REST World API.

**Implication for FW:** Gate topology (A linked to B) is visible via object-level indexing of world gate objects, not via the World API. Until CCP populates `gateLinks`, topology must come from the world contract events.

### Gate Permits

A `JumpPermit` is an ephemeral Sui object consumed in the jump transaction:

```
id           — Sui object ID
character_id — character authorized to jump
link_hash    — deterministic hash of (source_gate_id, dest_gate_id)
expires_at   — timestamp milliseconds
```

Key properties:
- **Direction-agnostic**: one permit covers both A→B and B→A for a given pair
- **Route-locked**: `link_hash` encodes the specific gate pair, not a generic pass
- **Single-use**: consumed in `jump_with_permit`; cannot be reused
- Issued by the extension logic (`gate::issue_jump_permit`) inside the gate's authorized extension

Permit issuance rate is a **trust signal**: a gate that is issuing many permits is actively used; a gate that has not issued permits recently may be inactive or abandoned.

### Assemblies

The world `assemblies` table (Ocky's reference) is the base type for all Smart Assemblies:

```
id              — Sui object ID
item_id         — in-game item ID (matches tenant namespace)
tenant          — environment
type_id         — assembly type (gate, storage unit, turret, etc.)
owner_cap_id    — OwnerCap currently held
location        — solar system reference
status          — online | offline | anchored
energy_source_id — connected NetworkNode
name / description / url — operator-set metadata
```

Gates are a specialization of Assembly. Both `assemblies` and `gates` rows exist in the reference indexer for the same physical gate — `gates` adds the gate-specific fields (`linked_id`, extension config).

**Status matters for FW trust:** An offline gate (node fuel depleted) that FW is trying to evaluate for gate_access should produce a warning in the proof bundle. This is currently invisible to FW.

### Character Identity

Confirmed from EVE_STILLNESS_IDENTITY_DISCOVERY.md and validated against Ocky's reference schema:

**Two-hop resolution** required:
1. Wallet address → query `PlayerProfile` objects owned by wallet (GraphQL)
2. PlayerProfile.`character_id` → fetch `Character` object (GraphQL)

**Character object shape** (verified on Stillness):
```json
{
  "id": "0x3518...ae9a",
  "key": { "item_id": "2112089652", "tenant": "stillness" },
  "tribe_id": 1000167,
  "character_address": "0xabff...430f",
  "metadata": { "assembly_id": "0x3518...ae9a", "name": "Kivik" },
  "owner_cap_id": "0x8479...067f"
}
```

**What this means for trust:**
- `tribe_id` is the canonical tribe membership signal. It is stored on the `Character` object, not `PlayerProfile`.
- FW's `eve_identities` table already captures `tribe_id` after a GraphQL identity resolution.
- The `tribe_id` is an integer matching entries in the World API `/v2/tribes` and FW's `eve_tribes` table.
- **Gap:** FW does not currently use `tribe_id` in any trust evaluation. The Trust API evaluates `TRIBE_STANDING` from oracle-issued attestations, not from the on-chain Character object directly.

Ocky's reference schema for characters:
```
id            — character Sui object ID
item_id       — in-game character ID
tenant        — stillness | utopia
owner_cap_id  — OwnerCap<Character>
owner_address — wallet address
tribe_id      — in-game tribe numeric ID
name          — character display name
```

### Tenant

`tenant` is the environment tag on every world object: `"stillness"` (live) or `"utopia"` (sandbox). It is embedded in:
- Character `key.tenant`
- Assembly `tenant` column
- Killmail `tenant` column

FW currently indexes Sui testnet events from both environments (same chain, different world package IDs). The `tenant` tag allows per-environment filtering without separate databases.

**FW relevance:** When FW evaluates a gate, it should confirm that the gate's `tenant` matches the Trust API request's intended environment. Cross-tenant evaluations would produce incorrect results.

### Tribe ID

`tribe_id` is a numeric in-game identifier. It:
- Lives on the `Character` object (verified via GraphQL)
- Is resolvable to a name via the World API `/v2/tribes` and FW's `eve_tribes` table
- Currently has 101 entries on Stillness (all appear to be NPC corps — no player-created tribes visible yet as of Cycle 5)
- Is available in FW's `eve_identities` table after identity resolution

**Trust signal potential:** Tribe affiliation is the primary social trust signal in EVE. A gate operator who is "TRIBE_STANDING:ally" for tribe X is asserting trust in tribe X members. FW currently validates this via oracle attestation (`TRIBE_STANDING` schema) but does not cross-reference the actual `tribe_id` on the Character object. A future improvement: verify that the subject's attested `TRIBE_STANDING` matches their actual on-chain `tribe_id` — catching stale attestations.

### Owner Caps

`OwnerCap<T>` is the borrow-use-return capability pattern for assembly modification. Key properties:

```
id           — cap object ID
object_id    — the assembly/character this cap controls
owner_address — wallet that holds this cap (= character_address)
package_id   — world package
module_name  — "gate" | "character" | "storage_unit" etc.
struct_name  — "OwnerCap" (always)
```

**Trust relevance:**
- The `owner_address` on an `OwnerCap<Gate>` definitively establishes which wallet controls a gate — this is the authoritative gate operator identity.
- FW's current `VITE_GATE_ADMIN_OWNER` env var is a static config. World-sourced owner cap data would allow dynamic operator detection for any gate.
- Owner cap transfer (changing `owner_address`) is a trust event: when a gate changes hands, prior attestations about that gate's operator may be stale.

---

## 2. Minimal FrontierWarden Tables Needed

No changes to existing tables (0001–0012). All additions go in new migrations (0013+), applied after CCP guidance confirms event shapes.

### Table A — `world_gates`

Shadow table for world contract gate objects, populated by checkpoint indexing.

```sql
CREATE TABLE world_gates (
    gate_id              VARCHAR(66)  PRIMARY KEY,
    item_id              VARCHAR(20)  NOT NULL,      -- in-game item ID
    tenant               TEXT         NOT NULL,      -- stillness | utopia
    owner_character_id   VARCHAR(66),               -- Character object ID
    owner_address        VARCHAR(66),               -- wallet controlling OwnerCap<Gate>
    solar_system_id      TEXT,                      -- location reference
    linked_gate_id       VARCHAR(66),               -- partner gate (NULL if unlinked)
    status               TEXT         NOT NULL DEFAULT 'unknown',
    fw_extension_active  BOOLEAN      NOT NULL DEFAULT FALSE,
    fw_gate_policy_id    VARCHAR(66),               -- FW GatePolicy object if FW extension confirmed
    checkpoint_updated   BIGINT       NOT NULL
);
```

**Why minimal:** Only fields needed for trust queries. Does not duplicate fuel/energy tracking (those belong in the full world indexer if ever needed).

`fw_extension_active` is set to TRUE when the gate's `package_id` matches `VITE_PKG_ID` — the signal that FW is the authorized extension.

`fw_gate_policy_id` is the FK link from world gates → FW gate policies, enabling queries like "all world gates running FW."

### Table B — `world_jump_events`

On-chain `JumpEvent` records from the world contract. These are the ground truth jumps — distinct from FW's `PassageGranted` projections.

```sql
CREATE TABLE world_jump_events (
    tx_digest          VARCHAR(66)   NOT NULL,
    event_seq          BIGINT        NOT NULL,
    source_gate_id     VARCHAR(66)   NOT NULL,
    dest_gate_id       VARCHAR(66)   NOT NULL,
    character_id       VARCHAR(66)   NOT NULL,  -- Character object ID
    character_address  VARCHAR(66),             -- wallet address (denormalized if available)
    tenant             TEXT,
    occurred_at        TIMESTAMPTZ   NOT NULL,  -- from checkpoint timestamp
    checkpoint_seq     BIGINT        NOT NULL,
    PRIMARY KEY (tx_digest, event_seq)
);
CREATE INDEX idx_world_jump_source ON world_jump_events (source_gate_id, occurred_at);
CREATE INDEX idx_world_jump_character ON world_jump_events (character_id, occurred_at);
```

**Why TimescaleDB hypertable is NOT required here:** FW does not need millisecond time-series resolution. Standard partitioning by `occurred_at` in Supabase Postgres is sufficient for the intended query patterns (30-day activity windows, per-gate frequency).

### Table C — `world_gate_links`

Materialized gate adjacency graph. Updated whenever a gate's `linked_id` changes.

```sql
CREATE TABLE world_gate_links (
    gate_a_id    VARCHAR(66)  NOT NULL,
    gate_b_id    VARCHAR(66)  NOT NULL,
    tenant       TEXT         NOT NULL,
    linked_at_checkpoint  BIGINT,
    PRIMARY KEY (gate_a_id, gate_b_id)
);
CREATE INDEX idx_world_gate_links_b ON world_gate_links (gate_b_id);
```

This is intentionally flat — a lookup table derived from `world_gates.linked_gate_id`. When gate A has `linked_gate_id = B`, one row is inserted for (A,B) and one for (B,A) for bidirectional lookup.

**Could also be a VIEW** over `world_gates` self-join. A materialized view is cheaper for join-heavy trust queries.

### Table D — `world_characters` (conditional)

Only add this if FW needs to drive trust from character data that `eve_identities` does not already cover. 

**Current coverage via `eve_identities`:**
- `wallet` → `character_id` → `tribe_id`, `character_name`, `tenant`, `item_id` ✅

**Gap in `eve_identities`:** No `owner_cap_id` and no `owner_address` cross-reference. `eve_identities` is populated on-demand (when a user connects their wallet), not by event indexing. Characters who have never used FW are invisible.

```sql
-- Only needed for proactive gate-operator tracking
CREATE TABLE world_characters (
    character_id    VARCHAR(66)  PRIMARY KEY,
    item_id         VARCHAR(20)  NOT NULL,
    tenant          TEXT         NOT NULL,
    owner_address   VARCHAR(66)  NOT NULL,  -- authoritative wallet address
    tribe_id        TEXT,
    name            TEXT,
    checkpoint_updated BIGINT NOT NULL
);
CREATE INDEX idx_world_characters_owner ON world_characters (owner_address);
CREATE INDEX idx_world_characters_tribe ON world_characters (tribe_id);
```

**Recommendation:** Defer `world_characters` until character-level proactive indexing is confirmed in scope. `eve_identities` covers reactive lookup (user-initiated). Only needed for batch queries over all gate operators.

---

## 3. Trust API Actions That Would Use Them

### `gate_access` (current action, enhanced)

Current path:
```
gate_policy → attestations/score_cache → ALLOW_FREE | ALLOW_TAXED | DENY
```

With world topology additions:

| New signal | Table | Use |
|---|---|---|
| Gate online status | `world_gates.status` | Add `WARN_GATE_OFFLINE` to proof bundle when gate is not online |
| Destination linked | `world_gate_links` | Add `WARN_GATE_NOT_LINKED` if `linked_gate_id IS NULL` |
| Gate operator identity | `world_gates.owner_address` | Verify operator wallet matches `VITE_GATE_ADMIN_OWNER` dynamically |
| Subject tribe_id | `eve_identities.tribe_id` | Cross-reference attested `TRIBE_STANDING` against on-chain tribe membership |
| FW extension active | `world_gates.fw_extension_active` | Warn if the FW GatePolicy has no associated world gate (FW gate not deployed on a real world gate) |

None of these require changing the `gate_access` decision logic. They produce additional **warnings** in `proof.warnings`, leaving ALLOW/DENY intact. This is strictly additive.

### `counterparty_risk` (current action, enhanced)

With tribe_id from `eve_identities`:

| New signal | Use |
|---|---|
| Subject `tribe_id` vs gate operator `tribe_id` | If counterparty is in the same tribe as the gate operator and has no `TRIBE_STANDING` attestation, return `WARN_TRIBE_MATCH_NO_ATTESTATION` |
| Jump frequency for subject | If subject has jumped through this gate ≥N times in 30 days (`world_jump_events`), add `evidence.jump_activity` to proof bundle |

### `bounty_trust` (current action, enhanced)

Jump history gives a meaningful proxy for active presence in contested space:
- A character with zero jumps through hostile gate routes has lower observed risk profile
- High jump frequency through competitor tribe gates suggests adversarial access pattern

### Potential new action: `route_trust` (deferred)

Not in Phase 1 scope, but topology tables would enable it:

Given a sequence of gate IDs (a planned route), return per-hop threat profiles based on gate policy, passage history, and killmail density near each gate's solar system. Requires `world_gate_links` + killmail proximity queries + per-hop `gate_access` evaluation. Complex enough to be its own phase.

---

## 4. Events That Could Become Oracle Attestation Sources

These are world contract events that FW could use as automated oracle triggers — bridging EVE gameplay events into FW attestation issuance without manual oracle calls.

| Event | Module | Signal | FW Attestation |
|---|---|---|---|
| `JumpEvent` (world gate) | `gate.move` | Subject jumped through gate | Increment jump count; feed into `GATE_ACTIVITY` schema (new schema needed) |
| `KillEvent` / killmail | `turret.move` or kill system | Subject was a killer or victim | `COMBAT_RECORD` schema — automated kill attestation |
| `CharacterCreated` | `character.move` | New character registered | Trigger automatic `eve_identity` resolution for that wallet |
| Gate linked event (TBC with CCP) | `gate.move` | Gate A ↔ Gate B established | Update `world_gate_links`; emit topology change notification |
| Gate offline (via node depletion) | `network_node.move` | Gate went offline | Add `WARN_GATE_OFFLINE` flag; invalidate cached gate-access results for that gate |

**Current automated path (already working):**
```
TRIBE_STANDING attestation issued → ScoreUpdated event → score_cache updated → trust_evaluator
```

**Target automated path for jump activity:**
```
JumpEvent (world contract) → world_jump_events table → periodic oracle call
  → buildIssueAttestationTx(GATE_ACTIVITY, character, jump_count) → score_cache
  → trust_evaluator sees activity score
```

This closes the currently manual oracle issuance step. The bottleneck is confirming the exact `JumpEvent` struct shape with CCP (question Q2 below).

**Important caveat on kill events:** Kill attribution in EVE Frontier is complex (multiple participants, loss types). Do not attempt to automate kill-based attestations until CCP confirms the `KillEvent` struct shape and whether reporter_id is reliable for oracle purposes.

---

## 5. What NOT to Index Yet

These would be high-volume or architecturally premature:

| What | Why not |
|---|---|
| Full NetworkNode fuel/energy state | High churn; needed only for "is this gate powered" snapshot, not history. A periodic object query is sufficient; no event stream needed. |
| StorageUnit inventory | High volume, no trust signal. FW is not a trade tool. |
| Turret target priority lists | Ephemeral game state; no persistence needed. |
| All solar system objects (24,502) | World API sync of `eve_solar_systems` already handles name resolution. Full object indexing is redundant. |
| Item bridging events (mint/burn) | No trust signal. Item quantity has no bearing on FW protocol decisions. |
| Extension freeze events | Edge-case governance mechanic. Not blocking for trust evaluation. |
| Full character history (all moves, all actions) | Surveillance-adjacent. FW should index character identity for trust, not monitor character activity. Collect jump events, not all character events. |
| `gateLinks` from World API | Field exists but is empty on Cycle 5. Wait for CCP to populate before relying on it. |
| Player-created tribe data | World API shows 101 NPC tribes on Stillness; no player-created tribes visible yet. Wait for player tribes before building tribe-based trust signals. |
| World package events from all historical checkpoints | Replay risk. Start from a known good checkpoint. |

---

## 6. Migration Risks

### Risk 1 — World package upgrades break event type filters

The world contract upgrades create a new package object at a new address (as documented in "World Upgrades" in builder docs). The indexer's event filter is:

```rust
"MoveEventType": "0x28b497...48c::gate::JumpEvent"
```

After an upgrade, `JumpEvent` emitted by the new package will have a different prefix. FW's current ingester pattern (single `EFREP_PACKAGE_ID`) does not handle multiple world package versions.

**Mitigation:** Index by original-id (the first package in the upgrade family) using the `original_id` / `type_origin` pattern. Sui's `suix_queryEvents` supports filtering by `MoveEventModule` instead of full type string. Track the original package ID from `Published.toml`. FW already has this pattern for its own protocol (`original package / type origin` in TESTNET_NOTES.md).

### Risk 2 — `item_id` namespace collision between tenant environments

`item_id` is an in-game numeric ID that is NOT unique across tenants. Character `item_id = 2112089652` on Stillness is a different entity than `item_id = 2112089652` on Utopia.

**Mitigation:** All new tables must include a `tenant` column. Queries that join `item_id` to `eve_identities` or `eve_solar_systems` must include a `tenant` WHERE clause. Primary keys should be Sui object IDs (globally unique), not item_ids.

### Risk 3 — `link_hash` computation not documented

Gate permits use `link_hash` (a hash of the gate pair), not the two gate IDs directly. The hash function is not documented in the builder docs. Reconstructing this from the permit object to identify which gate route was permitted requires CCP clarification (Question Q3 below).

**Mitigation:** Index gate permits by storing both `source_gate_id` and `dest_gate_id` alongside `link_hash`. Derive `link_hash` from the permit object on-chain, not from a local hash computation.

### Risk 4 — FW's `gate_passages` vs world `JumpEvent` divergence

FW emits its own `PassageGranted`/`PassageDenied` events from its `check_passage` Move function. The world gate emits a separate `JumpEvent` when `jump_with_permit` succeeds. These are two different events in two different Move modules:

- FW `PassageGranted` = reputation check passed, toll charged → occurs in FW's extension logic
- World `JumpEvent` = actual jump completed → occurs in world's `gate.move`

A `PassageGranted` does not guarantee a `JumpEvent` (player might not jump after passing the check). A `JumpEvent` does not require FW's extension (ungated gates emit `JumpEvent` with no FW check).

**Mitigation:** Store both event streams separately. Do not conflate FW passage events with world jump events. FW passage counts are reputation-gated activity; world jump counts include all activity including ungated jumps.

### Risk 5 — GraphQL-based character resolution is on-demand, not event-driven

FW's `eve_identities` table is populated when a user hits `/eve/identity/{wallet}`. There is no event that triggers resolution for a character who has never interacted with FW. Gate operators and frequently-passing travelers may not have `eve_identities` rows.

**Mitigation:** Add a background task that, for any `character_id` seen in `world_jump_events` that lacks an `eve_identities` row, queues a GraphQL identity resolution. Rate-limit this queue to avoid hammering the GraphQL endpoint.

### Risk 6 — RLS policy must be extended for new tables

Migrations 0005–0008 established RLS and revoked public access on FW protocol tables. New world topology tables must follow the same pattern: RLS enabled, public access revoked, `service_role` access preserved for the Rust API.

**Mitigation:** Template for new migrations:
```sql
ALTER TABLE world_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON world_gates FROM anon, authenticated;
```

---

## 7. Questions for CCP

Before writing migration 0013 or any world-event indexing code, the following must be confirmed:

**Q1 — JumpEvent struct shape**
What is the exact Move struct definition for `JumpEvent` in `gate.move`? Specifically:
- Does it include `source_gate_id`, `dest_gate_id`, and `character_id`?
- Is `character_id` the Character Sui object ID or the in-game item_id?
- Does it include a `timestamp_ms` or does FW derive time from checkpoint?

**Q2 — JumpEvent type string on Stillness**
What is the full event type string for Stillness?  
Expected: `0x28b497...48c::gate::JumpEvent`  
Need confirmation that this is in the current package (not an older version).

**Q3 — link_hash definition**
What is the hash function used to produce `link_hash` in `JumpPermit`? Is it documented and stable across world contract upgrades? Is the order of gate IDs deterministic (lexicographic, insertion order, or something else)?

**Q4 — Gate linking events**
Is there an on-chain event emitted when two gates are linked or unlinked (e.g. `GateLinked`, `GateUnlinked`)? Or is the link state only observable via the `linked_id` field on the gate object?  
If event-based: what is the event name and struct shape?

**Q5 — gateLinks population timeline**
When will the `/v2/solarsystems/:id` `gateLinks` field be populated on Stillness? Is this a Cycle 6 feature? Gate topology via World API REST would simplify FW's topology indexing vs. full object-level checkpoint scanning.

**Q6 — Player tribes on Stillness**
When will player-created tribes be visible in the `/v2/tribes` endpoint on Stillness? Currently only 101 entries visible (all appear to be NPC corps). Tribe-based trust signals are blocked without real player tribe data.

**Q7 — World package upgrade cadence**
What is the expected world contract upgrade frequency during Cycle 5? How much advance notice will builders get before a world contract upgrade changes the world package ID on Stillness?

**Q8 — Recommended start checkpoint**
What Sui testnet checkpoint should FW use as the start point for indexing Stillness world events (to avoid replaying all history)? Is there a known "deployment checkpoint" for the current world package?

**Q9 — Kill event structure**
What is the struct shape of the kill event emitted by the world contract? Does it include the solar system ID? Can `reporter_id` be used reliably as the kill oracle source?

**Q10 — Gate offline events**
When a NetworkNode runs out of fuel and its connected gates go offline, is an on-chain event emitted (e.g. `AssemblyOffline` or `GateOffline`)? Or does offline state only manifest as an object state change (no event)?

---

## 8. Phase 1 Implementation Plan (Post-CCP Guidance)

These steps are sequenced so that each one is independently shippable and non-breaking. No step requires changing existing FW migrations or trust evaluation logic.

### Step 1 — World gate object indexer (no event stream)
**Dependency:** CCP confirms `tenant` value and gate object structure  
**What:** Add a `sync_world_gates` background task (similar to `sync_eve_world` CLI) that:
- Queries `gate` objects from Sui GraphQL by type (`0x28b...::gate::Gate`)
- Upserts into `world_gates` table
- Sets `fw_extension_active = TRUE` when `package_id` matches `EFREP_PACKAGE_ID`
- Runs every N minutes (configurable); does not consume event stream

**Output:** `world_gates` table populated for all Stillness gates  
**Risk:** Low. Read-only GraphQL queries. Additive migration.

### Step 2 — Gate link topology materialized view
**Dependency:** Step 1, `world_gates.linked_gate_id` populated  
**What:** Add `world_gate_links` as a materialized view (or periodic upsert) over `world_gates`:
```sql
-- Draft only — exact syntax pending Step 1 data shape
SELECT gate_id AS gate_a_id, linked_gate_id AS gate_b_id, tenant
FROM world_gates WHERE linked_gate_id IS NOT NULL;
```
Refresh whenever `world_gates` is updated.

**Output:** Bidirectional gate adjacency queryable in O(1)  
**Risk:** Low. No new event stream. Derived from Step 1 data.

### Step 3 — JumpEvent stream indexer
**Dependency:** Q1 + Q2 answered (struct shape + type string confirmed)  
**What:** Add `gate::JumpEvent` to the existing `ingester.rs` event filter. Add a `processor/world_gate.rs` handler that writes to `world_jump_events`.

```rust
// Conceptual — not yet written
"JumpEvent" => world_jump_event(pool, ev).await,
```

Normalize `character_id` to Sui address format (same pattern as existing processors).

**Output:** `world_jump_events` populated in real time  
**Risk:** Medium. Introduces dependency on world package ID. Package upgrade = type string change. Requires multi-package-ID ingester pattern (not yet implemented).

### Step 4 — Trust API gate_access warning enrichment
**Dependency:** Steps 1+2 complete  
**What:** In `trust_eval_gate.rs`, after fetching `latest_gate_policy`, make a secondary query to `world_gates` by `fw_gate_policy_id`:
- If `status = 'offline'`: add `"WARN_WORLD_GATE_OFFLINE"` to `proof.warnings`
- If `linked_gate_id IS NULL`: add `"WARN_WORLD_GATE_NOT_LINKED"` to `proof.warnings`

These are additive to existing proof bundle. No change to `allow`/`decision` fields. No API version bump required.

**Output:** Gate Intel and Trust Console show topology-aware warnings  
**Risk:** Low. Additive only. Gate access decision unchanged.

### Step 5 — Tribe_id cross-reference in Trust API
**Dependency:** Step 3 (character_id in jump events) OR `eve_identities` coverage sufficient  
**What:** In `trust_eval_gate.rs`, after score/attestation lookup, join `eve_identities` on subject wallet to get `tribe_id`. Compare against attestation `schema_id` semantics.

If subject has `eve_identities.tribe_id` set and `score_cache.schema_id = 'TRIBE_STANDING'`:
- If score is high but `tribe_id` is NULL (character not resolved): add `"WARN_IDENTITY_UNRESOLVED"` to warnings
- If score is high and `tribe_id` resolves to a known NPC corp: add `"WARN_TRIBE_NPC_ONLY"` (NPC corps do not grant real social trust)

**Output:** Trust Console shows identity-context warnings  
**Risk:** Low. Additive. No logic change.

### Step 6 — World character proactive resolution queue
**Dependency:** Step 3 (character IDs flowing from jump events)  
**What:** After writing to `world_jump_events`, check if `character_address` (if available in JumpEvent) has an `eve_identities` row. If not, enqueue a GraphQL identity resolution job. Process queue at rate-limited intervals.

**Output:** `eve_identities` coverage expands to gate-active characters, not just FW users  
**Risk:** Low-medium. Rate limiting required. GraphQL endpoint availability is not guaranteed.

---

## Summary

**What we can build now (no CCP needed):**
- Tables A, B, C schema design (this document)
- Step 1: World gate object sync via GraphQL (read-only, same pattern as `sync_eve_world`)
- Step 2: Gate link topology view (derived from Step 1)
- Step 4: `gate_access` warning enrichment (once Steps 1+2 data exists)

**What requires CCP guidance first (Q1–Q10):**
- Step 3: JumpEvent indexing (needs confirmed event shape + type string)
- Step 5: Full tribe-based trust signals (needs player tribes on Stillness)
- Any kill-event attestation automation (needs KillEvent shape)

**What is explicitly deferred:**
- `route_trust` action
- Full character history indexing
- StorageUnit / Turret / NetworkNode energy state tracking
- `world_characters` table (use `eve_identities` until proactive coverage is needed)
- `gateLinks` via World API REST (field is empty on Cycle 5)
