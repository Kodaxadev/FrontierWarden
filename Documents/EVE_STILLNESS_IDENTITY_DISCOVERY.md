# EVE Stillness Identity Discovery

**Date:** 2026-05-01
**Discovery type:** Stillness (live environment) identity resolution
**Test wallet:** `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`

---

## Summary

The Stillness world package ID has been recovered and the test wallet's identity successfully resolved via Sui testnet GraphQL.

**Both Utopia and Stillness run on Sui testnet** — they share the same GraphQL endpoint but use different world package IDs.

---

## Stillness Package ID

| Object | Address |
|--------|---------|
| World Package | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c` |

**Stillness PlayerProfile Type String:**
```
0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile
```

**GraphQL Endpoint:**
```
https://graphql.testnet.sui.io/graphql
```
(Same endpoint as Utopia — both environments are on Sui testnet)

---

## Identity Resolution Results

The test wallet owns a Stillness PlayerProfile. Identity resolution successful.

### PlayerProfile Object
- **Object ID:** `0x2a9d6b4980644abfa89a5191cc19f9e14bf4357316689a12317e706c5e09ba68`
- **character_id:** `0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a`

### Character Object
Queried the Character object directly to extract full identity data:

- **Character ID:** `0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a`
- **tribe_id:** `1000167`
- **character_address:** `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`
- **tenant:** `stillness`
- **item_id:** `2112089652`

### Character Metadata
- **name:** `Kivik`
- **description:** `""` (empty)
- **url:** `""` (empty)
- **assembly_id:** `0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a`

### Other Character Data
- **owner_cap_id:** `0x8479c0279f0197fe29987074d514a54c8881adc1f0557a3b556689ad838c067f`
- **Character version:** `839084506`

---

## Raw PlayerProfile JSON Shape

```json
{
  "id": "0x2a9d6b4980644abfa89a5191cc19f9e14bf4357316689a12317e706c5e09ba68",
  "character_id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a"
}
```

**Note:** PlayerProfile only contains `id` and `character_id`. The `tribe_id` is stored on the Character object, not PlayerProfile.

---

## Raw Character JSON Shape

```json
{
  "id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
  "key": {
    "item_id": "2112089652",
    "tenant": "stillness"
  },
  "tribe_id": 1000167,
  "character_address": "0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f",
  "metadata": {
    "assembly_id": "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a",
    "name": "Kivik",
    "description": "",
    "url": ""
  },
  "owner_cap_id": "0x8479c0279f0197fe29987074d514a54c8881adc1f0557a3b556689ad838c067f"
}
```

---

## GraphQL Queries Used

### Query PlayerProfile by Wallet
```graphql
query {
  address(address: "0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f") {
    objects(last: 10, filter: { type: "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile" }) {
      nodes {
        address
        contents {
          type { repr }
          json
        }
      }
    }
  }
}
```

### Query Character Object
```graphql
query {
  object(address: "0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a") {
    address
    version
    asMoveObject {
      contents {
        type { repr }
        json
      }
    }
  }
}
```

---

## Config Recommendations

### Option 1: Environment Variable Override (Recommended)
Do not change `config.toml`. Use environment variables to switch environments:

**PowerShell:**
```powershell
$env:EFREP_EVE_PLAYER_PROFILE_TYPE="0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile"
cargo run --bin efrep-indexer
```

**Bash:**
```bash
export EFREP_EVE_PLAYER_PROFILE_TYPE="0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile"
cargo run --bin efrep-indexer
```

### Option 2: Document Stillness Values
Keep Utopia as default in `config.toml`, document Stillness values for manual switching:

```toml
[eve]
enabled            = true
world_api_base     = "https://world-api-utopia.uat.pub.evefrontier.com"
graphql_url        = "https://graphql.testnet.sui.io/graphql"
world_package_id   = "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75"
player_profile_type = "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75::character::PlayerProfile"

# Stillness (Live) — uncomment and comment Utopia above to switch:
# world_package_id   = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c"
# player_profile_type = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile"
```

### Option 3: Multi-Environment Support (Future)
If the application needs to resolve identities across both Utopia and Stillness simultaneously, consider:
- Adding a `stillness_player_profile_type` config field
- Querying both type strings and returning whichever matches
- Or adding an environment selector to the identity endpoint (`?env=utopia|stillness`)

---

## Comparison: Utopia vs Stillness

| Property | Utopia (Sandbox) | Stillness (Live) |
|----------|------------------|------------------|
| World Package | `0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75` | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c` |
| PlayerProfile Type | `0xd12a...f75::character::PlayerProfile` | `0x28b497...48c::character::PlayerProfile` |
| GraphQL Endpoint | `graphql.testnet.sui.io/graphql` | `graphql.testnet.sui.io/graphql` |
| Sui Network | Testnet | Testnet |
| Test Wallet Result | `not_found` | **resolved** |

---

## Open Questions

- **Q:** Will Stillness move to Sui mainnet in the future?
- **Q:** Should the identity endpoint auto-detect which environment a wallet belongs to?
- **Q:** Should tribe_id resolution be added to the identity endpoint (requires Character object query)?

---

## Verification Checklist

- [x] Stillness world package ID recovered (64-char hex)
- [x] Stillness PlayerProfile type string constructed
- [x] GraphQL endpoint confirmed (same as Utopia)
- [x] Test wallet resolves to PlayerProfile
- [x] character_id extracted from PlayerProfile
- [x] tribe_id extracted from Character object (`1000167`)
- [x] Raw JSON shapes documented
- [x] Config recommendations provided
