# Phase 2 Character Mapping Appendix

Companion to [PHASE2_CHARACTER_MAPPING_PLAN.md](PHASE2_CHARACTER_MAPPING_PLAN.md).

## 7. SENTINEL UI CHANGES

### 7.1 How Node Sentinel Should Degrade When Character Mapping Is Missing

The current implementation **already handles this correctly** via:

| State | Current Behavior | Phase 2 Behavior |
|-------|-----------------|-----------------|
| **No identity resolved** | Shows `âš  UNMAPPED`, `NO CHARACTER BINDING` tag | Same â€” no change |
| **identity_status = 'not_found'** | Shows as unmapped in graph | Add explicit "NO PLAYERPROFILE ON-CHAIN" message |
| **identity_status = 'package_unknown'** | Falls through to unmapped | Add "EVE IDENTITY MODULE NOT CONFIGURED" notice |
| **identity_status = 'graphql_error'** | Falls through to unmapped | Add "GRAPHQL RESOLUTION FAILED â€” RETRY" option |
| **Counterparty wallets** | Always unmapped (no resolution) | **NEW:** Batch-resolve and show resolved chains |
| **Enforcement blockers** | Shows `missing_character_mapping` | Keep â€” this is correct advisory behavior |

### 7.2 New Sentinel Capability: Perimeter Identity Resolution

After Phase 2, the Sentinel should:
1. Show resolved character names for all perimeter wallets (vouchers, attestation subjects)
2. Track identity resolution coverage as a metric: "12/18 WALLETS RESOLVED"
3. Flag wallets that cannot be resolved (no PlayerProfile) differently from wallets not yet attempted
4. Show a "RESOLVE IDENTITIES" action button to trigger batch resolution

---

## 8. RISKS & BLOCKERS

### 8.1 Critical Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| **EVE GraphQL endpoint availability** | If Sui GraphQL is down or rate-limited, no identity resolution | Cache aggressively; don't block trust decisions on identity |
| **PlayerProfile type changes between cycles** | If EVE Frontier changes the Move package, `player_profile_type` config breaks | Make configurable; log type repr mismatches |
| **Multi-wallet players** | Same character could create multiple wallets with separate profiles | Do NOT merge automatically â€” surface as a warning |
| **On-chain protocol has no character field** | Cannot add character_id to `ReputationProfile` without Move upgrade | Accept this â€” identity bridging is indexer-layer only |

### 8.2 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **N+1 identity resolution queries** | Batch-resolve 50 wallets could be slow | Materialized view + background queue |
| **Stale cached identities** | Player changes tribe/character but cache is old | Add `synced_at` check; allow `?refresh=true` |
| **Demo data doesn't exercise character path** | Phase 2 UI untestable without live data | Update mock data with realistic character chains |

---

## 9. ORDERED EXECUTION CHECKLIST

### Phase 2A â€” Backend Foundation (Indexer)

- [ ] **2A.1** â€” Write migration `0015_identity_enrichment.sql` (materialized view + queue table)
- [ ] **2A.2** â€” Add `IdentityEnrichment` struct to `eve_identity/types.rs`
- [ ] **2A.3** â€” Add `resolve_identities_batch()` to `eve_identity/db.rs` (reads `wallet_character_map`)
- [ ] **2A.4** â€” Add `POST /eve/identity/batch` endpoint to `api_eve.rs`
- [ ] **2A.5** â€” Add `GET /eve/identity/by-character/:character_id` endpoint
- [ ] **2A.6** â€” Add `?enrich=true` support to `api_reputation.rs` leaderboard endpoint
- [ ] **2A.7** â€” Add `?enrich=true` support to `api_attestations.rs` feed endpoint
- [ ] **2A.8** â€” Add identity queue population in event processor (when ProfileCreated, AttestationIssued, VouchCreated events arrive, queue the wallet for identity resolution)
- [ ] **2A.9** â€” Write `resolve_pending_identities` background task (bin or scheduled job)
- [ ] **2A.10** â€” Refresh `wallet_character_map` materialized view on identity upsert

### Phase 2B â€” Frontend Types & API Layer

- [ ] **2B.1** â€” Add `IdentityEnrichment` to `api.types.ts`
- [ ] **2B.2** â€” Add `fetchBatchIdentities()` to `api.ts`
- [ ] **2B.3** â€” Update `fetchLeaderboard()` to support `?enrich=true` and enriched response type
- [ ] **2B.4** â€” Update `fetchAttestationFeed()` to support `?enrich=true`
- [ ] **2B.5** â€” Update `FwPilot` in `fw-data.ts` with character fields + update demo data

### Phase 2C â€” Frontend Data Layer

- [ ] **2C.1** â€” Update `useFrontierWardenData.ts` to batch-resolve identities for all known wallets after initial data load
- [ ] **2C.2** â€” Store resolved identities map in hook state: `Record<string, IdentityEnrichment>`
- [ ] **2C.3** â€” Pass identity map through to views

### Phase 2D â€” Node Sentinel Integration

- [ ] **2D.1** â€” Update `useNodeSentinel.ts` to use resolved identity map for perimeter wallet enrichment
- [ ] **2D.2** â€” Add resolution coverage metric to `TrustPerimeter` type
- [ ] **2D.3** â€” Update `SentinelIdentityGraph.tsx` to differentiate "not resolved yet" vs "no PlayerProfile exists"
- [ ] **2D.4** â€” Add identity resolution coverage display to `SentinelNodeStatus.tsx`

### Phase 2E â€” View Updates

- [ ] **2E.1** â€” Update `ReputationView.tsx` to use pre-fetched identity
- [ ] **2E.2** â€” Update `FwHeader.tsx` to show character name when resolved
- [ ] **2E.3** â€” Update `LeaderboardPanel.tsx` to show character names
- [ ] **2E.4** â€” Update `KillboardView.tsx` to enrich victim/killer
- [ ] **2E.5** â€” Update `SocialIdentityPanel.tsx` to use pre-fetched identity
- [ ] **2E.6** â€” Update `TrustConsoleView.tsx` to show enriched identity in results

### Phase 2F â€” Trust Evaluation Enhancement (Optional, Lower Priority)

- [ ] **2F.1** â€” Accept character_id as entity in trust evaluation request (resolve to wallet server-side)
- [ ] **2F.2** â€” Include `identity_enrichment` in `TrustEvaluationResponse`
- [ ] **2F.3** â€” Add warning code `SUBJECT_IDENTITY_UNRESOLVED` when character mapping unavailable

---

## 10. FILE MANIFEST

### Must Modify

| File | Layer |
|------|-------|
| `indexer/migrations/` (new 0015) | DB |
| `indexer/src/eve_identity/types.rs` | Indexer |
| `indexer/src/eve_identity/db.rs` | Indexer |
| `indexer/src/api_eve.rs` | Indexer API |
| `indexer/src/api_reputation.rs` | Indexer API |
| `indexer/src/api_attestations.rs` | Indexer API |
| `frontend/src/types/api.types.ts` | Frontend |
| `frontend/src/lib/api.ts` | Frontend |
| `frontend/src/components/features/frontierwarden/fw-data.ts` | Frontend |
| `frontend/src/hooks/useFrontierWardenData.ts` | Frontend |
| `frontend/src/hooks/useNodeSentinel.ts` | Frontend |
| `frontend/src/types/node-sentinel.types.ts` | Frontend |
| `frontend/src/components/features/frontierwarden/sentinel/SentinelIdentityGraph.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/sentinel/SentinelNodeStatus.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/ReputationView.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/FwHeader.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/TrustConsoleView.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/SocialIdentityPanel.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/TrustIdentityStrip.tsx` | Frontend |

### May Modify (Enrichment Pass)

| File | Layer |
|------|-------|
| `frontend/src/components/features/LeaderboardPanel.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/KillboardView.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/WalletStandingIssuerPanel.tsx` | Frontend |
| `frontend/src/components/features/frontierwarden/views/ContractsView.tsx` | Frontend |
| `indexer/src/trust_types.rs` | Indexer (Phase 2F) |
| `indexer/src/trust_response.rs` | Indexer (Phase 2F) |

### No Changes Needed

| File | Reason |
|------|--------|
| `sources/*.move` | On-chain protocol stays wallet-only; bridging is indexer-layer |
| `frontend/src/components/features/frontierwarden/sentinel/sentinel.css` | Styling already handles mapped/unmapped states |
| `frontend/src/components/features/frontierwarden/sentinel/SentinelAccessRisk.tsx` | Not identity-dependent |
| `frontend/src/components/features/frontierwarden/sentinel/SentinelWarnings.tsx` | Already surfaces identity warnings correctly |
| `frontend/src/components/features/frontierwarden/sentinel/SentinelRecommendations.tsx` | Already recommends `REQUIRE_ATTESTATION` for missing mappings |
