# Utopia Dev Environment Readiness

**Date:** 2026-05-17
**Status:** Planning — Utopia restarted per Fanfest/community announcement.
All Utopia package IDs and checkpoints in this document are TBD until verified on-chain.

---

## Why Utopia is the Preferred Full-Flow Smoke Target

Stillness is the production EVE Frontier world. Building and operating there carries
real in-game logistics and social risk:

- Gates are persistent objects owned by characters. Acquiring or building a Gate in
  Stillness requires actual gameplay.
- The FW GatePolicy binding model requires `OwnerCap<Gate>`. On Stillness, Kivik
  (the operator account) has no `OwnerCap<Gate>`, which is why `BINDING VERIFIED`
  cannot be smoked end-to-end on Stillness today.
- Authorizing `gate::authorize_extension<FrontierWardenAuth>` on a Stillness Gate
  requires the world gate owner to submit a transaction, which is a social/diplomatic
  ask, not a development action.

Utopia is a developer sandbox world. It is expected to:

- Allow character creation and Gate acquisition without Stillness logistics.
- Provide a full-cycle path: create character → build/acquire Gate → get OwnerCap →
  bind GatePolicy → authorize FrontierWardenAuth → confirm BINDING VERIFIED.
- Be restartable and tolerant of developer-level testing activity.

**Rule:** Utopia smoke results are dev/test evidence only. They do not substitute for
Stillness production evidence and must never be labelled as such.

---

## Stillness vs Utopia Separation

| Dimension | Stillness | Utopia |
|---|---|---|
| World API base | `https://world-api-stillness.live.tech.evefrontier.com` | TBD (see below) |
| World package original ID | `0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c` | TBD — verify after restart |
| World package published-at | `0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780` | TBD |
| World start checkpoint | `308264360` | TBD |
| `world_tenant` value | `stillness` | `utopia` |
| FW package ID | `0xb43fcd...` (deployed) | TBD — separate deployment needed |
| FW `FrontierWardenAuth` typename | `0xb43fcd4e...::reputation_gate::FrontierWardenAuth` | TBD — Utopia package ID will differ |
| GraphQL / RPC | `https://graphql.testnet.sui.io/graphql` | Same (both on Sui testnet) |
| Database | Shared Supabase (production) | Must be isolated — see DB safeguard below |

### Pre-restart Utopia IDs (likely stale — do not use without verification)

The following appeared in `config.example.toml` before the Utopia restart:

```
world_package_id    = 0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75
player_profile_type = 0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75::character::PlayerProfile
```

These are from the pre-restart state. After restart the world package will have a
new published-at ID (and possibly a new original ID). Do not hardcode these anywhere.
Verify by querying the Utopia world API or checking the Sui testnet for the new
package deployment.

---

## Required Env Vars for a Utopia Profile

These must be sourced from the Utopia world after restart. All values marked TBD.

| Env var | Stillness (known) | Utopia (TBD) |
|---|---|---|
| `EFREP_EVE_WORLD_API_BASE` | `https://world-api-stillness.live.tech.evefrontier.com` | TBD |
| `EFREP_EVE_WORLD_PACKAGE_ID` | `0x28b497...448c` | TBD |
| `EFREP_WORLD_PKG_ORIGINAL_ID` | `0x28b497...448c` | TBD |
| `EFREP_WORLD_PKG_PUBLISHED_AT` | `0xd2fd12...4780` | TBD |
| `EFREP_WORLD_TENANT` | `stillness` | `utopia` |
| `EFREP_WORLD_START_CHECKPOINT` | `308264360` | TBD — first Utopia world event after restart |
| `EFREP_EVE_GRAPHQL_URL` | `https://graphql.testnet.sui.io/graphql` | Same (testnet) |
| `EFREP_PACKAGE_ID` | FW Stillness package ID | TBD — FW must be redeployed to Utopia |
| `EFREP_FW_GATE_AUTH_WITNESS` | `FrontierWardenAuth` | Same (witness name is stable across packages) |
| `EFREP_FW_GATE_EXTENSION_TYPENAME` | `0xb43fcd4e...::reputation_gate::FrontierWardenAuth` | TBD — depends on Utopia FW package ID |
| `EFREP_EVE_PLAYER_PROFILE_TYPE` | `0x28b497...::character::PlayerProfile` | TBD |

### Steps to resolve TBD values

1. Confirm the Utopia world API base URL from EVE Frontier developer documentation
   or Discord after the restart announcement.
2. Query `/info` or equivalent on the Utopia world API to get the current world
   package ID.
3. Deploy FW Move package to Sui testnet targeting Utopia world package.
4. Record the new published-at ID from the deployment transaction.
5. Find the first world event checkpoint in Utopia by querying the Sui fullnode for
   early `ExtensionAuthorizedEvent` or `GateLinkedEvent` events on the new package.

---

## Utopia Full-Flow Smoke Runbook

This runbook describes the full operator path that cannot be completed on Stillness
due to the Gate ownership blocker. All steps are dev/test only.

### Prerequisites

- Utopia world restarted and world API is live
- Utopia world package IDs verified and recorded
- FW Move package deployed to Sui testnet with Utopia world package as dependency
- Indexer service configured with Utopia env vars (separate Railway service or
  local run — do NOT override Stillness production Railway service)
- EVE Vault wallet with a Utopia character

### Step 1 — Connect EVE Vault and sign operator session

1. Open FrontierWarden operator console.
2. Connect EVE Vault (zkLogin).
3. Click SIGN SESSION — confirm `POST /auth/session` returns 200 with `zkLogin` badge.

Expected: Header bar shows `Operator 0xabff...`, `zkLogin`, `Eve Vault`.

### Step 2 — Create/resolve Utopia character

1. Log into EVE Frontier client on Utopia.
2. Create a character (or confirm existing character is available on Utopia).
3. Check `GET /eve/identity/batch?addresses=<wallet>` — confirm character resolves.

Expected: Identity API returns character name, corporation, and item ID.

### Step 3 — Acquire or build a Gate in Utopia

1. In the EVE Frontier client, build or acquire a Gate object in Utopia.
2. Confirm the transaction lands on Sui testnet.
3. Note the Gate object ID (0x-prefixed).

Expected: Gate object appears in Sui explorer; you hold `OwnerCap<Gate>`.

### Step 4 — Detect OwnerCap in indexer

1. Wait for the indexer to pick up the `GateLinkedEvent` (if applicable) or poll
   the world API for the gate object.
2. Check `GET /world/gates/<gate_id>` — confirm the gate appears with
   `status: online`.

Expected: Gate visible in world gates API with correct tenant `utopia`.

### Step 5 — Deploy and provision FrontierWarden GatePolicy

1. Using the FW operator console or CLI, create a `GatePolicy` object targeting
   the Utopia Gate.
2. Note the GatePolicy object ID.

Expected: GatePolicy object created on Sui testnet.

### Step 6 — Bind GatePolicy to Utopia Gate

1. Submit the `bind_gate` PTB using `OwnerCap<Gate>` and the GatePolicy ID.
2. Confirm the transaction lands.

Expected:
- `GET /gates/<gate_policy_id>/binding-status` returns `bindingStatus: bound`.
- `worldGateId` matches the Utopia Gate.

### Step 7 — Authorize FrontierWardenAuth extension

1. Using `OwnerCap<Gate>`, submit the world package PTB:
   `gate::authorize_extension<FrontierWardenAuth>(owner_cap, gate, ctx)`.
2. Confirm the transaction lands and `ExtensionAuthorizedEvent` is emitted.

Expected:
- Indexer ingests the event within one poll interval (~2 seconds).
- `GET /world/gates/<gate_id>` returns `fw_extension_active: true`.
- `GET /gates/<gate_policy_id>/binding-status` returns `fwExtensionActive: true`.

### Step 8 — Confirm BINDING VERIFIED state

The binding status should now read:

```json
{
  "bindingStatus": "bound",
  "worldGateStatus": "online",
  "fwExtensionActive": true
}
```

This is the `BINDING VERIFIED` state that cannot currently be achieved on Stillness.
Record the transaction digest and checkpoint as smoke evidence.
Label the result as **Utopia dev/test only**.

### Step 9 — Confirm traffic and topology APIs

```bash
curl "$API/world/gates/<gate_id>/activity"
curl "$API/world/gates/<gate_id>/links"
curl "$API/world/gates/<gate_id>/jumps?limit=10"
```

Expected: All return 200. Counts may be 0 for a fresh gate — that is correct.

---

## DB Safeguards — Never Mix Stillness and Utopia Rows

The current schema has a `tenant` column on world gate and related tables. World gates
are labeled with `world_tenant` from config (`stillness` or `utopia`). This is the
primary isolation mechanism.

**Critical rules:**

1. Never run a Utopia-configured indexer against the Stillness production Supabase
   database. Utopia rows with `tenant = utopia` would appear in production API
   responses and corrupt trust evaluations for Stillness gates.

2. Use a separate database for Utopia testing. Options:
   - A separate Supabase project.
   - A local Postgres instance (`docker run -p 5432:5432 postgres`).
   - A separate Railway service with its own `DATABASE_URL`.

3. Utopia API responses must be clearly labelled dev/test in any documentation or
   evidence. Do not use Utopia binding-status screenshots as Stillness evidence.

4. The `tenant` column does not substitute for environment-level DB isolation when
   the trust evaluator is live. Stillness trust proofs must only ever read
   Stillness-tenanted rows.

---

## Config Audit — Environment Profile Support

### Current state

The config system (`indexer/src/config.rs`) supports a single active environment
per deployment, controlled by `config.toml` + env var overrides. There is no
built-in `EFREP_ENVIRONMENT=utopia` profile switcher.

To run Utopia, you need either:
- A separate Railway service with its own env var set, or
- A local run with a Utopia-specific config file passed as `--config config.utopia.toml`.

The binary currently hardcodes `config.toml` as the config path. To support a
`config.utopia.toml` locally, the simplest change is to read the config path from
a `EFREP_CONFIG_PATH` env var. This is a one-line change — not implemented here,
but noted as a low-cost addition when Utopia work begins.

### Required code changes before Utopia can run (non-trivial)

| Change | Priority | Notes |
|---|---|---|
| `EFREP_CONFIG_PATH` env var for config file path | Low | Allows `config.utopia.toml` locally without rebuilding |
| Separate Railway service for Utopia | Recommended | Cleanest isolation; no code change needed |
| `environment` field on world-gate DB rows | Recommended before mixed DB | Currently `tenant` is the only label; not sufficient if both run against one DB |
| FW Move package redeployment to Utopia world | Required | The existing FW package targets Stillness world package as a dependency |

### What does NOT need to change

- The indexer pipeline logic — it is world-package-agnostic once IDs are correct.
- The trust evaluator — it reads by `gate_policy_id`, not by world.
- The session auth flow — zkLogin works identically on Utopia.
- The world event cursor logic — already upgrade-safe via `original_id`.

---

## Stillness Production State (for reference)

Confirmed working as of 2026-05-17:

| Check | Status |
|---|---|
| `POST /auth/session` (zkLogin / EVE Vault) | Working — returns 200, `zkLogin` badge |
| Migration 0020 (cursor key widened to TEXT) | Applied |
| World event indexing (`ExtensionAuthorizedEvent`, `JumpEvent`, `GateLinkedEvent`) | Active — using correct Stillness original ID |
| Cursor persistence | Clean — no varchar(64) overflow errors |
| Gate `0x019f...` binding status | `bound`, `online`, `fwExtensionActive: false` |
| `fwExtensionActive: false` reason | No `authorize_extension<FrontierWardenAuth>` PTB submitted by gate owner yet |
| `EFREP_FW_GATE_EXTENSION_TYPENAME` | Set in Railway to `0xb43fcd4e...::reputation_gate::FrontierWardenAuth` |

The only remaining Stillness blocker is the per-gate authorization transaction from
the world gate owner. That is not a FW development blocker — it is a coordination
item with the gate owner.
