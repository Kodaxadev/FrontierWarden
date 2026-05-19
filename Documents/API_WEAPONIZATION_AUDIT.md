# API Weaponization Audit

**Date:** 2026-05-19
**Branch:** `codex/api-weaponization-audit`
**Scope:** All public HTTP endpoints on the EFRep indexer (Railway production)

---

## Purpose

Audit every public API surface for aggregation, targeting, scraping, identity-linking,
and movement-tracking risk. Recommend mitigations. Implement low-risk fixes that do
not remove useful functionality.

FrontierWarden is operator decision-support infrastructure, not a social-score platform.
API surfaces must not enable adversaries to mass-profile pilots, construct movement
graphs, or weaponize reputation data against individuals.

---

## Existing Protections

| Protection | Detail |
|---|---|
| Global rate limit | 300 req/min per client (keyed by API-key hash > x-forwarded-for > x-real-ip) |
| CORS | Restricted to explicit origins via `EFREP_ALLOWED_ORIGINS` |
| Limit clamps | Most list endpoints default 50, max 200 |
| Cursor pagination | Kill mails use cursor-based pagination |
| Auth routes | `/auth/*` are POST-only, nonce-gated |
| Trust evaluation | POST-only, structured request body |

---

## Endpoint Risk Inventory

### LOW risk (metadata, bounded, no PII)

| Endpoint | Default | Max | Notes |
|---|---|---|---|
| `GET /health` | — | — | Status + uptime only |
| `GET /schemas` | 100 | 500 | Schema metadata |
| `GET /oracles` | 100 | 500 | Oracle metadata |
| `GET /eve/status` | — | — | Aggregate counts |
| `GET /eve/solarsystems` | 500 | 2000 | Public world data |
| `GET /eve/solarsystems/{id}` | — | — | Single lookup |
| `GET /eve/tribes` | 500 | 2000 | Public world data |
| `GET /eve/tribes/{id}` | — | — | Single lookup |
| `GET /eve/types` | 500 | 2000 | Public world data |
| `GET /eve/types/{id}` | — | — | Single lookup |
| `GET /intel/{system_id}` | — | — | Single system, 7 schema slots max |
| `GET /v1/trust/config` | — | — | Default schema names |
| `POST /auth/nonce` | — | — | Session auth flow |
| `POST /auth/session` | — | — | Session auth flow |

### MEDIUM risk (exposes addresses, bounded)

| Endpoint | Default | Max | Risk | Notes |
|---|---|---|---|---|
| `GET /attestations` | 50 | 200 | Issuer+subject addresses | Feed, bounded |
| `GET /attestations/{subject}` | 50 | 200 | Issuer addresses for subject | Bounded |
| `GET /challenges` | 50 | 200 | Challenger+oracle addresses | Bounded |
| `GET /challenges/stats` | — | — | Aggregate only | Low |
| `GET /challenges/{id}` | — | — | Single lookup | Low |
| `GET /challenges/by-challenger/{addr}` | 50 | 200 | Per-address history | Bounded |
| `GET /oracles/{oracle}/challenges` | 50 | 200 | Per-oracle history | Bounded |
| `GET /scores/{profile_id}` | — | — | Single profile scores | Low |
| `GET /scores/{profile_id}/{schema_id}` | — | — | Single score | Low |
| `GET /profiles/{id}/vouches` | 50 | 200 | Vouch graph edges | Bounded |
| `GET /profiles/by-owner/{addr}` | — | — | Address to profile | Single |
| `GET /profiles/{addr}/given-vouches` | 50 | 200 | Outbound vouch graph | Bounded |
| `GET /gates/{gate_id}` | — | — | Single gate summary | Low |
| `GET /gates/{gate_id}/policy` | — | — | Single policy | Low |
| `GET /gates/{id}/binding-status` | — | — | Single binding | Low |
| `GET /gates/{gate_id}/passages` | 50 | 200 | Traveler addresses | Bounded |
| `GET /gates/{gate_id}/withdrawals` | 50 | 200 | Owner + amounts | Bounded |
| `POST /v1/trust/evaluate` | — | — | Single evaluation | POST-gated |
| `POST /v1/trust/explain` | — | — | Single explanation | POST-gated |
| `POST /v1/cradleos/gate/evaluate` | — | — | Single evaluation | POST-gated |
| `GET /world/gates/{gate_id}/links` | — | — | Topology (bounded by link count) | Low |
| `GET /world/gates/{gate_id}/activity` | — | — | Aggregate counts | Low |
| `GET /world/gates/{gate_id}` | — | — | Single gate summary | Low |

### HIGH risk (movement tracking, identity linking, targeting)

| Endpoint | Default | Max | Risk Category | Mitigation Applied |
|---|---|---|---|---|
| `GET /gates` | 200 | **500** | Scraping — enumerate all gates | **FIXED: was unbounded** |
| `GET /world/gates` | 200 | **500** | Scraping — enumerate all gates per tenant | **FIXED: was unbounded** |
| `GET /attestations/singleton/{item_id}` | 50 | **200** | Scraping — dump all singletons for item | **FIXED: was unbounded** |
| `POST /eve/identity/batch` | — | **50 wallets** | Identity linking — mass wallet→character | **FIXED: was unbounded array** |
| `GET /world/characters/{id}/jumps` | 50 | **200** | Movement tracking — full jump history | **FIXED: max was 500** |
| `GET /world/gates/{gate_id}/jumps` | 50 | **200** | Movement tracking — who passed through | **FIXED: max was 500** |
| `GET /eve/ships` | 500 | 2000 | Identity linking — owner_character_id | Existing; consider redaction |
| `GET /eve/identity/{wallet}` | — | — | Identity resolution — single wallet | Existing; rate-limited |
| `GET /eve/identity/by-character/{id}` | — | — | Reverse identity resolution | Existing; rate-limited |
| `GET /leaderboard/{schema_id}` | 50 | 200 | Targeting — enumerate low-score pilots | Existing; bounded |
| `GET /kill-mails` | 50 | 200 | Combat profiling | Existing; cursor pagination |
| `GET /world/characters/{addr}/kills` | 50 | 200 | Per-pilot kill history | Existing; bounded |
| `GET /world/characters/{addr}/losses` | 50 | 200 | Per-pilot loss history | Existing; bounded |
| `GET /world/systems/{id}/kills` | 50 | 200 | Per-system kill history | Existing; bounded |

---

## Fixes Applied (this branch)

### 1. `GET /gates` — added LIMIT (was unbounded)
- **File:** `api_gates.rs`
- **Before:** No LIMIT clause; returned ALL gate summaries
- **After:** Default 200, max 500 via `LimitParams`
- **Impact:** Prevents full gate enumeration in a single request

### 2. `GET /world/gates` — added LIMIT (was unbounded)
- **File:** `api_world_gates.rs`
- **Before:** No LIMIT clause; returned ALL gates for a tenant
- **After:** Default 200, max 500 via query param
- **Impact:** Prevents full world-gate dump in a single request

### 3. `GET /attestations/singleton/{item_id}` — added LIMIT (was unbounded)
- **File:** `api_attestations.rs`
- **Before:** No LIMIT clause; returned ALL singleton attestations for an item
- **After:** Default 50, max 200 via `AttestationFilter`
- **Impact:** Prevents unbounded singleton attestation dumps

### 4. `POST /eve/identity/batch` — capped wallets array at 50
- **File:** `api_eve.rs`
- **Before:** No limit on `wallets` array size; enabled mass identity resolution
- **After:** Returns 400 if `wallets.len() > 50`
- **Impact:** Forces paginated batch requests; limits identity-linking throughput

### 5. Jump endpoint MAX_LIMIT lowered from 500 to 200
- **File:** `api_world_gate_traffic.rs`
- **Before:** `MAX_LIMIT = 500` for all jump endpoints
- **After:** `MAX_LIMIT = 200`
- **Impact:** Reduces movement-history scraping value per request
- **Test update:** `world_gate_traffic_api_tests.rs` assertions updated

---

## Recommended Follow-Up Branches

These items require product decisions or larger changes and are out of scope for
this surgical audit patch.

### Branch: `codex/api-endpoint-rate-limits`
Add per-endpoint rate limiting for high-risk endpoints. Currently the 300/min
limit is global per client. Identity and jump endpoints should have tighter
per-endpoint windows (e.g., 30/min for `/eve/identity/batch`, 60/min for
character jump history).

### Branch: `codex/ship-owner-redaction`
The `/eve/ships` endpoint exposes `owner_character_id` which enables
wallet→character→ship ownership graphs. Consider redacting this field from
the list endpoint and only exposing it on the single-ship lookup, or behind
an operator session.

### Branch: `codex/leaderboard-floor-guard`
The `/leaderboard/{schema_id}` endpoint allows enumerating pilots ranked by
score. An adversary could use this to target low-reputation pilots. Consider
omitting pilot identifiers below a configurable score floor, or requiring
an operator session for full leaderboard access.

### Branch: `codex/movement-graph-access-control`
Character jump history (`/world/characters/{id}/jumps`) is the most
weaponizable endpoint. Consider gating it behind operator session auth
so only authenticated operators can query movement patterns.

### Branch: `codex/pagination-cursor-migration`
Several endpoints use limit/offset pagination which allows random-access
scraping. Migrating to cursor-based pagination (as kill-mails already use)
would force sequential access and make bulk scraping slower.

---

## Validation

```
cargo build          — clean (0 warnings)
cargo test           — 160 passed, 2 ignored, 0 failed
git diff --check     — no whitespace errors
git diff --stat      — 6 indexer files only (no frontend, no Move)
```
