# Native Killmail Ingestion — Spike

**Branch:** `codex/native-killmail-ingestion-spike`
**Date:** 2026-05-17
**Verification branch:** `codex/verify-stillness-killmail-source`
**Status:** Source verified — implementation can proceed

---

## 1. Problem Statement

The FrontierWarden killboard currently reads `SHIP_KILL` attestations issued by the FW oracle.
That schema is structurally insufficient for a usable killboard:

| Field needed | Available in SHIP_KILL | Notes |
|---|---|---|
| Victim name | No | `subject` = ship object ID, not wallet |
| Killer name | No | Not stored |
| Solar system | No | Not stored |
| Ship type | No | Not stored |
| Kill timestamp | Partial | `issued_at` is attestation time, not kill time |
| Attacker count | No | Hardcoded 1 |
| LUX value | Yes | `value` field |

Other EVE Frontier killboards (EF-Map, Alpha-Strike) display full names, ship types, and
systems because they consume **native game kill mail events** — not oracle attestations.

SHIP_KILL attestations remain valuable as a trust signal: an oracle confirmed this kill
happened and staked its reputation on it. They are not useful as the primary killboard
data source.

---

## 2. Native Kill Mail Sources — VERIFIED 2026-05-17

### 2.1 Confirmed Primary: Alpha-Strike Community API

**Live, tested, returns full enriched kill data.**

**Endpoint:** `https://api.alpha-strike.space/incident`
**Method:** GET
**Auth:** None

**Verified request:**
```
GET https://api.alpha-strike.space/incident?limit=200&offset=0
```

**Verified response shape (redacted sample):**
```json
[
  {
    "id": 10771,
    "victim_tribe_name": "Clonebank 86",
    "victim_address": "7af35000ef652732050803ec98939f28352aade9",
    "victim_name": "LexCord",
    "loss_type": "ship/structure",
    "killer_tribe_name": "Reapers",
    "killer_address": "0852def1617e7454961f957c1f1a2ca1004badc4",
    "killer_name": "emp77",
    "time_stamp": 1773218188,
    "solar_system_id": 30014632,
    "solar_system_name": "IVT-KDB"
  }
]
```

**Confirmed field types:**
| Field | Type | Notes |
|---|---|---|
| `id` | integer | Sequential, monotonically increasing — use as cursor |
| `victim_name` | string | EVE character name — always present in tested sample |
| `victim_address` | string | 20-byte hex, **no 0x prefix** |
| `victim_tribe_name` | string | Corp/tribe name — always present |
| `killer_name` | string | EVE character name |
| `killer_address` | string | 20-byte hex, no 0x prefix |
| `killer_tribe_name` | string | Corp/tribe name |
| `loss_type` | string | `"ship/structure"` in all 200 tested rows (confirmed string enum, not integer) |
| `solar_system_id` | integer | Matches world API system IDs (verified: 30014632 = "IVT-KDB") |
| `solar_system_name` | string | Pre-resolved system name |
| `time_stamp` | integer | **Unix epoch seconds** (not LDAP — confirmed by cross-check with known dates) |

**Pagination — offset + limit (verified working):**
```
GET /incident?limit=200&offset=0      → newest 200 kills
GET /incident?limit=200&offset=200    → next 200 (older)
GET /incident?limit=200&offset=N      → {"error":"Bad Request! No incident records found"} at end
```
- Results are newest-first (descending `id`)
- `victim=`, `killer=`, `before=`, `after=` filter params are **unreliable** — do not use
- `system=<name>` filter appears to work but is not verified for all edge cases
- Total corpus: ~4,860 kills as of 2026-05-17 (IDs 1–10771 with gaps; oldest kill: 2025-12-10)

**Other confirmed alpha-strike endpoints:**
```
GET /characters?name=<name>     → character address + tribe history
GET /location?id=<system_id>    → solar system name + coordinates (full catalog)
GET /totals                     → leaderboard (top killers/tribes/systems)
```

**Reliability note:** Community-operated, no official SLA. Design the poller with
retry/backoff and graceful degradation — stale data is acceptable, a crash is not.

### 2.2 CCP World API — Static Reference Data Only

**Base URL:** `https://world-api-stillness.live.tech.evefrontier.com`
**Status:** Live and tested (2026-05-17)
**Swagger spec:** `GET /docs/doc.json` (confirmed accessible)

**Complete confirmed endpoint list (World API v1.0.1):**

| Path | Use |
|---|---|
| `GET /config` | Returns `podPublicSigningKey` |
| `GET /v2/solarsystems?limit=N&offset=N` | System ID → name + location |
| `GET /v2/solarsystems/{id}` | Single system lookup |
| `GET /v2/tribes?limit=N&offset=N` | Tribe/corp ID → name |
| `GET /v2/ships?limit=N&offset=N` | Ship ID → name + class |
| `GET /v2/types?limit=N&offset=N` | Item type ID → name |
| `POST /v2/pod/verify` | POD signature verification |
| `GET /v2/characters/me/jumps` | Auth-gated, not useful here |

**Does NOT exist:** `/v2/kills`, `/v2/killmails`, `/v2/smartcharacters`

The world API is the correct source for **static reference tables**: ship class names,
system names, tribe names. It does NOT serve kill data.

**Verified sample responses:**
```json
// GET /v2/solarsystems/30014632
{"id":30014632,"name":"IVT-KDB","constellationId":20001031,...}

// GET /v2/tribes?limit=2
{"data":[{"id":1000044,"name":"NPC Corp 1000044","nameShort":"SAK",...}],"metadata":{"total":3,...}}

// GET /v2/ships?limit=2
{"data":[{"id":81609,"name":"USV","classId":25,"className":"Frigate",...},
         {"id":81611,"name":"Chumaq","classId":419,"className":"Combat Battlecruiser",...}],
 "metadata":{"total":11,...}}
```

### 2.3 Pyropechain MUD Indexer — NOT VIABLE FOR STILLNESS (2026-05-17)

**Endpoint:** `https://indexer.mud.pyropechain.com/q`
**Status:** Server alive, but Stillness world address not indexed.

Direct test with confirmed Stillness world address
(`0x1dacc0b64b7da0cc6e2b2fe1bd72f58ebd37363c`, OP Sepolia CHAIN_ID=11155420):
```
POST /q  [{"address":"0x1dacc0b64b7da0cc6e2b2fe1bd72f58ebd37363c","query":"SELECT ..."}]
→ {"msg":"schemas not found"}
```
The endpoint accepts the EVM address format but returns no schema for Stillness.
The world may have been upgraded to a new address, or Pyropechain may index a different
chain. Do not use this source until the correct current world address is confirmed.

Alpha-strike's `kill_update.cpp` uses this indexer as its upstream — meaning alpha-strike
already resolves the raw MUD query for us. Using the alpha-strike API avoids the need to
maintain a MUD world address.

### 2.4 loss_type Values — VERIFIED

In 200+ kills tested, `loss_type` is always `"ship/structure"` — a string enum, not an
integer. Other values that may exist (pod kills, structure-only kills, etc.) have not been
observed in the test corpus but should be stored verbatim.

No ship type or ship class ID is present in kill records. Ship class data (Frigate,
Battlecruiser, etc.) is available separately from the world API `/v2/ships` but cannot
be joined to a specific kill — loss_type does not carry a ship ID.

---

## 3. Character Name Resolution — REVISED

**Alpha-strike API already resolves character names.** The `/incident` response includes
`victim_name`, `killer_name`, `victim_tribe_name`, `killer_tribe_name` pre-resolved.
No separate character lookup is required for kill ingest.

The `/v2/smartcharacters` endpoint **does not exist** on the CCP world API
(confirmed: not in swagger spec). Character names come from the alpha-strike data only.

**What we store instead of a character lookup table:**

Kill records are write-once and already fully enriched by the time we receive them.
Denormalize victim/killer names and tribe names directly into `world_kill_mails` at
ingest time. No separate `world_characters` table is required for the kill pipeline.

Character addresses (20-byte hex, no 0x prefix) are available from alpha-strike and can
be stored in the kill record for cross-reference with FrontierWarden's existing
`eve_identities` table — but that join is optional enrichment, not required for the
killboard display.

**Tribe data:** `victim_tribe_name` and `killer_tribe_name` are directly available.
No world API tribe lookup needed for kills. World API `/v2/tribes` is useful for
displaying full tribe info (tax rate, description) in the tribe dossier view, separate
from the killboard.


## 4. Recommended DB Schema — REVISED

Alpha-strike already enriches all names. Schema is simpler than originally designed:
no `world_characters` join table needed.

```sql
-- Native kill mail records from alpha-strike / EVE world contract
CREATE TABLE world_kill_mails (
    id                  BIGSERIAL   PRIMARY KEY,
    source_id           BIGINT      NOT NULL,          -- alpha-strike incident id
    environment         TEXT        NOT NULL DEFAULT 'stillness',
    victim_name         TEXT,
    victim_address      TEXT,                          -- 20-byte hex, no 0x prefix
    victim_tribe        TEXT,
    killer_name         TEXT,
    killer_address      TEXT,
    killer_tribe        TEXT,
    solar_system_id     BIGINT,
    solar_system_name   TEXT,
    loss_type           TEXT,                          -- "ship/structure" or future values
    kill_time           TIMESTAMPTZ,                   -- from time_stamp (unix epoch)
    raw_json            JSONB,                         -- full source row
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, environment)
);

CREATE INDEX world_kill_mails_env_time   ON world_kill_mails (environment, kill_time DESC);
CREATE INDEX world_kill_mails_victim_name ON world_kill_mails (victim_name);
CREATE INDEX world_kill_mails_killer_name ON world_kill_mails (killer_name);
CREATE INDEX world_kill_mails_system      ON world_kill_mails (solar_system_id);

-- Cursor: stored in existing indexer_state table
-- key = 'cursor:kill_mails:stillness', value = last source_id processed (TEXT)
```

**Why `raw_json`:** Stores the full alpha-strike response row so we can backfill any
future fields (e.g., a ship type field if alpha-strike adds one) without re-polling
historical records.

**No `world_characters` table.** Names are denormalized at ingest time from the alpha-strike
response. Cross-reference to FW `eve_identities` can be done on-demand by victim address
if needed for the trust dossier view.


## 5. Recommended Ingestion Design — REVISED

### 5.1 Poller (Rust, in indexer)

```
[Startup]
1. Load last cursor from indexer_state WHERE key = 'cursor:kill_mails:{env}'
   cursor = last source_id successfully stored (0 if first run)

[Loop — every 30s]
2. GET https://api.alpha-strike.space/incident?limit=200&offset=0
3. Filter: only rows WHERE id > cursor
   (newest-first response; stop scanning once id <= cursor)
4. If no new rows → sleep poll_interval, continue
5. For each new row (oldest first — reverse iteration):
   a. Parse fields (victim_name, killer_name, solar_system_id, etc.)
   b. Convert time_stamp (unix seconds) → TIMESTAMPTZ
   c. INSERT INTO world_kill_mails ... ON CONFLICT (source_id, environment) DO NOTHING
6. Update cursor = max(source_id) of newly stored rows
7. Save cursor to indexer_state
8. If 200 new rows were found → loop immediately (may be more)
   else → sleep poll_interval (30s)
```

**Cold start:** On first run (cursor = 0), page through full history using offset:
```
offset=0 → ids N..N-200
offset=200 → ids N-200..N-400
... until {"error":"Bad Request! No incident records found"}
```
Insert oldest-first so the cursor always points to the highest confirmed id.

**Config additions (new section, disabled by default):**
```toml
[kill_mails]
enabled = false                            # enable after schema review in staging
source_url = "https://api.alpha-strike.space/incident"
environment = "stillness"
poll_interval_ms = 30000
page_size = 200
# start_source_id = 0                      # 0 = ingest full history on first run
```

**Error handling:**
- HTTP non-200 → log warning, sleep poll_interval, retry (do NOT crash)
- JSON parse error → log error with raw body, skip page, continue
- DB error → propagate (restart indexer; cursor protects idempotency)

### 5.2 No character sync needed

Alpha-strike pre-resolves all names. The character sync branch (`codex/world-character-cache`)
from the original sequence is **dropped** — the world API has no smartcharacters endpoint.


## 6. Recommended API

```
GET /kill-mails
  ?environment=stillness   (default: stillness)
  ?limit=50                (max 200)
  ?after=<kill_mail_id>    (cursor pagination)
  ?system_id=<id>          (optional filter)
  ?char_id=<id>            (optional filter, returns kills+losses for that char)

GET /kill-mails/:kill_mail_id
  Returns single kill with full enrichment

GET /world/characters/:char_id/kills
  Returns kills where killer_char_id = char_id

GET /world/characters/:char_id/losses
  Returns kills where victim_char_id = char_id

GET /world/systems/:system_id/kills
  Returns recent kills in that solar system
```

**Response shape (single kill mail):**
```json
{
  "kill_mail_id": 12345,
  "environment": "stillness",
  "kill_time": "2026-05-17T08:31:48Z",
  "killer_char_id": 67890,
  "killer_name": "Vex Korith",
  "victim_char_id": 11111,
  "victim_name": "R. Dax",
  "solar_system_id": 30000142,
  "solar_system_name": "Pochven Halo III",
  "loss_type": 2,
  "loss_type_name": null,
  "attacker_count": null,
  "indexed_at": "2026-05-17T08:32:01Z"
}
```

**Pagination note:** Use `kill_mail_id`-based cursor (integer), not timestamp or offset.
Stable under concurrent inserts, efficient with the indexed column.

**Rate limit / aggregation risk:** Kill feed APIs are high-value intelligence aggregators.
Do not expose an unbounded feed. The 200-row max and cursor-based pagination are sufficient
for initial protection. If fleet composition analysis or bulk character targeting becomes
possible via this endpoint, revisit with the ADR_DATA_AGGREGATION_RISK.md policy.

---

## 7. Frontend Migration Design

### 7.1 Data source precedence

```
Primary:   world_kill_mails (native telemetry — full UX fidelity)
Secondary: attestations WHERE schema_id = 'SHIP_KILL' (trust evidence)
```

The killboard view should use native kills for display. SHIP_KILL attestations become
a trust badge on kills that have one — the oracle's on-chain confirmation.

### 7.2 KillboardView changes

- Replace `fetchAttestationFeed` with `fetchKillMails` (new API endpoint)
- Map `killer_name`, `victim_name`, `solar_system_name`, `loss_type_name` directly to table cells
- Add a "ATTESTED" badge on rows where a matching SHIP_KILL attestation exists
  (join on kill_mail_id if available, or fuzzy match on time + victim)
- Add "Native killmail telemetry" label near the table header
- SHIP_KILL attestation rows that have no matching native kill can appear in a separate
  "Oracle Intercepts" section with the existing disclaimer text

### 7.3 Type changes in fw-data.ts / useFrontierWardenData.ts

Current `FwKill` fields that can be populated from native kill mails:
- `victim` → `victim_name`
- `system` → `solar_system_name`
- `ship` → `loss_type_name` (once enum is mapped)
- `attackers` → not available (field absent in kill mail schema)
- `t` → `kill_time` (ISO 8601)
- `hash` → `issued_tx` from the matched SHIP_KILL attestation if present
- `verified` → `true` if a SHIP_KILL attestation exists for this kill

Fields to add to `FwKill`:
```typescript
killerName?: string;
killMailId?: number;      // native kill mail ID
nativeTelemetry: boolean; // true = came from world kill mail
```

---

## 8. Implementation Sequence — REVISED

`codex/world-character-cache` is **dropped** (no smartcharacters endpoint exists).
The sequence is now 4 branches (was 4 + the character cache branch):

### Branch 1: `codex/kill-mail-poller-disabled`
Scope: Migration for `world_kill_mails`, poller code, config section with `enabled=false`.
No production traffic until explicitly enabled.
Risk: Low. Dead code path, additive schema.
Prerequisite: None. Can merge immediately.

### Branch 2: `codex/kill-mail-api`
Scope: `GET /kill-mails`, `GET /kill-mails/:id`, `GET /world/systems/:id/kills` endpoints.
Risk: Low. Read-only from `world_kill_mails`.
Prerequisite: Branch 1 merged. `kill_mails.enabled = true` in staging to populate data.

### Branch 3: `codex/killboard-native-migration`
Scope: Frontend switches killboard to native kill mail API. Killer column, system column,
proper timestamps. SHIP_KILL attestation rows become secondary "ATTESTED" badge.
Risk: Medium. Visible regression risk on killboard view.
Prerequisite: Branch 2 merged and staging killboard verified with real data.

### Branch 4: `codex/killboard-dossier-evidence-model`
Scope: Surface kill attestations as trust evidence in the dossier view:
```
Native killmail:   Kivik killed PilotX in SystemY  [combat telemetry]
Attestation:       Oracle SHIP_KILL · 127.0M LUX   [trust evidence]
Tenant action:     [Use as evidence] [Ignore] [Attest]
```
Risk: Medium. Requires dossier view design work.
Prerequisite: Branch 3 stable.


## 9. Open Questions — REVISED (post-verification)

| Question | Status | Resolution |
|---|---|---|
| Stillness kill source | ✅ Confirmed | Alpha-strike API `/incident` — live, tested |
| World API endpoints | ✅ Confirmed | Full swagger spec enumerated; no kill or character endpoints |
| lossType enum format | ✅ Confirmed | String `"ship/structure"`, not integer |
| killTimestamp format | ✅ Confirmed | Unix epoch seconds (not LDAP) |
| Pagination strategy | ✅ Confirmed | offset+limit, newest-first, ~4,860 total records |
| Character name resolution | ✅ Confirmed | Pre-resolved by alpha-strike; no separate lookup needed |
| Pyropechain MUD indexer | ⚠ Deferred | Address not found; use alpha-strike instead |
| smartcharacters endpoint | ❌ Does not exist | Not in world API swagger spec |

**One remaining dependency risk:** Alpha-strike is community-operated. If it goes down,
the kill poller will produce no new records until it recovers. Design poller to fail
gracefully (log warning, sleep, retry) rather than crashing. The DB cursor will resume
from the last successfully ingested `id` on recovery.


## 10. What This Branch Does NOT Change

- No Move contract changes
- No SHIP_KILL attestation schema changes
- No existing attestation ingestor changes
- No production DB migrations
- No Railway env var changes
- No frontend changes
- No removal of existing killboard functionality

This is a design and spike document only. All code changes land in subsequent branches
per the sequence in §8.
