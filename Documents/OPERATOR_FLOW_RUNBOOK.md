# FrontierWarden Operator Flow Runbook

Last updated: 2026-05-10

This document is the end-to-end operator runbook for the FrontierWarden
testnet demo. It covers the full flow from GatePolicy discovery to
BINDING VERIFIED, including what is currently implemented, what is
confirmed working by live transaction, and exactly what is still blocked
and why.

---

## Quick Reference: Live Object State

| Object | ID |
|---|---|
| FW package (current / original) | `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa` |
| Active GatePolicy | `0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807` |
| GateAdminCap | `0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3` |
| Bound world Gate | `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c` |
| World Gate OwnerCap | `0xf0947247bcb8bbb6409eca42ad93ec21ef777bbda56dc22f1fbbf8a793f8d2d2` |
| OwnerCap owner (Character) | `0x83c90a36b8ec223d48aa9e3b7ccd4c9ed29ac18e2d488b518148b5d0e7402ca0` (unknown external operator "mumuyu" — not an active demo path) |
| mumuyu controlling wallet (unknown external — not an active path) | `0xe8e3a759ebf1fdc69df24ab3a7d1ae99c382b672db2866e5853fb0bcaaffb2f6` |
| Kivik wallet (site owner) | `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f` |
| Schema Registry | See `VITE_SCHEMA_REGISTRY_ID` in Vercel |
| Oracle Registry | See `VITE_ORACLE_REGISTRY_ID` in Vercel |
| Gate Policy (Vercel env) | `VITE_GATE_POLICY_ID` |

Current binding state:

```
GatePolicy  BOUND
Extension   INACTIVE
Verified    FALSE
```

---

## The Six-Step Operator Flow

```
Step 1  Discover operator authority
Step 2  Provision GatePolicy
Step 3  Bind world Gate
Step 4  Authorize FrontierWarden extension
Step 5  Verify indexed evidence
Step 6  Observe traffic and topology warnings
```

Steps 1–3 and 5–6 are confirmed working on testnet. Step 4 is implemented
but blocked on OwnerCap availability. See section 4 for the exact unblock
paths.

---

## Step 1 — Discover Operator Authority

**What it means:**
Before any GatePolicy work, the connected wallet must be identified as a
legitimate operator: it must control a GateAdminCap (FW policy authority)
and, separately, an EVE character that owns an OwnerCap<Gate> (world Gate
extension authority).

**What is built:**
- `useOperatorGatePolicies` hook: scans connected wallet for GateAdminCap
  objects owned by or associated with the wallet.
- `useOperatorGateAuthority` hook: queries connected wallet's
  PlayerProfile → Character → OwnerCap<Gate> chain via Sui RPC.
- Both hooks are wired into `OperatorExtensionAuthPanel`.

**How to test:**

1. Open `https://frontierwarden.kodaxa.dev`, navigate to Policy view.
2. Connect the Kivik wallet (`0xabff3b1b…`) via EVE Vault or zkLogin.
3. The OperatorGateAuthorityPanel will scan for GateAdminCap objects.
4. Expected: GateAdminCap `0x7876d36b…` is discovered (owned by Kivik wallet).
5. Expected: 0 OwnerCap<Gate> objects found (Kivik does not own a Gate).

**Multi-tenant note:**
Kivik (site owner) does not need to own every world Gate. Each tenant
operator brings their own wallet and OwnerCap<Gate>. The site owner's
authority is limited to managing the platform GatePolicy and its
associated GateAdminCap. Tenants manage their own Gate extensions.

---

## Step 2 — Provision GatePolicy

**What it means:**
`GatePolicy` is the on-chain FrontierWarden configuration object. It holds
trust thresholds, toll settings, and the world Gate binding reference. It
is created once per operator domain. The creating transaction also mints a
`GateAdminCap` which authorizes all subsequent policy management.

**What is built:**
- `GatePolicyProvisionPanel` in the frontend.
- `scripts/create-gate.ts` — CLI alternative.

**Current live state (confirmed by transaction):**

| Field | Value |
|---|---|
| GatePolicy | `0x7b10f2ee…` |
| GateAdminCap | `0x7876d36b…` |
| GateAdminCap owner | Kivik wallet (`0xabff3b1b…`) |
| Config tx | `GpXjDsihTtvKU4MwW8a3KHC8tny366niUqQZsDzRL7Ur` |
| Config checkpoint | `334017323` |

**To provision a fresh GatePolicy (new operator):**

```bash
npx tsx scripts/create-gate.ts
```

Or via the provisioning panel in the frontend (requires connected wallet
with sufficient SUI for gas).

**Key invariant:** GateAdminCap must be held by the operator wallet that
will sign all subsequent policy management transactions. Transfer it if
the signing wallet changes.

---

## Step 3 — Bind World Gate

**What it means:**
The `bind_world_gate` Move function records a `GatePolicy → world_gate_id`
reference on-chain. This emits `GatePolicyBoundToWorldGate`, which the
indexer observes and advances binding status from `unbound` to `bound`.

Binding is NOT the same as extension authorization. The gate is not
physically governed by the policy until Step 4.

**What is built:**
- `OperatorWorldGateBindingPanel` in the frontend.
- Gas station supports the `bind_world_gate` PTB.

**Current live state (confirmed by transaction):**

| Field | Value |
|---|---|
| Bind tx | `BzYVxe3z4x1fXZNnrkPXdHn7HwTsShgwqrUqKPk7o3TC` |
| Bound at checkpoint | `334098874` |
| Bound world Gate | `0x019f53078f…` |
| Binding status | `BOUND` |
| FW extension active | `false` |

**How to verify live:**

```bash
curl https://ef-indexer-production.up.railway.app/gates/0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807/binding-status
```

Expected:

```json
{
  "bindingStatus": "bound",
  "worldGateId": "0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c",
  "worldGateStatus": "online",
  "linkedGateId": "0xb2a07bad90170dfc123d20b9855b8b94b2673665f331102e9f8ccdcbb1549ea9",
  "fwExtensionActive": false,
  "active": true
}
```

**UI state:**
- Gate Intel shows `TopologyWarningBanner` with amber warning: "Binding
  indexed but FrontierWarden extension evidence is not active."
- Trust Console shows same warning for `gate_access` evaluations.
- `GateBindingStatusBadge` shows `BOUND` (not `BINDING VERIFIED`).

---

## Step 4 — Authorize FrontierWarden Extension

**What it means:**
The `authorize_extension<FrontierWardenAuth>` Move call uses the world
Gate's `OwnerCap<Gate>` to install the FrontierWardenAuth extension. This
is the physical proof that the world Gate is governed by the FW policy.
The indexer observes the `ExtensionAuthorizedEvent` and sets
`fw_extension_active = true`, advancing status to `BINDING VERIFIED`.

**PTB pattern (borrow/authorize/return):**

```
1. borrow_owner_cap<Gate>(character, Receiving<OwnerCap<Gate>>)
2. authorize_extension<FrontierWardenAuth>(gate, &OwnerCap<Gate>)
3. return_owner_cap<Gate>(character, OwnerCap<Gate>, Receipt)
```

**What is built:**
- `OperatorExtensionAuthPanel` — full UI for extension authorization.
- `useAuthorizeFWExtension` hook — builds and submits the PTB.
- `useOperatorGateAuthority` hook — discovers OwnerCap<Gate> and Character
  from the connected wallet.
- Gas station supports the `authorize_extension` PTB.

**Current blocker:**

The bound world Gate (`0x019f53078f…`) is owned by an unknown external
operator — Character "mumuyu" (`0x83c90a36…`). Kivik does not control
that wallet and cannot authorize the extension on their behalf.

This is expected behavior under the multi-tenant authority model. The site
owner (Kivik) was never expected to own every Gate. Extension authorization
requires the Gate's actual owner to connect and execute the PTB. Kivik
currently has no OwnerCap<Gate> of its own.

**Paths to reach BINDING VERIFIED:**

| Path | Notes |
|---|---|
| **A — Tenant operator connects (primary intended path)** | Any EVE character with an `OwnerCap<Gate>` connects their wallet to the dashboard. `OperatorExtensionAuthPanel` discovers their authority automatically. No new code needed. See `Documents/TENANT_ONBOARDING.md` for the full checklist. |
| **B — Kivik acquires a Gate** | Requires in-game action: build or claim a world Gate in EVE Frontier testnet, then verify `OwnerCap<Gate>` is assigned to Kivik's Character. Then rebind GatePolicy to that Gate and authorize. |
| **C — mumuyu participates (external, not recommended)** | mumuyu is an unknown third-party operator. We do not control their wallet. Do not treat this as an active demo path. Only viable if mumuyu intentionally chooses to participate. |

Path A is the product design intent. FrontierWarden is multi-tenant
operator infrastructure. The site owner is not expected to own every Gate.

**For a real tenant operator running Path A:**

The tenant follows the checklist in `Documents/TENANT_ONBOARDING.md`:
connect wallet → verify EVE Character → confirm OwnerCap<Gate> detected
→ provision or use existing GatePolicy → bind Gate → authorize extension
→ confirm BINDING VERIFIED in the UI.

**Post-authorization verification:**

```bash
curl https://ef-indexer-production.up.railway.app/gates/0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807/binding-status
```

Expected after success:

```json
{
  "bindingStatus": "verified",
  "fwExtensionActive": true
}
```

---

## Step 5 — Verify Indexed Evidence

**What it means:**
After the extension authorization transaction, the indexer must observe
and process the `ExtensionAuthorizedEvent`. Until it does, the binding
status stays `BOUND`. This step confirms the full indexer pipeline is
functioning end-to-end.

**Health checks:**

```bash
# Indexer health
curl https://ef-indexer-production.up.railway.app/health

# Binding status (polls until verified)
curl https://ef-indexer-production.up.railway.app/gates/0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807/binding-status

# World gate object
curl https://ef-indexer-production.up.railway.app/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c

# World gate activity
curl https://ef-indexer-production.up.railway.app/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/activity

# Trust API gate_access
curl -X POST https://ef-indexer-production.up.railway.app/trust/evaluate \
  -H "Content-Type: application/json" \
  -d '{"entity":"<subject_wallet>","action":"gate_access","context":{"gateId":"0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807"}}'
```

**Expected trust result for EVE Vault operator wallet with TRIBE_STANDING = 750:**

```json
{
  "decision": "ALLOW_FREE",
  "allow": true,
  "confidence": 0.94
}
```

Proof warning `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX` may appear. This is
expected when newer binding or passage events are indexed and the proof
bundle is anchored to earlier attestation evidence. It is not an error.

**UI indicators of full Step 5 pass:**
- `GateBindingStatusBadge` shows `BINDING VERIFIED` (green)
- `TopologyWarningBanner` renders nothing (clean state)
- `WorldGateTrafficPanel` shows `FW Extension: ACTIVE`
- Trust Console shows no topology warnings

---

## Step 6 — Observe Traffic and Topology Warnings

**What it means:**
Once the gate is live and the world event cursor has processed from its
cold-start checkpoint, the traffic API surfaces indexed jump and topology
data. This step confirms the world gate step 2/3 pipeline is operational.

**World event cursor cold-start:**

The world gate indexer (Steps 2/3) starts from checkpoint `308264360`
(confirmed at the Builders call). The FW protocol cursors started earlier.
Until the world event cursor catches up to the current chain tip, jump and
link counts will be zero. This is expected and not an error.

**To check cursor progress:**

```bash
# Current chain tip (approximate)
curl https://ef-indexer-production.up.railway.app/health

# World gate links (zero expected until GateLinkedEvents observed)
curl https://ef-indexer-production.up.railway.app/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/links

# Jump traffic (zero expected until JumpEvents observed)
curl https://ef-indexer-production.up.railway.app/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/jumps?limit=10

# Activity window counts
curl https://ef-indexer-production.up.railway.app/world/gates/0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c/activity
```

**Activity window note:** All counts use indexer insertion time (`created_at`),
not authoritative on-chain event timestamps. Lag is typically seconds to
minutes. The UI labels this explicitly in the `WorldGateTrafficPanel`.

**Topology advisory signals (all surfaces):**

| Binding state | Banner shown? | Banner text |
|---|---|---|
| unbound | info | No world gate binding indexed |
| bound, extension inactive | amber warn | Extension evidence not active |
| bound, world gate offline | amber warn | World gate indexed as offline |
| verified, extension active | none | Silent |

---

## Full Smoke Checklist

### Pre-smoke requirements

- [ ] Connected wallet controls GateAdminCap (Kivik wallet, or a tenant operator wallet)
- [ ] GatePolicy `0x7b10f2ee…` is bound to world Gate `0x019f53078f…`
- [ ] For BINDING VERIFIED smoke: a tenant operator with OwnerCap<Gate>
      has connected (see `Documents/TENANT_ONBOARDING.md`)
- [ ] Railway indexer health returns `{"status":"ok"}`
- [ ] Gas station health returns `{"ok":true,"ready":true}`
- [ ] Subject wallet has a valid TRIBE_STANDING attestation

### Step-by-step UI smoke

```text
1. Open https://frontierwarden.kodaxa.dev

2. Gate Intel tab
   ✓ Gate table loads with live testnet gates
   ✓ Active GatePolicy row shows
   ✓ GateBindingStatusBadge shows BOUND (or BINDING VERIFIED if Step 4 complete)
   ✓ TopologyWarningBanner shows amber warning if BOUND + extension inactive
   ✓ TopologyWarningBanner absent if BINDING VERIFIED
   ✓ WorldGateTrafficPanel loads for bound gate
   ✓ Activity counts render (zero is valid during backfill)
   ✓ Links empty state renders cleanly
   ✓ Jumps empty state renders cleanly
   ✓ Indexed-time disclaimer visible

3. Trust Console tab
   ✓ Select gate_access action
   ✓ Set subject to a wallet with TRIBE_STANDING attestation
   ✓ Set GateId to active GatePolicy
   ✓ Click EVALUATE
   ✓ Result shows ALLOW_FREE with confidence > 0.90
   ✓ Proof bundle shows TRIBE_STANDING schema
   ✓ TopologyWarningBanner appears (if BOUND, not VERIFIED)
   ✓ TopologyWarningBanner absent for counterparty_risk or bounty_trust actions
   ✓ No ALLOW/DENY change from topology warnings

4. Policy view (operator)
   ✓ Connect Kivik wallet
   ✓ GateAdminCap discovered
   ✓ Binding status shows BOUND

5. Extension authorization (Step 4 — requires tenant with OwnerCap<Gate>)
   Prerequisites: see Documents/TENANT_ONBOARDING.md — Steps 1–3
   ✓ Tenant connects Gate-owning wallet
   ✓ OperatorExtensionAuthPanel discovers OwnerCap<Gate>
   ✓ Character resolved for OwnerCap
   ✓ Prerequisites: BOUND + OwnerCap found + Character found = ready
   ✓ AUTHORIZE EXTENSION button enabled
   ✓ Transaction builds and reaches wallet signing
   ✓ Submission succeeds
   ✓ Binding status advances to BINDING VERIFIED
   ✓ GateBindingStatusBadge shows BINDING VERIFIED
   ✓ TopologyWarningBanner silent

6. CHECK PASSAGE (sponsored gate_access PTB)
   ✓ Connect any wallet with TRIBE_STANDING attestation
   ✓ CHECK PASSAGE button enabled
   ✓ Transaction builds → sponsoring → signing → executing
   ✓ Digest returned
   ✓ Passage feed updates in Gate Intel
```

---

## What Is Not Yet Proven

| Item | Reason | Unblock Path |
|---|---|---|
| `BINDING VERIFIED` state | No tenant with OwnerCap<Gate> has connected; Kivik does not own a Gate | Tenant operator path A (see TENANT_ONBOARDING.md) or Kivik acquires a Gate (path B) |
| Extension authorization PTB e2e | Blocked on OwnerCap availability | Same as above |
| World gate jump traffic > 0 | World event cursor still backfilling | Wait for cursor to reach current tip |
| World gate links > 0 | No GateLinkedEvents observed yet at cursor position | Same as above |
| Sponsored passage with Ed25519 wallet | zkLogin proof fetch failures observed | Use Ed25519 session wallet when testing |

---

## Known Operational Notes

**zkLogin proof fetch failures:**
The sponsored transaction flow reaches wallet signing, but EVE Vault can fail
to fetch a zkLogin proof. This is a wallet-session dependency, not a
FrontierWarden transaction construction failure.

Two classified error codes surface in the UI via `SigningFailureGuide`:

- `proof_rate_limited` — EVE Vault's zkLogin prover returned JSON-RPC error
  `-32012` (rate limit). Wait 30–60 seconds and retry. No on-chain state was
  changed.
- `wallet_zk_proof_fetch_failed` — generic proof fetch failure (network,
  prover unavailable). Retry after a brief wait.

Both show a **TRY AGAIN** button in the operator panels. Test with a
direct-key Ed25519 wallet where possible to avoid the prover dependency.

**Operator session verification (zkLogin support added 2026-05-16):**
`/auth/nonce` and `/auth/session` now accept both Ed25519 (flag byte `0x00`)
and EVE Vault / zkLogin signatures (flag byte `0x05`). zkLogin verification
is delegated to the Sui GraphQL `verifySignature` query rather than performed
locally.

Config:
- `EFREP_SUI_GRAPHQL_URL` — Sui GraphQL endpoint (default:
  `https://graphql.testnet.sui.io/`). Must use `https://`; any other URL
  scheme is rejected at startup (SSRF guard).

Error behavior:
- `success: false` or GraphQL errors (e.g. issuer rejected, expired proof)
  → 401 `wallet signature verification failed`
- Sui GraphQL unreachable or timeout → 503; operator must request a new nonce
  and retry (nonce is consumed before verification in the current design)

secp256k1 (`0x01`), secp256r1 (`0x02`), multisig (`0x03`), and passkey
(`0x06`) remain rejected with an opaque 401.

Implementation: `indexer/src/zklogin_verifier.rs` + `api_sessions.rs`
Research: `Documents/ZKLOGIN_SESSION_AUTH_RESEARCH.md` on branch
`codex/zklogin-session-auth-verify-signature-spike`

**World event cursor vs FW protocol cursor:**
These are separate indexer cursors. FW protocol events (gate_config,
attestation, passage, toll_withdrawal) are current as of 2026-05-07. World
gate events (GateCreatedEvent, GateLinkedEvent, JumpEvent) are processing
forward from checkpoint 308264360. Zero world traffic counts are expected
until the world cursor catches up.

**PROOF_CHECKPOINT_BEHIND_LATEST_INDEX warning:**
This appears in trust proof bundles after new binding or passage events
change the latest indexed checkpoint. The proof is still valid; it is
anchored to the last relevant attestation event. It is not a sign of
indexer failure.

**Production gas model:**
The current gas station uses a single shared wallet (testnet faucet funded).
See `Documents/policy/gas-station-funding-model.md` for the production
funding model. Do not open to external operators without implementing
Option A (operator-funded wallets) or Option B (cost-recovery).
