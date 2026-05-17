# Kill Mail API

**Layer:** Combat telemetry (read-only)
**Source:** `api.alpha-strike.space/incident` — community-operated, no auth required
**Status:** Available — poller is disabled by default; data populates once `kill_mails.enabled = true`

---

## Native Kill Mail vs SHIP_KILL Attestation

These are two separate, independent concepts. Do not conflate them.

| | Native Kill Mail | SHIP_KILL Attestation |
|---|---|---|
| **What it is** | Raw combat event — what actually happened in-game | Oracle trust signal — an external actor attested that a kill occurred |
| **Who produces it** | Alpha-Strike community API (game telemetry) | FrontierWarden attestation oracle |
| **Stored in** | `world_kill_mails` table | `attestations` table |
| **Trust impact** | None — telemetry only | Feeds trust scores when tenants act on it |
| **API** | `/kill-mails/*` | `/attestations/*` |
| **UI role** | Primary killboard feed | Trust/evidence badge overlay |

A kill mail answers: *what happened*.
A SHIP_KILL attestation answers: *an oracle vouched for this kill as trust-layer evidence*.
Reputation changes only through explicit trust signals and attestations — kill mails alone have no effect on scores.

---

## Data Aggregation Policy

- Paginated reads only — max 200 rows per request
- No bulk export endpoints
- No "vulnerable pilot" or activity-ranking filters
- No unrestricted social or combat graph traversal
- Kill mail data is derived combat intelligence — callers must not use it to build targeting lists

---

## Endpoints

### GET /kill-mails

Paginated list of all kill mails, newest first.

**Query params**

| Param | Default | Max | Description |
|---|---|---|---|
| `limit` | 50 | 200 | Rows per page |
| `cursor` | — | — | Opaque token from previous `nextCursor` |

**Response**

```json
{
  "items": [
    {
      "killMailId": 4861,
      "sourceId": 10771,
      "environment": "stillness",
      "killerName": "Kodaxa",
      "killerAddress": "0xabc...123",
      "killerTribe": "Iron Fist",
      "victimName": "TargetPlayer",
      "victimAddress": "0xdef...456",
      "victimTribe": "Free Agents",
      "solarSystemId": 30000142,
      "solarSystemName": "Jita",
      "lossType": "Frigate",
      "killTimestamp": "2025-05-15T18:32:00Z",
      "indexedAt": "2025-05-15T18:35:12Z"
    }
  ],
  "total": 50,
  "nextCursor": "NDg2MA",
  "dataNote": "Native kill mail data is combat telemetry. ..."
}
```

`nextCursor` is absent when there are no more pages.

---

### GET /kill-mails/:id

Single kill mail by DB row id. Includes `rawJson` (the original alpha-strike payload).

**Response**

```json
{
  "killMailId": 4861,
  "sourceId": 10771,
  "environment": "stillness",
  "killerName": "...",
  ...
  "rawJson": { "id": 10771, "victim_name": "TargetPlayer", ... }
}
```

Returns `404` if not found.

---

### GET /world/characters/:address/kills

Kill mails where `:address` (EVM wallet address) was the killer, newest first.

Same pagination as `/kill-mails`.

---

### GET /world/characters/:address/losses

Kill mails where `:address` was the victim, newest first.

Same pagination as `/kill-mails`.

---

### GET /world/systems/:system_id/kills

Kill mails in solar system `:system_id`, newest first.

Same pagination as `/kill-mails`.

---

## Pagination

Cursor-based keyset pagination on the `id` column (stable, monotonic surrogate key).

- Send no `cursor` for the first page
- Pass `nextCursor` from the response as `cursor` for the next page
- Absence of `nextCursor` means the last page has been reached
- Requesting with a stale cursor is safe — it will return the next batch after that id (possibly empty)

---

## Response Fields

| Field | Type | Source | Notes |
|---|---|---|---|
| `killMailId` | integer | DB `id` | Row surrogate key |
| `sourceId` | integer | `source_id` | Alpha-strike incident id |
| `environment` | string | `environment` | `"stillness"` (default) |
| `killerName` | string? | `killer_name` | Pre-resolved by alpha-strike |
| `killerAddress` | string? | `killer_address` | EVM wallet address |
| `killerTribe` | string? | `killer_tribe` | Tribe/corp name |
| `victimName` | string? | `victim_name` | Pre-resolved by alpha-strike |
| `victimAddress` | string? | `victim_address` | EVM wallet address |
| `victimTribe` | string? | `victim_tribe` | Tribe/corp name |
| `solarSystemId` | integer? | `solar_system_id` | Numeric system id |
| `solarSystemName` | string? | `solar_system_name` | Human-readable system |
| `lossType` | string? | `loss_type` | Ship/object type string |
| `killTimestamp` | RFC3339? | `kill_time` | UTC game event time |
| `indexedAt` | RFC3339 | `indexed_at` | UTC indexer insertion time |
| `rawJson` | object? | `raw_json` | Single-record endpoint only |

All nullable fields may be `null` or absent — the alpha-strike source is community-operated and may have gaps.

---

## Next Branch

`codex/killboard-native-migration` — migrate the frontend killboard from the SHIP_KILL attestation feed to this native kill mail API. SHIP_KILL attestations become secondary "ATTESTED" badge overlays.
