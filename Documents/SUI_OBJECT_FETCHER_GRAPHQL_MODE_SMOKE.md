# Sui Object Fetcher — GraphQL Mode Smoke Results

**Date:** 2026-05-17
**Branch:** `codex/sui-object-fetcher-graphql-mode-smoke`
**Preceded by:** PR #49 (`codex/sui-object-fetcher-graphql-mode`) — added `VITE_SUI_OBJECT_FETCHER_MODE` switch
**Scope:** Document local and preview GraphQL mode results before promoting to production default

> **Rule:** No code changes on this branch unless fixing a confirmed GraphQL-mode bug discovered
> during this smoke. The branch is a record, not a patch queue.

---

## Test Sequence

Promotion gates must be passed in order. Do not skip stages.

| Stage | Env | Mode | Gate |
|---|---|---|---|
| 1 | Local dev | `shadow` | Shadow logs show `✓ semantic match` for all operator flows |
| 2 | Local dev | `graphql` | All operator flows pass — no missing refs, no tx builder errors |
| 3 | Vercel preview | `graphql` | Same as stage 2 against deployed preview URL |
| 4 | Production | `shadow` | Shadow logs show `✓ semantic match` — no `✗` entries in prod console |
| 5 | Production | `graphql` | Only after stages 1–4 pass — GraphQL becomes live return path in prod |

---

## Environment Variables

```
# Local .env.local — set ONE of these, not multiple
VITE_SUI_OBJECT_FETCHER_MODE=jsonrpc    # default, JSON-RPC only
VITE_SUI_OBJECT_FETCHER_MODE=shadow    # JSON-RPC returned; GraphQL fires in background
VITE_SUI_OBJECT_FETCHER_MODE=graphql   # GraphQL is the live return path

# Legacy alias — still works, maps to shadow
VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true
```

Vercel preview: set via `vercel env add VITE_SUI_OBJECT_FETCHER_MODE preview`.
Production: set via `vercel env add VITE_SUI_OBJECT_FETCHER_MODE production` — only after all gates pass.

---

## Operator Flows — Smoke Checklist

Run with a connected wallet that owns an EVE Frontier PlayerProfile on Stillness testnet.
Network: `VITE_SUI_NETWORK=testnet`.

### Pass Criteria (all flows)

- No missing object refs (`objectId`, `authorizedObjectId`, `characterId` all non-null)
- No missing `initialSharedVersion` (shared objects: GatePolicy, OracleRegistry, World Gate)
- No owner mismatch between expected wallet address and returned `owner` field
- No tx builder failures (PTB construction reaches wallet popup without error)
- No valibot / gRPC schema errors in console
- No Sui client passed into `tx.build()` (would surface as valibot error in dapp-kit)

### Flow Results

#### 1. Operator Gate Authority discovery

`fetchOwnedObjectsByType(wallet, PlayerProfileType)` →
`fetchSuiObjectRaw(characterId)` per profile →
`fetchOwnedObjectsByType(wallet, OwnerCapType)` →
`fetchOwnedObjectsByType(characterId, OwnerCapType)` →
`fetchSuiObjectRaw(authorizedObjectId)` per cap

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| PlayerProfile objects found | ⬜ | ⬜ | ⬜ |
| Character objectId populated | ⬜ | ⬜ | ⬜ |
| Character name populated | ⬜ | ⬜ | ⬜ |
| OwnerCap objects found | ⬜ | ⬜ | ⬜ |
| Gate objectId populated | ⬜ | ⬜ | ⬜ |
| Gate status populated | ⬜ | ⬜ | ⬜ |
| Gate tenant/itemId populated | ⬜ | ⬜ | ⬜ |
| No console errors | ⬜ | ⬜ | ⬜ |

Notes:
<!-- fill in during smoke -->

---

#### 2. GatePolicy provisioning panel loads

Uses `SuiJsonRpcClient.getObject()` (not shadow-covered — out of mode scope).
Verify the panel renders and GatePolicy fields (threshold, toll, linked gate) are populated.

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| Panel renders without error | ⬜ | ⬜ | ⬜ |
| GatePolicy fields populated | ⬜ | ⬜ | ⬜ |

Notes:

---

#### 3. bind_world_gate tx builder reaches wallet

`fetchSuiObjectRaw` is used to resolve World Gate ref before PTB construction.

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| World Gate objectId resolved | ⬜ | ⬜ | ⬜ |
| initialSharedVersion present | ⬜ | ⬜ | ⬜ |
| Wallet popup reached | ⬜ | ⬜ | ⬜ |
| No valibot errors | ⬜ | ⬜ | ⬜ |

Notes:

---

#### 4. check_passage tx builder reaches wallet

`fetchSuiObjectRaw` resolves Gate and GatePolicy refs. `makeSuiJsonRpcClient()` resolves coins.

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| Gate ref resolved | ⬜ | ⬜ | ⬜ |
| GatePolicy initialSharedVersion present | ⬜ | ⬜ | ⬜ |
| Coin inputs resolved | ⬜ | ⬜ | ⬜ |
| Wallet popup reached | ⬜ | ⬜ | ⬜ |
| No valibot errors | ⬜ | ⬜ | ⬜ |

Notes:

---

#### 5. update_threshold tx builder reaches wallet

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| GatePolicy ref resolved | ⬜ | ⬜ | ⬜ |
| Wallet popup reached | ⬜ | ⬜ | ⬜ |
| No valibot errors | ⬜ | ⬜ | ⬜ |

Notes:

---

#### 6. Toll withdrawal tx builder reaches wallet

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| Gate ref resolved | ⬜ | ⬜ | ⬜ |
| Wallet popup reached | ⬜ | ⬜ | ⬜ |
| No valibot errors | ⬜ | ⬜ | ⬜ |

Notes:

---

#### 7. Extension auth panel resolves OwnerCap/Gate refs

| Check | Shadow | GraphQL local | GraphQL preview |
|---|---|---|---|
| OwnerCap found | ⬜ | ⬜ | ⬜ |
| Gate objectId populated | ⬜ | ⬜ | ⬜ |
| authorize_extension tx reaches wallet | ⬜ | ⬜ | ⬜ |
| No valibot errors | ⬜ | ⬜ | ⬜ |

Notes:

---

## Shadow Log Summary (Stage 1 — local shadow)

Run `npm --prefix frontend run dev` with `VITE_SUI_OBJECT_FETCHER_MODE=shadow`.
Open DevTools → Console → filter `sui-object-fetcher`.

Expected baseline: all objects with `id: UID`, `vector<u8>`, or nested struct fields log
`✓ semantic match (encoding diff)`. See `SUI_OBJECT_FETCHER_GRAPHQL_SHADOW_SMOKE.md` for
the full encoding difference catalogue (D1–D4).

| Object type | Log entry | Count | Notes |
|---|---|---|---|
| PlayerProfile | ⬜ `✓ match` / ⬜ `✓ semantic match (encoding diff)` / ⬜ `✗ mismatch` | | |
| Character | ⬜ `✓ match` / ⬜ `✓ semantic match (encoding diff)` / ⬜ `✗ mismatch` | | |
| OwnerCap | ⬜ `✓ match` / ⬜ `✓ semantic match (encoding diff)` / ⬜ `✗ mismatch` | | |
| Gate | ⬜ `✓ match` / ⬜ `✓ semantic match (encoding diff)` / ⬜ `✗ mismatch` | | |

**Any `✗ semantic mismatch [objectId,type,owner,...]` entry blocks promotion to stage 2.**

---

## Promotion Decision

| Stage | Result | Date | Notes |
|---|---|---|---|
| 1 — local shadow | ⬜ PASS / ⬜ FAIL / ⬜ PENDING | | |
| 2 — local graphql | ⬜ PASS / ⬜ FAIL / ⬜ PENDING | | |
| 3 — preview graphql | ⬜ PASS / ⬜ FAIL / ⬜ PENDING | | |
| 4 — prod shadow | ⬜ PASS / ⬜ FAIL / ⬜ PENDING | | |
| 5 — prod graphql | ⬜ PASS / ⬜ FAIL / ⬜ PENDING | | |

**Production GraphQL default:** set `VITE_SUI_OBJECT_FETCHER_MODE=graphql` in Vercel production
env only after stage 4 (prod shadow) passes with no `✗` entries and all operator flows confirmed.

---

## References

- `frontend/src/lib/sui-object-fetcher.ts` — mode switch implementation
- `Documents/SUI_OBJECT_FETCHER_GRAPHQL_SHADOW_SMOKE.md` — shadow parity baseline (encoding diffs D1–D4)
- `Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md` — Phase 2 migration plan
- `scripts/gql-smoke-compare.mjs` — run outside browser: `node scripts/gql-smoke-compare.mjs`
