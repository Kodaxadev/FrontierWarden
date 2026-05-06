# Phase 2: Character â†’ Wallet â†’ Reputation Profile Mapping

## Implementation Plan â€” Full-Stack Audit & Execution Checklist

---

## 1. CURRENT-STATE FINDINGS

### 1.1 Where EveIdentity Is Currently Fetched & Stored

| Layer | File | What Happens |
|-------|------|--------------|
| **Indexer DB** | `migrations/0010_eve_world_data.sql` | `eve_identities` table: `wallet PK â†’ player_profile_object, character_id, character_object, tribe_id, frontierwarden_profile_id, raw` |
| **Indexer DB** | `migrations/0011_eve_identity_status.sql` | Adds `identity_status TEXT` column |
| **Indexer DB** | `migrations/0012_eve_identity_character_fields.sql` | Adds `character_name, tenant, item_id` columns |
| **Indexer API** | `src/api_eve.rs:241` â†’ `identity()` | `GET /eve/identity/:wallet` â€” returns `EveIdentity` JSON. Attempts cached lookup first, then Sui GraphQL resolve, falls back to "unresolved" |
| **Indexer resolver** | `src/eve_identity/resolver.rs` | `resolve_identity_via_graphql()` â†’ fetches `PlayerProfile` by wallet â†’ extracts `character_id` â†’ fetches `Character` object â†’ resolves `tribe_id`, `character_name`, `tenant`, `item_id` |
| **Indexer parser** | `src/eve_identity/parser.rs` | Parses GraphQL response to extract `player_profile_object`, `character_id`, `tribe_id` |
| **Indexer client** | `src/eve_identity/client.rs` | `fetch_player_profile()` â†’ Sui GraphQL query on wallet-owned objects filtered by `player_profile_type`. `fetch_character_object()` â†’ Sui GraphQL query by `character_id` object address |
| **Indexer DB ops** | `src/eve_identity/db.rs` | `resolve_cached_identity()`, `upsert_identity()`, `resolve_fw_profile_id()`, `resolve_tribe_name()` |
| **Frontend API** | `src/lib/api.ts:309` | `fetchEveIdentity(wallet)` â†’ `GET /eve/identity/:wallet?refresh=true` |
| **Frontend hook** | `src/hooks/useFrontierWardenData.ts:307-310` | Fetches identity for connected wallet on data refresh; stores in `eveIdentity` state. Now exposed in return value. |
| **Frontend types** | `src/types/api.types.ts:323-337` | `EveIdentity` interface mirrors Rust struct exactly |
| **Frontend views** | `SocialIdentityPanel.tsx`, `TrustIdentityStrip.tsx`, `ReputationView.tsx` | Display resolved identity fields when `identity_status === 'resolved'` |
| **Node Sentinel** | `useNodeSentinel.ts`, `SentinelIdentityGraph.tsx` | Transforms EveIdentity into `CharacterTrustProfile[]` chain visualization |

### 1.2 Does `character_id` Exist in Current API Responses?

**YES â€” conditionally.** The full chain already exists:

```
Wallet â†’ (GraphQL) â†’ PlayerProfile â†’ character_id â†’ (GraphQL) â†’ Character Object
                                                               â†’ character_name
                                                               â†’ tribe_id â†’ tribe_name
                                                               â†’ tenant
                                                               â†’ item_id
```

**However**, it only resolves when:
- EVE GraphQL endpoint is configured (`EveConfig.enabled = true`, `player_profile_type` is set)
- The wallet owns a `PlayerProfile` object of the configured Move type
- The PlayerProfile contains a `character_id` field
- The Character object is fetchable and contains `metadata.name`

**Current `identity_status` values:**
- `resolved` â€” full chain available
- `not_found` â€” no PlayerProfile owned by wallet
- `package_unknown` â€” `player_profile_type` not configured
- `graphql_error` â€” GraphQL fetch failed
- `unresolved` â€” fallback, only FW profile if any

### 1.3 PlayerProfile / Character Mapping Data Availability

| Source | Available? | Notes |
|--------|-----------|-------|
| **Sui GraphQL** (indexed objects) | âœ… Yes | `address.objects` filtered by `player_profile_type` Move type repr |
| **EVE Frontier World API** | âœ… Partial | Ships have `owner_character_id`; tribes have `tribe_id`; no direct characterâ†’wallet mapping |
| **FrontierWarden indexer** | âœ… Cached | `eve_identities` table caches resolved identities |
| **On-chain Move protocol** | âŒ No | `ReputationProfile` has only `owner: address` â€” no character_id field |
| **Mock data** | âŒ No | `fw-data.ts` has no character mapping demo data |

---

## 2. WALLET-ONLY IDENTITY HOTSPOTS

### 2.1 Move Protocol (On-Chain)

| File | Struct/Function | Issue |
|------|----------------|-------|
| `profile.move:28-32` | `ReputationProfile { owner: address }` | **Owner is wallet address only.** No `character_id`, no `tribe_id`. |
| `vouch.move:37-45` | `Vouch { voucher: address, vouchee: address }` | Voucher/vouchee are wallet addresses. No character link. |
| `attestation.move` | `issuer: address, subject: address` | Attestations identify subjects by wallet address only. |
| `lending.move` | `borrower: address, lender: address` | Loans identify parties by wallet. |
| `system_sdk.move` | `SystemAttestationEvent { subject: address }` | System attestations use wallet. |
| `oracle_registry.move` | `oracle_address: address` | Oracles identified by wallet. |

**Impact:** The on-chain protocol **fundamentally cannot** resolve characterâ†’wallet. This mapping lives off-chain in the Sui object graph (PlayerProfile objects owned by wallets). The indexer must bridge this gap.

### 2.2 Indexer Database

| Table | Column | Issue |
|-------|--------|-------|
| `profiles` | `owner VARCHAR(66)` | Wallet only. No character_id column. |
| `score_cache` | `profile_id, issuer` | Profile_id is on-chain object address. No character link. |
| `attestations` | `issuer, subject` | Wallet addresses. |
| `vouches` | `voucher, vouchee` | Wallet addresses. |
| `loans` | `borrower, lender` | Wallet addresses. |
| `eve_identities` | Full chain | âœ… Already has character_id, character_name, tribe_id, etc. |

**Gap:** The `eve_identities` table is **only populated on-demand** when `GET /eve/identity/:wallet` is called. There is no batch/background resolution. Other tables (profiles, attestations, vouches) do not join to eve_identities.

### 2.3 Indexer API

| Endpoint | Issue |
|----------|-------|
| `GET /scores/:profile_id` | Returns profile_id (object address), no character enrichment |
| `GET /profiles/by-owner/:address` | Wallet lookup, returns wallet-keyed row |
| `GET /profiles/:address/vouches` | Vouchee is wallet address, no character enrichment |
| `GET /profiles/:address/given-vouches` | Voucher is wallet address |
| `GET /leaderboard/:schema_id` | Returns `profile_id, value, issuer` â€” no character data |
| `GET /attestations/:subject` | Subject is wallet address |
| `POST /trust/evaluate` | Entity is wallet address. No identity resolution in trust path. |
| `GET /challenges/*` | Challenger/oracle are wallet addresses |
| `GET /eve/identity/:wallet` | âœ… Already resolves full chain |

**Critical gap:** Trust evaluation (`POST /trust/evaluate`) receives a wallet address and evaluates scores/attestations by wallet â€” it never resolves or considers character identity. A player with multiple wallets could have fragmented trust.

### 2.4 Frontend

| File | Issue |
|------|-------|
| `fw-data.ts:5-12` | `FwPilot` has `characterName?: string | null` but it's **optional** and only populated when identity resolves |
| `fw-data.ts:77-81` | Demo data has **no character fields** â€” only wallet handles like `[DEMO] PILOT#0041` |
| `useFrontierWardenData.ts` | Identity fetched only for connected wallet. Counterparties (vouchers, attestation subjects) have **no identity resolution**. |
| `TrustConsoleView.tsx` | Fetches identity for evaluation subject, but only for display â€” doesn't affect trust decision |
| `useNodeSentinel.ts` | Derives `CharacterTrustProfile[]` but counterparties from vouches have `hasCharacterMapping: false` always |
| `SentinelIdentityGraph.tsx` | Shows `âš  UNMAPPED` for all profiles without character binding â€” working as designed |
| All transaction hooks | Use wallet address from `useCurrentAccount()` â€” correct for Sui, but no character context |

---

## 3. MISSING DATA CONTRACTS

### 3.1 No Batch Identity Resolution
The indexer only resolves identities on-demand per `GET /eve/identity/:wallet`. There is no background job to pre-resolve identities for all known wallets (profile owners, attestation subjects, vouchers, etc.).

### 3.2 No Characterâ†’Wallet Reverse Lookup
Given a character_id, there is no API to find the associated wallet. The `eve_identities` table has an index on `character_id`, but no API endpoint exposes this.

### 3.3 No Multi-Wallet Aggregation
A player could own multiple wallets, each with different ReputationProfiles. The system has no concept of "same player, different wallets." Identity is 1:1 walletâ†’character, not N:1.

### 3.4 No Identity Enrichment on Existing API Responses
Leaderboards, attestation feeds, vouch lists, and challenge data return raw wallet addresses. The frontend must make N+1 identity calls to resolve character names.

### 3.5 No Character Data in Demo/Mock Data
`fw-data.ts` demo pilot and gate data use synthetic wallet handles. No character_id, tribe_id, or character_name in mock data.

---

## 4. PROPOSED SCHEMA/TYPE CHANGES

### 4.1 Indexer: New Migration `0015_identity_enrichment.sql`

```sql
-- Materialized view: wallet â†’ character enrichment for API responses
CREATE MATERIALIZED VIEW wallet_character_map AS
SELECT
  ei.wallet,
  ei.character_id,
  ei.character_name,
  ei.tribe_id,
  ei.tribe_name,
  ei.identity_status,
  p.profile_id AS frontierwarden_profile_id
FROM eve_identities ei
LEFT JOIN profiles p ON p.owner = ei.wallet
WHERE ei.identity_status = 'resolved';

CREATE UNIQUE INDEX idx_wallet_character_map_wallet ON wallet_character_map (wallet);
CREATE INDEX idx_wallet_character_map_character ON wallet_character_map (character_id);

-- Background resolution queue
CREATE TABLE identity_resolution_queue (
  wallet VARCHAR(66) PRIMARY KEY,
  source TEXT NOT NULL,           -- 'profile_created', 'attestation_subject', 'vouch_party'
  priority INT NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

### 4.2 Indexer: New Rust Types

```rust
// Enriched identity for API responses (subset of full EveIdentity)
#[derive(Serialize)]
pub struct IdentityEnrichment {
    pub wallet: String,
    pub character_id: Option<String>,
    pub character_name: Option<String>,
    pub tribe_id: Option<String>,
    pub tribe_name: Option<String>,
    pub identity_status: String,
}
```

### 4.3 Frontend: Updated Types

```typescript
// api.types.ts â€” add enrichment fields to existing response types
export interface EnrichedLeaderboardEntry {
  profile_id: string;
  value: number;
  issuer: string;
  identity?: IdentityEnrichment | null;
}

export interface IdentityEnrichment {
  wallet: string;
  character_id: string | null;
  character_name: string | null;
  tribe_id: string | null;
  tribe_name: string | null;
  identity_status: string;
}

// fw-data.ts â€” add character fields to FwPilot and demo data
export interface FwPilot {
  // ...existing fields...
  characterId?: string | null;
  characterName?: string | null;
  tribeId?: string | null;
  tribeName?: string | null;
  identityStatus?: string;
}
```

### 4.4 Node Sentinel Types (Already Correct)

`node-sentinel.types.ts` already models `CharacterTrustProfile` with `hasCharacterMapping: boolean` â€” no changes needed. The hook `useNodeSentinel.ts` correctly degrades when mapping is missing.

---

## 5. API CHANGES

### 5.1 New Endpoint: Batch Identity Resolution

```
POST /eve/identity/batch
Body: { wallets: string[] }
Response: Record<string, IdentityEnrichment>
```

Resolves up to 50 wallets in one call. Uses cached identities; queues unresolved for background processing.

### 5.2 Enriched Leaderboard

```
GET /leaderboard/:schema_id?enrich=true
```

Joins `score_cache` with `wallet_character_map` to return `identity` alongside score.

### 5.3 Enriched Attestation Feed

```
GET /attestations/:subject?enrich=true
GET /attestations/feed?schema_id=...&enrich=true
```

Enriches `issuer` and `subject` with identity data.

### 5.4 Character Reverse Lookup

```
GET /eve/identity/by-character/:character_id
```

Returns `EveIdentity` for a character_id (uses `idx_eve_identities_character` index).

### 5.5 Trust Evaluation: Identity Context

```
POST /trust/evaluate
Body: { entity: "wallet_or_character_id", ... }
```

If entity looks like a character_id (not a 0x-prefixed address), resolve to wallet first. Include `identity_enrichment` in response alongside existing fields.

### 5.6 Background Resolution Job

New binary or cron task: `resolve_pending_identities`
- Reads `identity_resolution_queue` WHERE `resolved_at IS NULL`
- Calls `resolve_identity_via_graphql()` for each
- Refreshes `wallet_character_map` materialized view

---

## 6. FRONTEND CHANGES

### 6.1 Files That Must Change

| File | Change |
|------|--------|
| `api.types.ts` | Add `IdentityEnrichment`, `EnrichedLeaderboardEntry`; extend `VouchRow` with optional identity |
| `api.ts` | Add `fetchBatchIdentities()`, add `?enrich=true` to existing calls |
| `fw-data.ts` | Add character fields to `FwPilot`; update demo data with realistic character mock data |
| `useFrontierWardenData.ts` | After initial data load, batch-resolve identities for all known wallets (vouchers, attestation subjects) |
| `useNodeSentinel.ts` | Use resolved identity data to populate `CharacterTrustProfile.hasCharacterMapping` from actual resolution state |
| `SentinelIdentityGraph.tsx` | No structural changes needed â€” already handles mapped/unmapped correctly |
| `ReputationView.tsx` | Display character name from enriched data instead of making separate identity calls |
| `SocialIdentityPanel.tsx` | Use pre-fetched identity instead of on-demand call |
| `TrustConsoleView.tsx` / `TrustIdentityStrip.tsx` | Use pre-fetched identity; show identity enrichment in trust results |
| `FwHeader.tsx` | Show character name when available instead of demo name |
| `WalletStandingIssuerPanel.tsx` | Enrich issuer display with character names |
| `LeaderboardPanel.tsx` | Show character names alongside wallet addresses |
| `KillboardView.tsx` | Enrich victim/killer with character identity |

### 6.2 Demo Data Update

```typescript
// fw-data.ts â€” example enriched demo pilot
pilot: {
  name: '[DEMO] Vex Korith',
  handle: '[DEMO] PILOT#0041',
  characterId: '[DEMO] 0x0041abc...def',
  characterName: '[DEMO] Vex Korith',
  tribeId: '[DEMO] TRIBE#0007',
  tribeName: '[DEMO] Iron Resonance Compact',
  identityStatus: 'resolved',
  // ...rest
}
```

---

---

## Appendix

The Sentinel UI change notes, execution checklist, and file manifest live in [PHASE2_CHARACTER_MAPPING_APPENDIX.md](PHASE2_CHARACTER_MAPPING_APPENDIX.md) to keep this plan under the repo line limit.
