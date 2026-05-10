# FrontierWarden Tenant Onboarding

Last updated: 2026-05-10

FrontierWarden is multi-tenant operator infrastructure. The platform does
not manage world Gates on behalf of tenants. Each tribe or operator brings
their own EVE identity, world Gate, and on-chain authority. The site owner
(Kivik/Kodaxa) controls the platform GatePolicy and its admin capability;
tenants control their own Gate extensions.

This document is for any new operator who wants to connect to FrontierWarden
and reach BINDING VERIFIED.

---

## What You Need

Before starting, confirm you have all of the following:

| Requirement | Description |
|---|---|
| EVE Vault wallet | A Sui wallet capable of signing Sui transactions. EVE Vault is the recommended wallet for Stillness/testnet. |
| PlayerProfile (EVE identity) | A PlayerProfile object on Stillness/testnet. Created the first time you log into the EVE Frontier testnet client with your wallet. |
| Character (EVE character) | A Character object linked to your PlayerProfile. Your Character is the on-chain identity that can hold OwnerCap objects. |
| OwnerCap<Gate> | An OwnerCap for a world Gate, assigned to your Character. This is the authority that proves you control a physical EVE Frontier world Gate. |
| World Gate object ID | The on-chain object ID of your Gate (0x…). You need this to bind and authorize. |
| SUI for gas | Testnet SUI from the faucet. Gas costs for provisioning, binding, and authorization are low (typically 3–8M MIST per transaction at testnet prices). |

You do NOT need:

- The platform GateAdminCap (that is held by the site operator).
- Access to the Oracle wallet (used only by the platform oracle service).
- A pre-existing FrontierWarden GatePolicy (you will provision your own, or the platform can provision one for you).

---

## Onboarding Checklist

### Step 1 — Connect EVE Vault Wallet

- [ ] Open `https://frontierwarden.kodaxa.dev`
- [ ] Click CONNECT WALLET in the operator panel
- [ ] Connect with EVE Vault (or your Sui wallet with EVE identity)
- [ ] Confirm the wallet address is shown in the panel

### Step 2 — Verify EVE Character

The authority discovery scan runs automatically on wallet connection.

- [ ] The panel shows your Character name (e.g., "Kivik", "mumuyu", etc.)
- [ ] If no Character is found: ensure your wallet has a PlayerProfile on
      Stillness/testnet. You must have logged into EVE Frontier at least once
      with this wallet to create your PlayerProfile.

**If no PlayerProfile is found:**
You cannot complete extension authorization from this wallet. Either:
- Use the wallet that has your EVE identity, or
- Create a PlayerProfile by logging into EVE Frontier testnet.

### Step 3 — Verify OwnerCap<Gate>

The authority scan queries your Character for OwnerCap<Gate> objects.

- [ ] The panel shows "Gate OwnerCaps: 1" (or more)
- [ ] The specific OwnerCap object ID is shown in the Gate selection section

**If Gate OwnerCaps is 0:**
Your Character does not own a world Gate OwnerCap. Authorization cannot
proceed from this wallet. Either:
- Connect a different wallet whose Character owns a Gate, or
- Acquire a world Gate in EVE Frontier testnet (see EVE Frontier game docs),
  then verify the OwnerCap is assigned to your Character.

The UI will show:
> "No owned world Gate authority detected for this operator.
> FrontierWarden is multi-tenant infrastructure. Each tribe or operator
> brings their own Gate and OwnerCap."

This is informational — it is not a product error.

### Step 4 — Provision GatePolicy

Each operator domain needs its own GatePolicy. The platform GatePolicy
(`0x7b10f2ee…`) belongs to the site operator.

Options:

**Option A — Platform provisions a GatePolicy for you (coordinated):**
Contact the FrontierWarden platform operator (Kodaxa). The operator can
run `npx tsx scripts/create-gate.ts` to provision a GatePolicy and
transfer the GateAdminCap to your wallet.

**Option B — You provision your own (self-service):**
Use the GatePolicyProvisionPanel in the frontend under Policy view. Requires
a connected wallet with SUI.

After provisioning:
- [ ] GatePolicy object ID is known (record it)
- [ ] GateAdminCap is owned by your wallet
- [ ] Binding status shows UNBOUND

### Step 5 — Bind GatePolicy to Your World Gate

Use the OperatorWorldGateBindingPanel under Policy view.

- [ ] Select your GatePolicy
- [ ] Select your world Gate from the indexed candidates
- [ ] Confirm the binding transaction details
- [ ] Click BIND WORLD GATE
- [ ] Wait for `GatePolicyBoundToWorldGate` to be indexed
- [ ] Binding status advances to BOUND

Verify:

```bash
curl https://ef-indexer-production.up.railway.app/gates/<YOUR_GATE_POLICY_ID>/binding-status
```

Expected:
```json
{ "bindingStatus": "bound", "worldGateId": "<YOUR_GATE_ID>", "fwExtensionActive": false }
```

The UI will show a topology advisory: "Binding indexed but FrontierWarden
extension evidence is not active." This is correct and expected at this stage.

### Step 6 — Authorize FrontierWardenAuth Extension

Use the OperatorExtensionAuthPanel under Policy view.

Prerequisites the panel checks automatically:
- Connected wallet with Character
- OwnerCap<Gate> for the selected Gate
- GatePolicy status is BOUND (not UNBOUND)
- Extension not already authorized (not already BINDING VERIFIED)

When all prerequisites pass, the panel shows:
> "All prerequisites met. Ready to authorize FrontierWardenAuth extension."

Transaction plan shown in the panel:
```
1. borrow_owner_cap<Gate>(character, Receiving<OwnerCap<Gate>>)
2. authorize_extension<FrontierWardenAuth>(gate, &OwnerCap<Gate>)
3. return_owner_cap<Gate>(character, OwnerCap<Gate>, Receipt)
```

- [ ] Select your GatePolicy
- [ ] Select your world Gate (the one bound in Step 5)
- [ ] Confirm OwnerCap<Gate> is detected
- [ ] Confirm Character is resolved
- [ ] Click AUTHORIZE EXTENSION
- [ ] Sign the transaction via EVE Vault
- [ ] Wait for `ExtensionAuthorizedEvent` to be indexed

### Step 7 — Confirm BINDING VERIFIED

After the indexer observes `ExtensionAuthorizedEvent`:

- [ ] Binding status advances to BINDING VERIFIED
- [ ] `GateBindingStatusBadge` shows BINDING VERIFIED (green) in Gate Intel
- [ ] `TopologyWarningBanner` is silent (no amber warning)
- [ ] `WorldGateTrafficPanel` shows `FW Extension: ACTIVE`
- [ ] Trust Console topology banner absent for this Gate

Verify:

```bash
curl https://ef-indexer-production.up.railway.app/gates/<YOUR_GATE_POLICY_ID>/binding-status
```

Expected:
```json
{ "bindingStatus": "verified", "fwExtensionActive": true }
```

---

## The Multi-Tenant Invariant

FrontierWarden enforces strict separation between two types of authority:

| Authority | Object | Controls |
|---|---|---|
| FW Policy Authority | GateAdminCap | Trust thresholds, tolls, world Gate binding reference |
| World Gate Extension Authority | OwnerCap<Gate> | Physical installation of the FrontierWardenAuth extension on the Gate |

These are independent. The same wallet may hold both, or they may be held
by different wallets. The important rule is:

- **BOUND** requires GateAdminCap (Steps 4–5 above).
- **BINDING VERIFIED** additionally requires OwnerCap<Gate> (Step 6 above).

A BOUND gate is not physically enforced. BINDING VERIFIED is the fully
operational state.

---

## If You Get Stuck

**"No OwnerCap<Gate> found":**
Your Character does not own a Gate. Connect a different wallet, or acquire
a Gate in EVE Frontier testnet.

**"GatePolicy must be BOUND before authorization":**
Complete Step 5 first. The GatePolicy must point to your world Gate ID
before the extension can be authorized.

**zkLogin proof fetch failure:**
The sponsored transaction flow reaches wallet signing, but final execution
may fail if the zkLogin prover is unavailable. Retry. Alternatively, use
a direct-key Ed25519 wallet.

**Binding status stuck at BOUND after authorization:**
Wait for the indexer to process the `ExtensionAuthorizedEvent`. The
FW protocol cursor is typically current to within seconds to minutes.
Check indexer health: `curl https://ef-indexer-production.up.railway.app/health`.

---

## Related Documents

- `Documents/OPERATOR_FLOW_RUNBOOK.md` — full operator flow with live object IDs
- `Documents/FRONTIERWARDEN_TENANT_AUTHORITY_MODEL.md` — multi-tenant architecture
- `Documents/policy/gas-station-funding-model.md` — gas sponsorship options
- `Documents/DEPLOYMENT_RAILWAY_VERCEL.md` — live stack topology and health checks
