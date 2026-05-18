# Smart Assembly Object Mode UX

Status: design addendum only — extends MULTITENANT_UX_REDESIGN_PLAN.md
Branch: `codex/smart-assembly-object-mode-ux`
Scope: presentation mode definition, object-specific screen design, validation questions
Date: 2026-05-18

## Background

EVE Frontier dapps run inside a smart assembly frame. The CivilizationControl
screenshot (2026-05-18) shows the actual in-game layout:

```text
left:   selected assembly / object context        (game-owned)
center: dapp interface                             (FrontierWarden lives here)
right:  storage / unit context                     (game-owned)
bottom: blue warning bar                           (game-owned)
```

The center dapp panel is narrow, shares screen with game chrome, and is
accessed by an operator already standing at a specific object. FrontierWarden
should not show the full web dashboard in this frame. It should show a command
surface scoped to the current object.

## Two Presentation Surfaces

### External Web Command Center (`/app`)

The full FrontierWarden experience for operators outside the game. Includes
onboarding, tenant setup, policy editing, evidence review, developer tools,
advanced diagnostics, and documentation links. This is the surface described
in MULTITENANT_UX_REDESIGN_PLAN.md.

### In-Game Object Command Surface (`/ingame/:objectType/:objectId`)

A compact, object-specific command surface for operators inside the smart
assembly frame. Shows only what is relevant to the current object, the
operator's authority over it, and the next available action.

## Object-Mode Principles

1. **Current object first.** The screen opens scoped to the object the
   operator is standing at, not to a dashboard.

2. **Authority visible immediately.** Policy authority, gate ownership,
   extension auth, and binding state visible without scrolling.

3. **Policy controls only when relevant.** A gate shows passage policy.
   A storage object does not. Irrelevant controls do not appear.

4. **Broad tenant admin stays in web mode.** Onboarding wizards, tenant
   domain setup, developer tools, combat policy design, and advanced
   diagnostics link to web mode rather than inlining.

5. **Compact command-console density.** Thin borders, uppercase headers,
   dense status cells, monospace labels, clear active/inactive states.

6. **ATT. OPERATOR warning pattern.** Critical state warnings use the
   in-game visual language:
   ```text
   ATT. OPERATOR — GATE IS BOUND BUT NOT BINDING VERIFIED
   ATT. OPERATOR — THIS DECISION IS ADVISORY UNTIL TENANT POLICY IS ACTIVE
   ATT. OPERATOR — SESSION EXPIRED — RECONNECT TO ACT
   ```

7. **Raw IDs collapsed by default.** `shortId()` unless explicitly expanded.

## Node Sentinel Scope

Node Sentinel is one in-game screen for node/infrastructure monitoring. It is
not the universal in-game landing page. Gate objects show Gate Ops. Storage
shows owner trust context. Node Sentinel appears only when the object type
maps to infrastructure.

## Object-Specific Screens

### Gate Object

**Operator question:** Can this pilot pass this gate right now?

**Shows:** passage decision preview, ALLOW/TOLL/DENY with proof, threshold
and toll display, quick policy edit (if policy authority held), toll withdrawal
button, gate traffic summary, binding state, authority checklist.

**Hides:** onboarding wizard, tenant domain setup, combat policy design, oracle
registration, developer docs, full killboard, social vouch/loan panels, dispute
console (link to web mode).

**Authority checks:** GateAdminCap, OwnerCap<Gate>, FrontierWardenAuth, binding
state (BOUND vs BINDING VERIFIED).

**Unknowns:** Can gate object ID be passed via URL/postMessage? Does the gate
expose enough state to resolve bound GatePolicy without indexer? Can toll
withdrawal work inside the game frame?

### Storage Object

**Operator question:** What is the trust posture of this storage unit's owner?

**Shows:** owner identity resolution, trust dossier summary, standing score and
proof, counterparty risk check, vouch history summary, dispute history summary.

**Hides:** gate passage controls, gate policy editing, toll management, world
gate binding panels, onboarding wizard, developer tools.

**Authority checks:** session authentication, Trust API availability.

**Unknowns:** Does the storage assembly expose the owner wallet? Is there a
meaningful distinction between storage variants? Could storage-specific access
policies exist?

### Market / Vendor Object (Speculative)

**Operator question:** Can I trust this counterparty for a trade?

**Shows:** counterparty risk decision, trust dossier, standing proof, vouch
graph, trade/dispute history.

**Hides:** gate controls, gate policy, combat policy, full killboard.

**Unknowns:** Does EVE Frontier have a market/vendor assembly type? What
counterparty information is available from the frame? Is there a trade escrow
system FrontierWarden could assess?

This screen is speculative. It depends on confirming a market assembly type
exists in the EVE Frontier type system.

### Node / Infrastructure Object

**Operator question:** Is this infrastructure healthy and is the network
performing?

**Shows:** Node Sentinel view, indexer health, checkpoint lag, API status,
advisory diagnostics, network topology summary.

**Hides:** gate passage, trust dossiers, credit risk, combat evidence, social
panels.

**Authority checks:** session authentication, node ownership.

**Unknowns:** What node types exist? Does node ownership map to wallet addresses
like gate ownership? Is there a "network node" assembly type?

### Defense / Turret Object (Speculative)

**Operator question:** What is the threat posture around this defense structure?

**Shows:** threat assessment, standing check for approaching pilots, recent
killmails near this object, tribe disposition for local factions.

**Hides:** toll management, credit risk, onboarding, developer tools.

**Unknowns:** Do turrets have access-control models like gates? Can
FrontierWarden provide standing-based targeting policy? Is there a "defense"
assembly type?

This screen is speculative. Deferred until defense assembly types are confirmed.

### Generic Unknown Object

**Operator question:** What can FrontierWarden tell me about this object?

**Shows:** object ID, owner identity resolution (if owner wallet available),
owner trust dossier, link to full web mode.

**Hides:** all object-specific controls. Do not show gate/storage/market
controls that might be wrong for an unknown type.

**Fallback behavior:** log the unknown type for telemetry so new object types
can be added.

## Validation Questions

These must be answered before implementing the in-game object router.

### 1. How is the object ID passed to the dapp?

Candidates: URL parameter, query string, postMessage from assembly frame,
injected global (`window.__EVE_ASSEMBLY_CONTEXT__`), or EVE Vault adapter
context. The dapp discovery listing uses `smartAssemblyFacets` (`["gate"]`),
suggesting the registry knows which types the dapp supports. The exact
object-passing mechanism is **unverified**.

### 2. How is object type resolved?

Candidates: frame tells the dapp, dapp reads on-chain Move type, dapp matches
against indexer records, or URL path encodes it. If the frame does not pass
type information, the dapp must resolve from on-chain data (adds loading step
and failure mode).

### 3. Does each smart object expose enough state?

Gates: bound GatePolicy, owner wallet, binding state must be resolvable from
the object ID. The indexer already tracks most of this.

Storage: owner wallet must be available (likely Sui object owner). Storage
metadata may not be relevant to FrontierWarden.

Other types: unknown. Each needs a spike.

### 4. Can transactions be safely initiated in-game?

CivilizationControl shows Save/Offline/Online buttons, suggesting signing
works in-frame. Open questions: Does EVE Vault adapter work in the iframe?
Does sponsored signing (gas station) work? Are there frame restrictions on
wallet popups? Should high-value operations require web-mode confirmation?

### 5. Fallback when object type is unknown

Show generic screen. Display object ID and attempt owner resolution. Offer
link to full web mode. Do not show object-specific controls. Log unknown type
for telemetry.

## Implementation Sequence

Design-only. Implementation follows after the cleanup queue settles.

**Step 1: `codex/ingame-object-router-shell`** — Add route structure
(`/ingame/:objectType/:objectId`) with shell component that reads params and
renders the appropriate object screen. Include generic fallback. No real
object-type detection — URL params only.

**Step 2: `codex/gate-object-command-surface`** — Gate object screen: passage
decision, authority checklist, binding state, quick policy edit, toll display.
Reuse existing components in compact layout.

**Step 3: Object-type detection spike** — Investigate how the assembly frame
passes object information. Test with a real smart assembly in Stillness.

**Step 4: Remaining object screens** — Storage, node, generic. Market/vendor
and defense/turret deferred until those assembly types are confirmed.

## Relationship to Existing Documents

- **MULTITENANT_UX_REDESIGN_PLAN.md** — This addendum extends the UX plan.
  Web command center remains the external mode. This document adds in-game mode.

- **DAPP_DISCOVERY_LISTING_DRAFT.md** — `smartAssemblyFacets` should expand
  as FrontierWarden adds object screens.

- **OPERATOR_FLOW_RUNBOOK.md** — Assumes web mode. Future addendum should
  cover in-game flow (skips onboarding, starts at current object).

- **DESIGN_SYSTEM.md** — In-game mode needs a compact design variant. Dense
  context strips, ATT. OPERATOR bars, collapsed ID defaults.
