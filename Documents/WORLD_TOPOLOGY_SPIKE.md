# FrontierWarden World Topology Spike

**Date:** 2026-05-05
**Type:** Architecture spike — no implementation
**Constraint:** No schema or deployment changes until CCP guidance is confirmed
**Status:** Updated with live production findings (2026-05-05)

---

## ⚠️ Architecture Status — Topology Warnings Are Dormant

Implementation is complete but warnings are correctly suppressed. Live production state as of 2026-05-05:

```
world_gates indexed:            41
fw_extension_active = true:      0
fw_gate_policy_id populated:     0
world_gates.extension field:     null on all 41 gates
fw_extension_active in DB:       false on all rows
GatePolicy ↔ world Gate joins:  0 rows matched
```

**Reason:** FrontierWarden currently operates as a parallel trust/reputation policy system.
It is not yet installed as an authorized extension on any EVE Frontier world Gate.

Three separate layers exist with no proven edge between layers 1 and 2:

```
Layer 1 — World Gate
  EVE Frontier smart assembly gate object.
  Has: linked_gate_id, status, owner_cap_id, extension field.
  extension.package_id / module_name / struct_name: null on all live gates.

Layer 2 — FrontierWarden GatePolicy
  FW-owned policy object on Sui.
  Has: schema, threshold, toll, treasury, paused state.
  Does NOT store world_gate_id. No reference to world Gate object.

Layer 3 — Gate access evaluation
  Trust API evaluates GatePolicy + attestations/score_cache.
  World topology warnings (WARN_WORLD_GATE_OFFLINE, WARN_WORLD_GATE_NOT_LINKED)
  are implemented in trust_eval_gate.rs but dormant:
  world_gate_for_policy() returns None for all live gate IDs.
```

**Correct product description:**
> FrontierWarden currently operates as a Sui trust/reputation policy system with
> sponsored execution and live world-gate observability. It is not yet installed
> as an authorized extension on an EVE Frontier world Gate.

**Do not emit production topology warnings until the GatePolicy ↔ world Gate
association is proven via on-chain evidence (extension authorization event or
Move-level binding).**

---

## Live Extension-State Result

World gate extension indexing is implemented with exact TypeName matching.

Current live Stillness event counts:
- `gate::ExtensionAuthorizedEvent`: 0
- `gate::ExtensionRevokedEvent`: 0

This result is meaningful: no live indexed world gate currently proves an
authorized FrontierWarden extension.

Important invariant:

```text
Extension authorization proves:
world_gate_id -> extension TypeName

It does not prove:
world_gate_id -> FrontierWarden GatePolicy
```

Therefore:

- `world_gate_extensions` can track world Gate -> extension TypeName once
  events exist.
- `world_gates.fw_extension_active` may be set only from exact TypeName
  matches.
- `world_gates.fw_gate_policy_id` must remain unset until a separate binding
  exists.
- Trust API topology warnings must remain dormant unless a reliable GatePolicy
  -> world Gate association exists.

---

## Builder Call Findings - 2026-05-06

Confirmed:

- Gate dApps should maintain their own binding state for app policy.
- World `ExtensionAuthorizedEvent` is necessary but not sufficient as current
  policy binding proof.
- Events are historical/audit signals; objects/current state should remain the
  authoritative source for policy decisions.
- Recommended Stillness world-event start checkpoint: `308264360`.
- CCP is working on dApp discovery.

Indexer config implication:

- `EFREP_WORLD_START_CHECKPOINT=308264360`
- Use this value for world-event cold start/replay only, not `world_gates`
  object sync.
- Cold start: begin world-event indexing from `308264360`.
- Resume: continue from the last committed event cursor/checkpoint.
- Recovery: replay from `308264360`.
- World reset or major redeploy: update the checkpoint.

---

## Upstream Documentation Automation Watch

`evefrontier/world-contracts` commit `db577cf` added an automated draft-PR
documentation update flow for `evefrontier/builder-documentation`. This makes
the docs repository part of FrontierWarden's upstream monitoring surface, not a
replacement for source audits.

Watch both:

- `evefrontier/world-contracts` source commits and merged PRs.
- `evefrontier/builder-documentation` draft PRs generated from those changes.

High-signal mappings from `.github/docs-mapping.json`:

- `contracts/world/sources/assemblies/gate` -> `smart-assemblies/gate/README.md`
  and `smart-assemblies/gate/build.md`
- `contracts/world/sources/access` -> `smart-contracts/ownership-model.md` and
  `smart-contracts/move-patterns-in-frontier.md`

This does not change current FrontierWarden assumptions:

- `ExtensionAuthorizedEvent` proves `world_gate_id -> extension TypeName`, not
  `world_gate_id -> GatePolicy`.
- GatePolicy binding still requires FrontierWarden-owned binding state.
- Event filters still use the world type-origin package ID.
- Stillness world-event cold starts still use checkpoint `308264360`.

---

**References:**
- `evefrontier/world-contracts` — Move source audited; key confirmed findings below
- Ocky-Public/Frontier-Indexer (world contract reference indexer, Rust/TimescaleDB)
- EVE Frontier Builder Documentation — Smart Assemblies, Gate Build API
- EVE_NATIVE_BRIDGE_DISCOVERY.md — World API findings (gateLinks empty on Cycle 5)
- EVE_STILLNESS_IDENTITY_DISCOVERY.md — Character/tribe resolution confirmed working
- Current FW migrations 0001–0012, existing trust evaluator

**Confirmed Stillness package IDs (from `contracts/world/Published.toml`):**
```
original-id  (type origin, use for event filters):
  0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c

published-at (current v2, use for object calls):
  0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780
```
> ⚠️ These are different. The world contract has already been upgraded once (currently on v2).
> Event type strings must use `original-id`. New object/function calls must use `published-at`.

---

## 1. Relevant World Concepts

### Gates

A Smart Gate is a programmable Sui shared object (`gate.move`) that enables space travel between two linked locations. Key fields confirmed by Ocky's reference schema and world-contracts source audit:

```
id              — Sui object ID (VARCHAR 66)
item_id         — in-game numeric ID (u64 in Move; NOT a Sui address)
tenant          — "stillness" | "utopia"
type_id         — game type ID (BIGINT)
owner_cap_id    — OwnerCap<Gate> currently held by Character
location        — solar system TenantItemId reference (NOT cleartext XYZ — see Location note)
status          — "online" | "offline"
energy_source_id — NetworkNode providing energy
linked_id       — partner gate object ID (NULL until linked)
package_id      — extension package ID (FW's package when FW extension is authorized)
module_name     — extension module name
struct_name     — Auth witness struct name (e.g. "FrontierWardenAuth")
```

**Location note:** Gate locations reference a solar system ID (a `TenantItemId`). Precise XYZ coordinates are stored as a Poseidon2 hash in `location.move` and require a server-signed `LocationProofMessage` to reveal them. FW should only consume the solar system reference — do not attempt to derive or store XYZ coordinates from events.

**Critical distinction:** FrontierWarden's `GatePolicy` is FW's own on-chain object (not the world gate). The relationship is: one world `Gate` object → authorizes FW's `reputation_gate` module as its extension. The `gates.package_id` / `gates.module_name` / `gates.struct_name` fields in the reference schema identify which extension is active — this is how to detect which world gates have FW running on them.

**Default behavior:** Without any extension, any player can jump through a world gate freely. FW adds the reputation check as an extension layer.

**Topology source:** Gate topology must come from world contract events, not the World API REST endpoint. The `/v2/solarsystems/:id` `gateLinks` field is empty on Stillness (Cycle 5). Events to index:
- `GateCreatedEvent` — initial gate set population
- `GateLinkedEvent` — gate pair established ✅ confirmed in source
- `GateUnlinkedEvent` — gate pair dissolved ✅ confirmed in source
- `JumpEvent` — per-jump activity tracking ✅ confirmed in source

### Linked Gates

Two gates become a linked pair when:
1. Both are owned by the same Character
2. They are ≥ 20 km apart (server-signed distance proof in the linking tx)
3. A linking transaction is authorized

**Confirmed events (from `gate.move` source):**
- `GateLinkedEvent` — emitted when two gates are linked
- `GateUnlinkedEvent` — emitted when a gate pair is dissolved

Both events exist in the contract. The `linked_id` field on each gate also reflects the current link state via object-level queries.

**Implication for FW:** Gate topology (A linked to B) is available via both event stream and object-level indexing. For real-time updates, subscribe to `GateLinkedEvent` and `GateUnlinkedEvent`. For initial backfill, query gate objects via GraphQL.

### Gate Permits

A `JumpPermit` is an ephemeral Sui object consumed in the jump transaction. **Confirmed struct from `gate.move` source:**

```move
public struct JumpPermit has key {
    id:           UID,
    character_id: address,   // character authorized to jump
    route_hash:   vector<u8>, // BLAKE2b-256 of BCS-serialized gate IDs (direction-agnostic)
    expires_at:   u64,        // timestamp milliseconds
}
```

> The field is `route_hash`, not `link_hash`. Earlier documentation (Ocky's reference schema) used
> `link_hash`; the actual Move struct field is `route_hash`. This is now confirmed from source.

Key properties:
- **Direction-agnostic:** one permit covers both A→B and B→A for a given gate pair
- **Route-locked:** `route_hash` encodes the specific gate pair, not a generic pass
- **Single-use:** consumed in `jump_with_permit`; cannot be reused
- Issued by the extension via `gate::issue_jump_permit_with_id<Auth>` after the extension's own policy checks

The `tribe_permit.move` extension example confirms the issuance pattern: a typed witness (`XAuth`) authorizes the extension, and `issue_jump_permit_with_id<XAuth>` is called after the tribe-membership check (`character.tribe() == tribe_cfg.tribe`).

Permit issuance rate is a **trust signal**: a gate that is issuing many permits is actively used; a gate that has not issued permits recently may be inactive or abandoned.

### Assemblies

The world `assemblies` table (Ocky's reference) is the base type for all Smart Assemblies:

```
id              — Sui object ID
item_id         — in-game item ID (u64 in Move; store as BIGINT)
tenant          — environment
type_id         — assembly type (gate, storage unit, turret, etc.)
owner_cap_id    — OwnerCap currently held
location        — solar system reference (NOT cleartext XYZ — see Location note above)
status          — online | offline | anchored
energy_source_id — connected NetworkNode
name / description / url — operator-set metadata
```

Gates are a specialization of Assembly. Both `assemblies` and `gates` rows exist in the reference indexer for the same physical gate — `gates` adds the gate-specific fields (`linked_id`, extension config).

**Status matters for FW trust:** An offline gate (node fuel depleted) that FW is evaluating for gate_access should produce a warning in the proof bundle. This is currently invisible to FW.

### Character Identity

Confirmed from EVE_STILLNESS_IDENTITY_DISCOVERY.md, validated against Ocky's reference schema, and now confirmed against `character.move` source.

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

**Confirmed from JumpEvent struct:** The event carries both the Sui object ID (`character_id: ID`) and the in-game key (`character_key: TenantItemId`). FW can correlate jump events to identities using either the Sui address or the in-game `item_id` without an extra lookup.

**What this means for trust:**
- `tribe_id` is the canonical tribe membership signal. It lives on `Character`, not `PlayerProfile`.
- FW's `eve_identities` table already captures `tribe_id` after a GraphQL identity resolution.
- The `tribe_id` is an integer matching entries in the World API `/v2/tribes` and FW's `eve_tribes` table.
- **Gap:** FW does not currently use `tribe_id` in any trust evaluation. The Trust API evaluates `TRIBE_STANDING` from oracle-issued attestations, not from the on-chain Character object directly.

Ocky's reference schema for characters:
```
id            — character Sui object ID
item_id       — in-game character ID (u64 in Move)
tenant        — stillness | utopia
owner_cap_id  — OwnerCap<Character>
owner_address — wallet address (= character.character_address)
tribe_id      — in-game tribe numeric ID (u32 in Move → INTEGER in Postgres)
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

`tribe_id` is a `u32` in Move (confirmed from `character.move` source). It:
- Lives on the `Character` object (verified via GraphQL and `character.move` source)
- Is resolvable to a name via the World API `/v2/tribes` and FW's `eve_tribes` table
- Currently has 101 entries on Stillness (all appear to be NPC corps — no player-created tribes visible yet as of Cycle 5)
- Is available in FW's `eve_identities` table after identity resolution
- Is the value checked directly in the `tribe_permit.move` extension example: `character.tribe() == tribe_cfg.tribe`

**Type note:** `u32` in Move → store as `INTEGER` in Postgres (range 0–4,294,967,295 fits). Existing `eve_identities.tribe_id` is currently TEXT — acceptable for display, but new world topology tables should use `INTEGER` for numeric correctness.

**Trust signal potential:** Tribe affiliation is the primary social trust signal in EVE. A gate operator who is "TRIBE_STANDING:ally" for tribe X is asserting trust in tribe X members. FW currently validates this via oracle attestation (`TRIBE_STANDING` schema) but does not cross-reference the actual `tribe_id` on the Character object. Future improvement: verify that the subject's attested `TRIBE_STANDING` matches their actual on-chain `tribe_id` — catching stale attestations.

### Owner Caps

`OwnerCap<T>` is the borrow-use-return capability pattern for assembly modification. **Confirmed struct from `access_control.move` source:**

```move
public struct OwnerCap<phantom T> has key {
    id:                   UID,
    authorized_object_id: ID,   // the assembly/character this cap controls
}
```

The cap's owner is whoever holds it as a Sui object — ownership is implicit (key object), not a stored field. Additional confirmed properties from source:

- `OwnerCap<Character>` is **non-transferable to addresses** — `transfer_owner_cap_to_address` explicitly blocks it for the `Character` type
- `OwnerCap<Gate>` **can** be transferred between wallets (gate ownership is transferable)
- An authorized sponsor (via `AdminACL`) can create, delete, and transfer caps
- `ServerAddressRegistry` is a separate shared object managing which server addresses can sign location proofs — distinct from `AdminACL`

**Trust relevance:**
- The wallet address holding `OwnerCap<Gate>` definitively establishes gate operator identity. Determinable via object ownership queries.
- FW's current `VITE_GATE_ADMIN_OWNER` env var is a static config. World-sourced OwnerCap data would allow dynamic operator detection for any gate.
- OwnerCap transfer (the cap moving to a new wallet) is a trust event: when a gate changes hands, prior attestations about the previous operator become stale.

---

## 2. Minimal FrontierWarden Tables Needed

No changes to existing tables (0001–0012). All additions go in new migrations (0013+).

### Table A — `world_gates`

Shadow table for world contract gate objects, populated by object-level sync (GraphQL) and optionally by `GateCreatedEvent` (pending Q11).

```sql
CREATE TABLE world_gates (
    gate_id              VARCHAR(66)  PRIMARY KEY,
    item_id              BIGINT       NOT NULL,      -- u64 in Move (in-game item ID)
    tenant               TEXT         NOT NULL,      -- stillness | utopia
    owner_character_id   VARCHAR(66),               -- Character Sui object ID
    owner_address        VARCHAR(66),               -- wallet holding OwnerCap<Gate>
    solar_system_id      TEXT,                      -- TenantItemId ref (not XYZ coords)
    linked_gate_id       VARCHAR(66),               -- partner gate (NULL if unlinked)
    status               TEXT         NOT NULL DEFAULT 'unknown',
    fw_extension_active  BOOLEAN      NOT NULL DEFAULT FALSE,
    fw_gate_policy_id    VARCHAR(66),               -- FW GatePolicy object if FW extension confirmed
    checkpoint_updated   BIGINT       NOT NULL
);
```

> `item_id` is `u64` in Move — use `BIGINT` (not VARCHAR) for numeric operations.
> `solar_system_id` is a TenantItemId reference (solar system item_id + tenant); not cleartext XYZ
> coordinates. XYZ requires server-signed proofs and is not available from events.

`fw_extension_active` is set to TRUE when the world gate's extension tuple **fully matches** FrontierWarden:

| Field | Expected value |
|---|---|
| `package_id` | `EFREP_PACKAGE_ID` |
| `module_name` | `"reputation_gate"` |
| `struct_name` | FrontierWarden auth witness name |

Package-ID-only detection is acceptable as an early heuristic, but for any trust/proof surface the full tuple must match. A gate that shares `EFREP_PACKAGE_ID` but runs a different module or auth witness is not an FW gate.

`fw_gate_policy_id` is the FK link from world gates → FW gate policies, enabling queries like "all world gates running FW."

### Table B — `world_jump_events`

On-chain `JumpEvent` records from the world contract. These are the ground-truth jumps — distinct from FW's `PassageGranted` projections.

**Confirmed event struct (from `gate.move` source):**
```move
public struct JumpEvent has copy, drop {
    source_gate_id:       ID,
    source_gate_key:      TenantItemId,   // { item_id: u64, tenant: String }
    destination_gate_id:  ID,
    destination_gate_key: TenantItemId,
    character_id:         ID,             // Character Sui object ID
    character_key:        TenantItemId,   // { item_id: u64, tenant: String }
}
```

No timestamp field in the event — time is derived from checkpoint.

```sql
CREATE TABLE world_jump_events (
    tx_digest            VARCHAR(66)   NOT NULL,
    event_seq            BIGINT        NOT NULL,
    source_gate_id       VARCHAR(66)   NOT NULL,
    source_gate_item_id  BIGINT        NOT NULL,  -- source_gate_key.item_id
    source_gate_tenant   TEXT          NOT NULL,  -- source_gate_key.tenant
    dest_gate_id         VARCHAR(66)   NOT NULL,
    dest_gate_item_id    BIGINT        NOT NULL,
    dest_gate_tenant     TEXT          NOT NULL,
    character_id         VARCHAR(66)   NOT NULL,  -- Character Sui object ID
    character_item_id    BIGINT        NOT NULL,  -- character_key.item_id
    character_tenant     TEXT          NOT NULL,  -- character_key.tenant
    occurred_at          TIMESTAMPTZ   NOT NULL,  -- derived from checkpoint timestamp
    checkpoint_seq       BIGINT        NOT NULL,
    PRIMARY KEY (tx_digest, event_seq)
);
CREATE INDEX idx_world_jump_source    ON world_jump_events (source_gate_id, occurred_at);
CREATE INDEX idx_world_jump_character ON world_jump_events (character_id, occurred_at);
```

**Why TimescaleDB hypertable is NOT required here:** FW does not need millisecond time-series resolution. Standard Postgres is sufficient for the intended query patterns (30-day activity windows, per-gate frequency).

### Table C — `world_gate_links`

Materialized gate adjacency graph. Populated by `GateLinkedEvent` inserts and `GateUnlinkedEvent` deletes.

```sql
CREATE TABLE world_gate_links (
    gate_a_id             VARCHAR(66)  NOT NULL,
    gate_b_id             VARCHAR(66)  NOT NULL,
    tenant                TEXT         NOT NULL,
    linked_at_checkpoint  BIGINT,
    PRIMARY KEY (gate_a_id, gate_b_id)
);
CREATE INDEX idx_world_gate_links_b ON world_gate_links (gate_b_id);
```

When `GateLinkedEvent` fires: insert (A,B) and (B,A) for bidirectional lookup.
When `GateUnlinkedEvent` fires: delete both rows.

**Could also be a VIEW** over `world_gates` self-join on `linked_gate_id`. A materialized table is cheaper for join-heavy trust queries.

### Table D — `world_characters` (conditional)

Only add this if FW needs to drive trust from character data that `eve_identities` does not already cover.

**Current coverage via `eve_identities`:**
- `wallet` → `character_id` → `tribe_id`, `character_name`, `tenant`, `item_id` ✅

**Gap in `eve_identities`:** No `owner_cap_id` and no proactive coverage. Characters who have never used FW have no row.

```sql
-- Only needed for proactive gate-operator tracking
CREATE TABLE world_characters (
    character_id       VARCHAR(66)  PRIMARY KEY,
    item_id            BIGINT       NOT NULL,   -- u64 in Move
    tenant             TEXT         NOT NULL,
    owner_address      VARCHAR(66)  NOT NULL,   -- authoritative wallet address
    tribe_id           INTEGER,                 -- u32 in Move
    name               TEXT,
    checkpoint_updated BIGINT       NOT NULL
);
CREATE INDEX idx_world_characters_owner ON world_characters (owner_address);
CREATE INDEX idx_world_characters_tribe ON world_characters (tribe_id);
```

**Recommendation:** Defer `world_characters` until proactive character indexing is confirmed in scope. `eve_identities` covers reactive lookup (user-initiated). Only needed for batch queries over all gate operators.

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
| Gate operator identity | `world_gates.owner_address` | Verify operator wallet dynamically (replace static `VITE_GATE_ADMIN_OWNER`) |
| Subject tribe_id | `eve_identities.tribe_id` | Cross-reference attested `TRIBE_STANDING` against on-chain tribe membership |
| FW extension active | `world_gates.fw_extension_active` | Warn if the FW GatePolicy has no associated world gate |

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

| Event | Module | Status | Signal | FW Use |
|---|---|---|---|---|
| `JumpEvent` | `gate.move` | ✅ Confirmed | Character jumped through gate | Increment jump count; feed into `GATE_ACTIVITY` schema |
| `GateLinkedEvent` | `gate.move` | ✅ Confirmed | Gate A ↔ Gate B established | Update `world_gate_links`; topology change notification |
| `GateUnlinkedEvent` | `gate.move` | ✅ Confirmed | Gate pair dissolved | Remove from `world_gate_links` |
| `StatusChangedEvent` (OFFLINE) | `status.move` | ✅ Confirmed | Gate/assembly went offline | Add `WARN_GATE_OFFLINE`; invalidate cached gate-access results |
| `KillmailCreatedEvent` | `killmail.move` | ✅ Shape confirmed | Subject was killer or victim | `COMBAT_RECORD` schema (automation deferred — see Q9) |
| `CharacterCreatedEvent` | `character.move` | ✅ Confirmed | New character registered | Trigger automatic `eve_identity` resolution for that wallet |

**No dedicated gate offline event exists.** Gate offline state is signaled by `StatusChangedEvent { action: Action::OFFLINE }` from `status.move`. Status enum: NULL | OFFLINE | ONLINE. Action enum: ANCHORED | ONLINE | OFFLINE | UNANCHORED.

**Current automated path (already working):**
```
TRIBE_STANDING attestation issued → ScoreUpdated event → score_cache updated → trust_evaluator
```

**Target automated path for jump activity:**
```
JumpEvent (filter by original-id package prefix)
  → world_jump_events table
  → periodic oracle call
  → buildIssueAttestationTx(GATE_ACTIVITY, character_id, jump_count)
  → score_cache updated
  → trust_evaluator sees activity score
```

JumpEvent shape is now confirmed — this path is buildable. The remaining gate is Q8 (start checkpoint) before production deployment.

**Important caveat on kill events:** `KillmailCreatedEvent` shape is confirmed. However, kill attribution is complex (multiple participants, LossType enum: SHIP | STRUCTURE). Do not automate kill-based attestations until Q9 is resolved.

---

## 5. What NOT to Index Yet

| What | Why not |
|---|---|
| Full NetworkNode fuel/energy state | High churn; needed only for "is this gate powered" snapshot. A periodic object query is sufficient; no event stream needed. No `FuelDepletedEvent` confirmed in source. |
| Gate XYZ coordinates | Require server-signed Poseidon2 proof to reveal (`location.move`). Only solar system reference is available from events. Do not attempt to derive XYZ. |
| StorageUnit inventory | High volume, no trust signal. FW is not a trade tool. |
| Turret target priority lists | Ephemeral game state; no persistence needed. |
| All solar system objects (24,502) | `eve_solar_systems` sync already handles name resolution. Full object indexing is redundant. |
| Item bridging events (mint/burn) | No trust signal. |
| Extension freeze events | Edge-case governance mechanic. Not blocking for trust evaluation. |
| Full character history | Surveillance-adjacent. Collect jump events only — not all character actions. |
| `gateLinks` from World API REST | Empty on Cycle 5 Stillness. Use `GateLinkedEvent`/`GateUnlinkedEvent` instead. |
| Player-created tribe data | 101 NPC corps only on Stillness as of Cycle 5. Wait for player tribes (Q6). |
| World events from all historical checkpoints | Replay risk. Start from CCP-confirmed deployment checkpoint (Q8). |

---

## 6. Migration Risks

### Risk 1 — World package upgrades break event type filters ⚠️ ALREADY ACTIVE

The world contract on Stillness has **already been upgraded once**. Confirmed from `Published.toml`:

```
original-id  (type origin):  0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c
published-at (current v2):   0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780
```

An event filter using `published-at` will miss events emitted before the upgrade. An event filter using `original-id` will match events from all package versions.

**Correct filter pattern:**
```rust
// WRONG — breaks on next upgrade
"MoveEventType": "0xd2fd1224...::gate::JumpEvent"

// CORRECT — upgrade-safe
"MoveEventType": "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::gate::JumpEvent"
```

**Mitigation:**
- Event filters: use `original-id`
- Existing object type lookups: use `original-id` / type origin. Live Sui GraphQL returned Stillness gate objects for `0x28b497...::gate::Gate` and zero rows for `0xd2fd...::gate::Gate`.
- New function calls: use `published-at`
- Store both as separate config values: `WORLD_PKG_ORIGINAL_ID` and `WORLD_PKG_PUBLISHED_AT`
- On the next world upgrade, only `WORLD_PKG_PUBLISHED_AT` needs updating

> **Deployment note — keep this rule front-and-center:**  
> Any agent, developer, or runbook that wires up world-event ingestion must be told this rule explicitly.
> The failure mode is silent: using `published-at` in an event filter will ingest events from the current
> package version only, will not error, and will silently miss all events emitted before the last upgrade.
> This class of bug is easy to introduce and hard to detect in production.

### Risk 2 — `item_id` namespace collision between tenant environments

`item_id` is a `u64` in-game numeric ID that is NOT unique across tenants. The same `item_id` value in Stillness and Utopia are different entities.

**Mitigation:** All new tables include a `tenant` column. Queries joining `item_id` to `eve_identities` or `eve_solar_systems` must include a `tenant` WHERE clause. Primary keys are Sui object IDs (globally unique), not item_ids.

### Risk 3 — route_hash computation ✅ RESOLVED

The `JumpPermit` field is `route_hash` (confirmed from `gate.move` source). Hash function: BLAKE2b-256 of BCS-serialized gate IDs. Direction-agnostic (smaller gate ID is always `gate_a`). No reconstruction needed — `route_hash` is stored directly in the `JumpPermit` object and available from permit-issuance events.

**No blocker.** Index permits by storing `source_gate_id`, `dest_gate_id`, and `route_hash` from the permit object; no local hash computation required.

### Risk 4 — FW `PassageGranted` vs world `JumpEvent` divergence

These are two distinct events in two different Move modules:

- **FW `PassageGranted`** = reputation check passed, toll charged; emitted by FW's `reputation_gate` module
- **World `JumpEvent`** = actual jump completed; emitted by world's `gate.move`

A `PassageGranted` does not guarantee a `JumpEvent` (player might not jump after passing the check). A `JumpEvent` does not require FW's extension (ungated gates emit `JumpEvent` with no FW check).

**Mitigation:** Store both event streams separately. Never conflate them. FW passage counts are reputation-gated activity; world jump counts include all jumps including ungated ones.

### Risk 5 — GraphQL character resolution is on-demand, not event-driven

`eve_identities` is populated when a user hits `/eve/identity/{wallet}`. Characters who have never interacted with FW have no row. Gate operators and frequent travelers may be invisible.

**Mitigation:** Background queue: for any `character_id` seen in `world_jump_events` with no `eve_identities` row, enqueue a GraphQL identity resolution. Rate-limit the queue.

### Risk 6 — RLS policy must be extended for new tables

Migrations 0005–0008 established RLS and revoked public access on FW protocol tables. New tables must follow the same pattern.

**Mitigation:**
```sql
ALTER TABLE world_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON world_gates FROM anon, authenticated;
```

Apply this pattern to every new world topology table.

---

## 7. Questions for CCP

Questions Q1, Q3, Q4, and Q10 are now **answered from world-contracts source code**. 6 questions remain open.

---

**Q1 — JumpEvent struct shape ✅ CONFIRMED FROM SOURCE**

```move
public struct JumpEvent has copy, drop {
    source_gate_id:       ID,
    source_gate_key:      TenantItemId,
    destination_gate_id:  ID,
    destination_gate_key: TenantItemId,
    character_id:         ID,
    character_key:        TenantItemId,
}
```

`character_id` is the Character Sui object ID. No timestamp in the event; derive from checkpoint.

---

**Q2 — JumpEvent type string on Stillness ✅ DERIVABLE**

```
0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::gate::JumpEvent
```

This uses `original-id` (stable across upgrades). Confirm with CCP that this `original-id` will not change on the next upgrade (i.e., it is the permanent type origin for the gate module).

---

**Q3 — route_hash definition ✅ CONFIRMED FROM SOURCE**

BLAKE2b-256 of BCS-serialized gate IDs, direction-agnostic. The actual field name in the contract is `route_hash` (not `link_hash` as documented in some third-party schemas).

---

**Q4 — Gate linking events ✅ CONFIRMED FROM SOURCE**

Both `GateLinkedEvent` and `GateUnlinkedEvent` exist in `gate.move`. Pending: confirm exact struct field names for both events (see Q11 for `GateCreatedEvent` — same need applies here).

---

**Q5 — gateLinks REST population timeline** *(open — deprioritized)*

Per this audit, the correct topology source is `GateLinkedEvent`/`GateUnlinkedEvent` events, not REST. Useful to know if/when REST becomes reliable as a secondary source for admin tooling, but not blocking for FW implementation.

---

**Q6 — Player tribes on Stillness** *(open — blocking Step 5)*

When will player-created tribes be visible in `/v2/tribes` on Stillness? Currently 101 NPC corps only. Tribe-based trust signals are premature without real player tribe data.

---

**Q7 — World package upgrade cadence and advance notice** *(open)*

What advance notice will builders receive before the next world contract upgrade? How often should FW expect to update `WORLD_PKG_PUBLISHED_AT`? Is there a builder notification channel for upgrade announcements?

---

**Q8 — Recommended start checkpoint for Stillness world events** *(answered 2026-05-06)*

Use checkpoint `308264360` for Stillness world-event cold starts and replay.
Do not hardcode this in code; use `EFREP_WORLD_START_CHECKPOINT` / `[eve].world_start_checkpoint`.
Object sync does not use this value.

---

**Q9 — Kill event automation suitability** *(open)*

`KillmailCreatedEvent` shape is confirmed (includes `solar_system_id: TenantItemId`, `LossType` enum SHIP|STRUCTURE). Is `reporter_id` reliable for oracle attribution? What is the expected false-positive/manipulation rate? Are kill events emitted atomically with the kill transaction?

---

**Q10 — Gate offline signal ✅ CONFIRMED FROM SOURCE**

`StatusChangedEvent { action: Action::OFFLINE }` from `status.move`. No dedicated gate-offline event exists. Offline transitions are `StatusChangedEvent` with the `action` field set to `OFFLINE`. Status enum: NULL | OFFLINE | ONLINE. Action enum: ANCHORED | ONLINE | OFFLINE | UNANCHORED.

---

**Q11 — GateCreatedEvent and GateLinkedEvent/GateUnlinkedEvent struct shapes** *(open)*

What fields do these events carry? Specifically:
- `GateCreatedEvent`: does it include `owner_cap_id`, initial `item_id`, and `tenant`? (needed for event-driven gate population in Step 1)
- `GateLinkedEvent` / `GateUnlinkedEvent`: what are the exact field names for the two gate IDs? (needed for Step 2 processor)

---

## 8. Phase 1 Implementation Plan

Steps are sequenced so each is independently shippable and non-breaking. No step changes existing FW migrations or trust evaluation logic.

### Step 1 — World gate object indexer ✅ SHIPPED

**Dependency:** None (gate object structure confirmed from source)
**What:** Add a `sync_world_gates` background task (similar to `sync_eve_world` CLI) that:
- Queries `gate` objects from Sui GraphQL by type using the `original-id` / type-origin address for the object type string
- Upserts into `world_gates` table
- Sets `fw_extension_active = TRUE` only when the extension tuple fully matches FW: `package_id = EFREP_PACKAGE_ID` **and** `module_name = "reputation_gate"` **and** `struct_name` = expected auth witness. Do not rely on `package_id` alone — a gate could share the package but run a different extension module.
- Runs every N minutes (configurable); no event stream dependency

**Package abstraction:** Config holds both `WORLD_PKG_ORIGINAL_ID` and `WORLD_PKG_PUBLISHED_AT`. GraphQL object type queries and event filters use `original-id`; new Move function calls use `published-at`.

**Output:** `world_gates` table populated for all Stillness gates
**Risk:** Low. Read-only GraphQL queries. Additive migration.

---

### Step 2 — Gate link topology from events ⚠️ PARTIALLY UNBLOCKED

**Dependency:** Step 1 for initial backfill; `GateLinkedEvent`/`GateUnlinkedEvent` for live updates
**What:**
- Add `GateLinkedEvent` and `GateUnlinkedEvent` to the ingester event filter (using `original-id` prefix)
- Add a `processor/world_topology.rs` handler that upserts `world_gate_links` on link, deletes on unlink
- Initial backfill via `world_gates.linked_gate_id` (Step 1 data)

**Ready now:** table/view design, initial backfill strategy, event names, and package-ID strategy.

**Blocked before event-processor implementation:** exact field names of `GateLinkedEvent`/`GateUnlinkedEvent` (Q11). Do not implement the live link/unlink processor until Q11 is answered or source-inspected.

**Output:** Bidirectional gate adjacency queryable in O(1)
**Risk:** Low. Confirmed events exist; schema is simple.

---

### Step 3 — JumpEvent stream indexer ✅ UNBLOCKED (checkpoint known)

**Dependency:** `EFREP_WORLD_START_CHECKPOINT=308264360` for production cold start/replay
**What:** Add `gate::JumpEvent` to ingester with `original-id` package prefix. Add `processor/world_jump.rs` that writes to `world_jump_events`.

```rust
// Conceptual — not yet written
"JumpEvent" => world_jump_event(pool, ev).await,
```

Use `normalize_sui_address()` on `source_gate_id`, `dest_gate_id`, `character_id`.

**Event filter (upgrade-safe):**
```
package: "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c"
module:  "gate"
event:   "JumpEvent"
```

**Output:** `world_jump_events` populated in real time
**Risk:** Low-medium. Event shape confirmed; `original-id` filter is upgrade-safe. Use the configured start checkpoint to avoid unnecessary history replay.

---

### Step 4 — Trust API `gate_access` warning enrichment ✅ SHIPPED (dormant — see Architecture Status above)

**Dependency:** Steps 1+2 complete
**What:** In `trust_eval_gate.rs`, after fetching `latest_gate_policy`, query `world_gates` by `fw_gate_policy_id`:
- If `status = 'offline'`: add `"WARN_WORLD_GATE_OFFLINE"` to `proof.warnings`
- If `linked_gate_id IS NULL`: add `"WARN_WORLD_GATE_NOT_LINKED"` to `proof.warnings`

Additive to existing proof bundle. No change to `allow`/`decision` fields. No API version bump required.

**Output:** Gate Intel and Trust Console show topology-aware warnings
**Risk:** Low. Strictly additive.

---

### Step 5 — Tribe_id cross-reference in Trust API

**Dependency:** `eve_identities` coverage sufficient OR Step 3 running (for proactive character resolution)
**What:** In `trust_eval_gate.rs`, after score/attestation lookup, join `eve_identities` on subject wallet to get `tribe_id`:
- If score is high but `tribe_id` is NULL: add `"WARN_IDENTITY_UNRESOLVED"` to warnings
- If score is high and `tribe_id` resolves to a known NPC corp: add `"WARN_TRIBE_NPC_ONLY"`

**Blocked on Q6:** The NPC corps heuristic is meaningless without player tribe data on Stillness.

**Output:** Trust Console shows identity-context warnings
**Risk:** Low. Additive. No logic change.

---

### Step 6 — World character proactive resolution queue

**Dependency:** Step 3 (character IDs flowing from jump events)
**What:** After writing to `world_jump_events`, check if `character_id` has an `eve_identities` row. If not, enqueue a GraphQL identity resolution job. Rate-limit queue processing.

**Output:** `eve_identities` coverage expands to gate-active characters, not just FW users
**Risk:** Low-medium. Rate limiting required. GraphQL endpoint availability is not guaranteed.

---

## Summary

### Implemented (live)
- ✅ Step 1: `world_gates` object sync — `sync_world_gates` CLI, 41 rows on Stillness
- ✅ Step 4: `gate_access` warning enrichment — `WARN_WORLD_GATE_OFFLINE` + `WARN_WORLD_GATE_NOT_LINKED` wired into `trust_eval_gate.rs`

### Dormant (implemented, not yet active)
- `world_gate_for_policy()` returns None for all live gate policies — no `fw_gate_policy_id` populated
- `WARN_WORLD_GATE_OFFLINE` / `WARN_WORLD_GATE_NOT_LINKED` never fire in production
- **Reason:** `fw_extension_active = false` and `fw_gate_policy_id = null` on all 41 world gates

### Blocking gap — GatePolicy ↔ world Gate binding
Until a proven association exists, topology warnings must remain dormant. Three binding paths:

| Option | Mechanism | Safety | Requires |
|---|---|---|---|
| A — Move-level binding | `GatePolicy` stores `world_gate_id: ID` or emits `GatePolicyBoundToWorldGate` event | Highest | Move upgrade to FW package |
| B — Admin table | Operator manually binds `gate_policy_id ↔ world_gate_id` with tx_digest proof | Medium | New DB table + admin route |
| C — Extension event correlation | Index `ExtensionAuthorizedEvent`; if package/module/auth_witness match FW and owner matches policy owner, infer association | Lower — correlation only | `ExtensionAuthorizedEvent` investigation (next step) |

**Current recommended path:** Implement Move-level GatePolicy binding as the target architecture: `GatePolicy` stores the current `world_gate_id` binding, and binding/unbinding emits events for indexing, frontend, audit trail, and API proof bundles. Off-chain admin binding remains only a temporary non-authoritative bridge.

### Source-confirmed but gated
- Step 2 live link/unlink processor: event names confirmed; field shapes pending Q11
- Step 3 JumpEvent indexer: event shape confirmed; start checkpoint is `308264360`
- Step 5 tribe warnings: design clear; player tribe data pending Q6

### Remaining open CCP questions (5 of 11)
- Q5 — gateLinks REST timeline (deprioritized; events are the correct source)
- Q6 — Player tribes on Stillness *(blocking Step 5)*
- Q7 — World package upgrade cadence and advance notice
- Q9 — Kill event automation suitability
- Q11 — GateCreatedEvent / GateLinkedEvent / GateUnlinkedEvent field shapes *(blocking Step 2 fully)*

### Builders call question (priority)
> FrontierWarden currently works as a parallel trust policy, but the missing edge is installing
> a policy as a world Gate extension. Is the intended pattern that each dApp stores per-gate
> policy keyed by world `gate_id` — like CivilizationControl — rather than creating separate
> policy objects that later need mapping?

### Explicitly deferred
- `route_trust` action
- Full character history indexing
- StorageUnit / Turret / NetworkNode energy state tracking
- `world_characters` table (use `eve_identities` until proactive coverage is confirmed in scope)
- Gate XYZ coordinate indexing (requires server-signed location proofs; not available from events)
- Kill-event attestation automation (pending Q9)
