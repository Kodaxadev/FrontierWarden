# Native Killmail Ingestion — Spike

**Branch:** `codex/native-killmail-ingestion-spike`
**Date:** 2026-05-17
**Status:** Design only — no production code changes

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

## 2. Native Kill Mail Sources

### 2.1 Primary: Pyropechain MUD Indexer

Community-operated indexer that reads EVE Frontier's on-chain MUD world state.

**Endpoint:** `https://indexer.mud.pyropechain.com/q`
**Method:** POST
**Content-Type:** `application/json`

**Request shape:**
```json
[
  {
    "address": "<STILLNESS_WORLD_ADDRESS>",
    "query": "SELECT \"killMailId\", \"killerCharacterId\", \"victimCharacterId\", \"lossType\", \"solarSystemId\", \"killTimestamp\" FROM \"evefrontier__KillMail\" WHERE \"killMailId\" > $1 ORDER BY \"killMailId\" ASC LIMIT $2"
  }
]
```

**Response shape:**
```json
[
  [
    ["killMailId", "killerCharacterId", "victimCharacterId", "lossType", "solarSystemId", "killTimestamp"],
    [12345, 67890, 11111, 2, 30000142, 133500000000000000],
    ...
  ]
]
```

The response is a columnar array: row 0 is the header, rows 1..N are data.

**Table:** `evefrontier__KillMail` (double-quoted, case-sensitive)

**Confirmed fields:**
| Column | Type | Notes |
|---|---|---|
| `killMailId` | integer | Monotonically increasing, use as cursor |
| `killerCharacterId` | integer | EVE character ID |
| `victimCharacterId` | integer | EVE character ID |
| `lossType` | integer | Enum — values TBD (see §2.3) |
| `solarSystemId` | integer | EVE solar system ID |
| `killTimestamp` | integer | LDAP timestamp (100ns intervals since 1601-01-01) |

**LDAP → UTC conversion:**
```
unix_seconds = (killTimestamp / 10_000_000) - 11_644_473_600
```

**⚠ Unknown: Stillness world address.** Alpha-strike's source code has this hardcoded
as a literal placeholder `CURRENT_WORLD_ADDRESS`. It is the MUD world contract address
on-chain. Our `world_package_id` from config
(`0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c`) is the most
likely candidate but must be **verified** before use. See §7 for confirmation steps.

**Reliability note:** Pyropechain is community-operated, not CCP-official. It may have
downtime. Design the poller with retry/backoff and graceful degradation.

### 2.2 Secondary: Blockchain Gateway REST API

CCP-operated REST gateway mirroring world state.

**Base URL:** `https://blockchain-gateway-stillness.live.tech.evefrontier.com`
**Swagger UI:** `<base>/docs/index.html` (currently connection-refused from external fetch)

Known endpoints from community reverse-engineering:
- `GET /v2/solarsystems?limit=N&offset=N` → system names
- `GET /v2/smartcharacters?limit=N&offset=N` → character names + wallet addresses

**Note:** `world-api-stillness.live.tech.evefrontier.com` and
`blockchain-gateway-stillness.live.tech.evefrontier.com` may be the same service or
load-balanced siblings. The `world_api_base` in our config points to `world-api-stillness`.
Test both; prefer whichever returns 200 for `/v2/smartcharacters`.

### 2.3 lossType Enum

Values are unknown from available sources. Likely maps to EVE ship type IDs or a small
enum (Ship, Pod/Capsule, Structure, Drone, etc.). Alpha-strike stores the raw integer.
EF-Map resolves ship names via a separate lookup against `/v2/types` or `/v2/ships`.

**Action required:** Confirm mapping by:
1. Querying the MUD indexer for a sample of kills
2. Cross-referencing `lossType` values with `/v2/ships` or `/v2/types` from the world API
3. Checking `world-chain-contracts` for the `KillMail.sol` schema definition

---

## 3. Character Name Resolution

**Endpoint:** `GET /v2/smartcharacters?limit=100&offset=N`

**Response (confirmed from alpha-strike source):**
```json
{
  "data": [
    { "id": "12345", "address": "0xabc...", "name": "Vex Korith" },
    ...
  ],
  "metadata": { "total": 8000, "limit": 100, "offset": 0 }
}
```

- `id` is a string representation of an integer character ID
- `address` is the player's Sui wallet address (0x-prefixed)
- `name` is the EVE character name

**Strategy:** Bulk-sync all characters into a `world_characters` lookup table on startup
and incrementally, re-syncing characters that appear in new kill mails with no cached name.
This avoids N+1 lookups on the kill poller hot path.

**Character IDs in kill mails** are the same integer IDs in `smartcharacters`.
They are NOT Sui object addresses. The kill mail's `killerCharacterId: 67890` maps to
the `smartcharacters` entry `{ "id": "67890", ... }`.

**Tribe / corp:** The `smartcharacters` endpoint does not appear to include tribe.
Tribe resolution for kills goes through the existing `eve_identity` pipeline (GraphQL →
`PlayerProfile` → character object → `tribe_id`). As a shortcut for the killboard, tribe
can be omitted in v1 and added when the identity pipeline resolves names.

---

## 4. Recommended DB Schema

```sql
-- Canonical native kill mails from the world contract
CREATE TABLE world_kill_mails (
    id                  BIGSERIAL PRIMARY KEY,
    kill_mail_id        BIGINT      NOT NULL,  -- evefrontier__KillMail.killMailId
    environment         TEXT        NOT NULL DEFAULT 'stillness',  -- stillness | utopia
    killer_char_id      BIGINT,
    victim_char_id      BIGINT,
    killer_name         TEXT,                  -- denormalized from world_characters
    victim_name         TEXT,                  -- denormalized from world_characters
    solar_system_id     BIGINT,
    solar_system_name   TEXT,                  -- denormalized from world_solar_systems
    loss_type           INT,
    loss_type_name      TEXT,                  -- resolved when mapping is known
    kill_time           TIMESTAMPTZ,           -- converted from LDAP killTimestamp
    raw_json            JSONB,                 -- full source row for forward compat
    indexed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kill_mail_id, environment)
);

CREATE INDEX world_kill_mails_env_time ON world_kill_mails (environment, kill_time DESC);
CREATE INDEX world_kill_mails_victim   ON world_kill_mails (victim_char_id);
CREATE INDEX world_kill_mails_killer   ON world_kill_mails (killer_char_id);
CREATE INDEX world_kill_mails_system   ON world_kill_mails (solar_system_id);

-- Character name cache (from /v2/smartcharacters)
CREATE TABLE world_characters (
    char_id         BIGINT      PRIMARY KEY,
    name            TEXT,
    wallet_address  TEXT,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solar system name cache (already partially in world_solar_systems if it exists)
-- Reuse existing world_solar_systems table if present; otherwise:
CREATE TABLE world_solar_systems (
    system_id   BIGINT PRIMARY KEY,
    name        TEXT,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cursor for incremental kill mail polling
-- Reuse indexer_state table: key = 'cursor:kill_mails:stillness'
-- value = last kill_mail_id processed (TEXT, since indexer_state.value is TEXT)
```

**Denormalization rationale:** Kills are write-once. Denormalizing names at index time
avoids join overhead on the hot API path and preserves the name as it was at kill time
(important if a character renames later).

---

## 5. Recommended Ingestion Design

### 5.1 Poller (Rust, runs in the indexer)

```
[Startup]
  1. Load last cursor from indexer_state WHERE key = 'cursor:kill_mails:{env}'
  2. Loop:
     a. POST to indexer.mud.pyropechain.com/q
        body: [{"address": WORLD_ADDRESS, "query": "SELECT ... WHERE killMailId > $cursor ORDER BY killMailId ASC LIMIT 200"}]
     b. If empty → sleep poll_interval (30s), continue
     c. For each row:
        - Resolve killer/victim char IDs via world_characters cache
          (if not cached → fetch from /v2/smartcharacters/{id} or bulk re-sync)
        - Resolve solar_system_id via world_solar_systems cache
        - Convert LDAP timestamp → UTC
        - INSERT INTO world_kill_mails ... ON CONFLICT DO NOTHING
     d. Update cursor = max(killMailId) processed
     e. Save cursor to indexer_state
     f. If page was full (200 rows) → loop immediately (catch-up mode)
        else → sleep poll_interval
```

**Startup sync:** On first run (cursor = 0), the world may have thousands of kills.
Use a configurable `kill_mail_start_id` in config (analogous to `world_start_checkpoint`)
so operators can cold-start from a known recent ID rather than replaying the full history.

**Config additions needed** (no production change — new section):
```toml
[kill_mails]
enabled = false                        # disabled until world address confirmed
world_address = "env:EF_WORLD_ADDRESS" # Stillness world contract address
start_kill_mail_id = 0                 # cold-start cursor; 0 = all history
poll_interval_ms = 30000
page_size = 200
```

### 5.2 Character sync

On every poller cycle, collect character IDs seen in new kill rows that are missing from
`world_characters`. Batch-fetch those IDs from `/v2/smartcharacters` (if the endpoint
supports individual ID lookup) or trigger a full incremental re-sync.

EF-Map does a scheduled full sync of all characters. For FW, a lighter approach:
- Full sync on startup (paginate all smartcharacters into `world_characters`)
- On miss: re-sync all characters (a few thousand total, manageable)

### 5.3 Environment isolation

The `environment` column on `world_kill_mails` separates Stillness and Utopia data.
The poller reads `WORLD_ADDRESS` from config per-environment. Railway services get
different env vars. Do NOT mix Stillness kills into a Utopia-only DB.

---

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

## 8. Implementation Sequence

Branch sequence after this spike is confirmed:

### Branch 1: `codex/world-character-cache`
Scope: Add `world_characters` table + full sync from `/v2/smartcharacters` on startup.
Risk: Low. Read-only from world API; additive DB table.
Prerequisite: None.

### Branch 2: `codex/kill-mail-poller-disabled`
Scope: Add `world_kill_mails` table, kill mail poller code, new config section — but
with `kill_mails.enabled = false`. No production traffic until world address confirmed.
Risk: Low. Dead code until enabled.
Prerequisite: Branch 1 merged. World address confirmed (see §9).

### Branch 3: `codex/kill-mail-api`
Scope: `/kill-mails` and `/world/characters/:id/kills` API endpoints.
Risk: Low. Reads from new table only.
Prerequisite: Branch 2 merged.

### Branch 4: `codex/killboard-native-migration`
Scope: Frontend switches killboard to native kill mail API. SHIP_KILL attestations become
secondary badge. KillboardView gets killer column, system column, proper timestamps.
Risk: Medium. Visual regression to existing killboard.
Prerequisite: Branch 3 merged. `kill_mails.enabled = true` in Railway after world address confirmed.

---

## 9. Open Questions (Must Resolve Before Branch 2)

| Question | How to confirm |
|---|---|
| Stillness world address for MUD indexer | Query the Pyropechain indexer using our `world_package_id` as the address value; if rows come back it's correct. Alternatively ask in EVE Frontier Builders Discord |
| lossType enum | Fetch sample kill rows; check `loss_type` values against `/v2/types` or `/v2/ships` |
| Pyropechain indexer uptime/SLA | Check alpha-strike.space uptime history; design poller to tolerate multi-hour outages gracefully |
| smartcharacters individual-ID endpoint | Test `GET /v2/smartcharacters/{id}` — if it exists, use it for targeted cache misses; otherwise fall back to full re-sync |
| blockchain-gateway vs world-api | Test whether `blockchain-gateway-stillness.live.tech.evefrontier.com/v2/smartcharacters` works; if so, prefer it (CCP-operated vs community) |
| Kill mail attacker list | Check whether `evefrontier__KillMail` has an attackers sub-table or join target in the MUD store |

---

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
