# EVE Native Bridge — Discovery Spike Findings

**Date:** 2026-05-01
**Spike duration:** ~30 min
**Environments tested:** Utopia (Sandbox), Stillness (Live)

---

## Endpoints Tested

| Endpoint | Environment | Status | Notes |
|----------|------------|--------|-------|
| `/health` | Utopia | ✅ 200 | `{"ok":true}` |
| `/health` | Stillness | ✅ 200 | `{"ok":true}` |
| `/config` | Utopia | ✅ 200 | Returns `podPublicSigningKey` |
| `/config` | Stillness | ✅ 200 | Returns `podPublicSigningKey` (different key) |
| `/v2/solarsystems` | Utopia | ✅ 200 | 24,502 total, pagination (limit 100) |
| `/v2/solarsystems/:id` | Utopia | ✅ 200 | Has `gateLinks` field (empty on testnet) |
| `/v2/solarsystems/:id` | Stillness | ✅ 200 | Same structure, `gateLinks` also empty |
| `/v2/tribes` | Utopia | ✅ 200 | 23 total (NPC Corps) |
| `/v2/tribes` | Stillness | ✅ 200 | 101 total |
| `/v2/ships` | Utopia | ✅ 200 | 11 total, all marked "(placeholder)" |
| `/v2/ships` | Stillness | ✅ 200 | 11 total, same ships |
| `/v2/types` | Utopia | ✅ 200 | 392 total, commodities/modules |
| `GraphQL testnet` | — | ❌ Blocked | POST-only, WebFetch can't test |

---

## Payload Shape Summary

### `/v2/solarsystems` (list)

```json
{
  "data": [
    {
      "id": 30000001,
      "name": "A 2560",
      "constellationId": 20000001,
      "regionId": 10000001,
      "location": {
        "x": -5103797186450162000,
        "y": -442889159183433700,
        "z": 1335601100954271700
      }
    }
  ],
  "metadata": { "total": 24502, "limit": 100, "offset": 0 }
}
```

### `/v2/solarsystems/:id` (detail)

```json
{
  "id": 30000001,
  "name": "A 2560",
  "constellationId": 20000001,
  "regionId": 10000001,
  "location": { "x": ..., "y": ..., "z": ... },
  "gateLinks": []
}
```

**Gate adjacency:** The `gateLinks` field EXISTS but is **empty on both Utopia and Stillness**. This means gate topology data is either:
- Not yet populated on testnet (Cycle 5 mid-cycle)
- Requires a different lookup mechanism (events, GraphQL, or a separate endpoint)
- May be populated when actual Smart Gates are deployed

**Important:** The spec assumed solarsystems would give us the gate adjacency graph. **It does not — at least not yet.** The `gateLinks` array is the right field but has no data. This is a blocker for "gate topology from World API."

### `/v2/tribes`

```json
{
  "data": [
    {
      "id": 1000044,
      "name": "NPC Corp 1000044",
      "nameShort": "SAK",
      "description": "",
      "taxRate": 0,
      "tribeUrl": ""
    }
  ],
  "metadata": { "total": 23, "limit": 100, "offset": 0 }
}
```

Stillness has 101 tribes vs Utopia's 23. Both are NPC Corps — no player-created tribes visible yet.

### `/v2/ships`

```json
{
  "data": [
    {
      "id": 81609,
      "name": "USV",
      "classId": 25,
      "className": "Frigate",
      "description": "A light vessel optimized for resource extraction (placeholder)."
    }
  ],
  "metadata": { "total": 11, "limit": 100, "offset": 0 }
}
```

11 ships total. All descriptions contain "(placeholder)". Ship classes: Frigate, Combat Battlecruiser, Destroyer, Cruiser, Shuttle, Corvette.

### `/v2/types`

```json
{
  "data": [
    {
      "id": 72244,
      "name": "Feral Data",
      "description": "",
      "mass": 0.1,
      "radius": 1,
      "volume": 0.1,
      "portionSize": 1,
      "groupName": "Rogue Drone Analysis Data",
      "groupId": 0,
      "categoryName": "Commodity",
      "categoryId": 17,
      "iconUrl": ""
    }
  ],
  "metadata": { "total": 392, "limit": 100, "offset": 0 }
}
```

392 types. Categories include Commodity, Module. Good for resolving type IDs to names in killboard/provenance context.

---

## Exact Type Strings Discovered

From the official docs scrape (`officialevebuilderdocuments.md`):

### Utopia (Sandbox) Package IDs

| Object | Address |
|--------|---------|
| World Package | `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75` |
| Object Registry | `0xc2b969a72046c47e24991d69472afb2216af9e91caf802684514f39706d7dc57` |
| Energy Config | `0x9285364e8104c04380d9cc4a001bbdfc81a554aad441c2909c2d3bd52a0c9c62` |
| Fuel Config | `0x0f354c803af170ac0d1ac90625c6321996b3013dc67bdaf14d06f93fa1671f` |
| Gate Config | `0x69a392c514c4ca6d771d8aa8bf296d4d7a021e244e792eb6cd7a0c61047fc62b` |
| AdminACL | `0xa8655c6721967e631d8fd157bc88f7943c5e1263335c4ab553247cd3177d4e86` |

### Stillness (Live) Package IDs

| Object | Address |
|--------|---------|
| World Package | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448...` (truncated in docs) |

### PlayerProfile Type String

The docs specify the GraphQL query pattern:

```graphql
query GetCharacterDetails($address: SuiAddress!, $profileType: String!) {
    address(address: $address) {
        objects(last: 10, filter: { type: $profileType }) {
            nodes { contents { ... on MoveObject { contents { type { repr } json } } } }
        }
    }
}
```

Variables: `{ "address": "0x...", "profileType": "0x<packageId>::character::PlayerProfile" }`

**For Utopia, the exact type string should be:**
```
0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75::character::PlayerProfile
```

**For Stillness, the exact type string should be:**
```
0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448...::character::PlayerProfile
```
(The Stillness package ID is truncated in the docs — needs verification.)

**Cannot be confirmed yet** because:
1. GraphQL is POST-only (can't test via WebFetch)
2. No test wallet with a PlayerProfile object is available
3. The Stillness package ID is incomplete in the docs

---

## Whether Gate Adjacency Exists

**The `gateLinks` field exists** on `/v2/solarsystems/:id` but is **empty on both environments**.

This means:
- The data model supports gate adjacency (the field is there)
- Testnet does not yet have populated gate links (mid-Cycle 5)
- Gate topology cannot be used as a v0.1 data source
- FrontierWarden's gate intel must remain based on its own protocol events until CCP populates gateLinks

**Spec change needed:** Remove the assumption that solarsystems gives us gate topology. Instead, gate topology should come from:
1. FrontierWarden's own `reputation_gate` events (current approach)
2. World Contract `JumpEvent` indexing (future)
3. `gateLinks` when populated by CCP (monitor)

---

## character_id and tribe_id Exposure

From the docs:
- `PlayerProfile` objects contain a `character_id` field (confirmed by docs reference)
- `Character` objects exist separately and can be fetched by `character_id`
- Whether `Character` exposes `tribe_id` directly is **not confirmed** in the docs
- The `/v2/tribes` endpoint shows tribe data but no character-to-tribe mapping

**Cannot be confirmed yet** because:
1. Need to query a real `PlayerProfile` object via GraphQL to see its JSON shape
2. Need to query a `Character` object to see if `tribe_id` is present
3. No test wallet with known PlayerProfile is available for this spike

---

## Blockers

### Critical Blockers

1. **GraphQL is POST-only** — Cannot test PlayerProfile lookup without a proper HTTP client (curl, Rust reqwest). WebFetch cannot execute POST GraphQL queries.

2. **No test wallet with PlayerProfile** — Even if GraphQL works, we need a wallet address that actually owns a `PlayerProfile` object on testnet to validate the identity flow end-to-end.

3. **Stillness package ID truncated** — The Stillness world package ID in the docs is cut off. Need the full 64-char hex to construct the PlayerProfile type string for Stillness.

4. **gateLinks is empty** — Gate topology cannot be sourced from World API. The spec's assumption that solarsystems provides gate adjacency is incorrect for Cycle 5.

### Moderate Blockers

5. **tribes are all NPC Corps** — No player-created tribes visible yet. Tribe standing schemas won't have real data until player tribes exist.

6. **Ships are all placeholders** — All 11 ships have "(placeholder)" in descriptions. Ship provenance will be more meaningful when real ships exist.

---

## Recommended Implementation Changes to the Spec

### 1. Gate Topology — Remove from v0.1 scope

The spec says solarsystems gives us gate adjacency. **It doesn't.** The `gateLinks` field exists but is empty on both environments.

**Change:** Remove `eve_gate_edges` table from migration 0010. Gate topology should come from FrontierWarden's own `reputation_gate` events or future `JumpEvent` indexing.

### 2. GraphQL Testing — Requires proper HTTP client

The identity adapter cannot be validated via WebFetch. The implementation needs:
- A Rust GraphQL client using `reqwest` POST
- The exact world package ID for the target environment
- A test wallet that owns a PlayerProfile (or graceful null response)

### 3. PlayerProfile Type String — Make fully configurable

The spec already handles this via `player_profile_type` in config. This is correct. The default should use the Utopia package ID since that's the most accessible testnet:

```toml
player_profile_type = "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75::character::PlayerProfile"
```

### 4. World API Sync — Safe to proceed

All four public endpoints (solarsystems, tribes, ships, types) work reliably. The sync job can be implemented immediately. Pagination is via `limit`/`offset` with `metadata.total`.

### 5. Reduce v0.1 scope on identity

Since GraphQL testing is blocked and we lack a test wallet with PlayerProfile, the identity adapter should:
- Implement the GraphQL query logic
- Return safe null responses when not found
- Not be considered "complete" until tested against a real PlayerProfile

### 6. Add Stillness package ID recovery

The Stillness world package ID is truncated in the docs. It should be recovered by:
- Querying the World API `/config` endpoint and correlating with Sui GraphQL
- Or checking the official EVE Frontier builder docs directly
- Or querying `suix_getPackages` on Stillness testnet

### 7. New open questions

- Q11: When will `gateLinks` be populated on testnet?
- Q12: Does PlayerProfile JSON contain `character_id` as a number or string?
- Q13: What is the complete Stillness world package ID?
- Q14: Are there player-created tribes on Stillness (101 NPC Corps suggests not)?

---

## Summary

**World API:** ✅ All 4 public endpoints work. Safe to implement sync job.
**Gate adjacency:** ❌ `gateLinks` field exists but is empty. Remove from v0.1.
**Identity adapter:** ⚠️ Type string known for Utopia, Stillness ID truncated. GraphQL needs POST client. Blocked on test wallet.
**Tribes/ships/types:** ✅ Data exists but is NPC/placeholder quality. Still useful for name resolution.

---

## EVE Identity Resolution v0.1 — GraphQL Verified

The identity adapter now successfully performs Sui GraphQL POST lookups.

Verified behavior:
- `/eve/identity/{wallet}?refresh=true` returns `200 OK`
- GraphQL request no longer fails with HTTP 400
- wallet lookup completes safely
- current test wallet returns `identity_status: not_found`
- FrontierWarden profile fallback is preserved

Current test wallet:
- wallet: `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`
- FrontierWarden profile: `0xeef1476689094bab84863dfb6548fcbb9b106090975b6300925996750631b0a9`
- EVE identity: not found in configured Utopia PlayerProfile type
