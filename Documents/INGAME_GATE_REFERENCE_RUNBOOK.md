# In-Game SmartGate — Reference Runbook

Reference implementation for the FrontierWarden in-game object command
surface. The SmartGate screen is the first production-proven object type.
Other object screens (storage, turret, node) should follow this pattern.

## URL Shape

```
https://frontierwarden.kodaxa.dev/?itemId=<numeric>&tenant=<tenant>
```

EVE Frontier's smart assembly frame supplies `?itemId=<numeric>` when
opening a dapp. The `?tenant=` param defaults to `stillness` if omitted.

**Known working test URL:**
```
https://frontierwarden.kodaxa.dev/?itemId=1000005269846&tenant=stillness
```

This resolves to world gate `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c`.

### What does NOT work

- `?objectId=<hex>` — SmartObjectProvider does not read this param.
  Removed in `codex/object-type-detection-spike`.
- Omitting `?itemId=` — falls through to the web dashboard (correct
  behavior, not an error).

## Required Vercel Environment Variables

### For object resolution (dapp-kit)

```
VITE_EVE_WORLD_PACKAGE_ID=0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c
```

Without this, SmartObjectProvider cannot BCS-derive the Sui object ID
from the numeric itemId. The error is:
`Missing required environment variable: VITE_EVE_WORLD_PACKAGE_ID`

### For CHECK PASSAGE transaction

```
VITE_PKG_ID=<FrontierWarden package ID>
VITE_GATE_POLICY_ID=<GatePolicy shared object ID>
VITE_GATE_POLICY_VERSION=<GatePolicy initial shared version>
```

Without these, `checkPassageConfigReady()` returns false and the CHECK
PASSAGE button is disabled with a config warning.

### Rebuild requirement

All `VITE_*` env vars are baked into the Vite bundle at build time.
Adding or changing a `VITE_*` env var on Vercel requires a rebuild/
redeploy — the change is not live until the next production deployment.

## Expected Context Strip

```
OPERATOR    <wallet address, green if connected>
OBJECT      <Sui object ID, green if resolved>
TYPE        GATE OPERATIONS (green)
```

| Cell | Green | Amber | Idle |
|------|-------|-------|------|
| OPERATOR | Wallet connected | — | NOT CONNECTED |
| OBJECT | Assembly resolved | — | LOADING |
| TYPE | Known type detected | OBJECT COMMAND (unknown) | — |

## Expected Authority States

The authority checklist shows three capabilities:

| Row | Protocol | What it checks |
|-----|----------|----------------|
| Policy authority | GateAdminCap | Wallet owns a GateAdminCap for the policy |
| World gate ownership | OwnerCap\<Gate\> | Wallet owns the world gate's OwnerCap |
| Extension auth | FrontierWardenAuth | Gate is bound to FrontierWarden extension |

Each row shows FOUND (green) or MISSING (amber). All three MISSING is
expected when viewing a gate you don't own.

## ATT. OPERATOR Warnings

| Condition | Tone | Message |
|-----------|------|---------|
| No policy found | amber | ATT. OPERATOR — NO GATE POLICY FOUND FOR THIS WALLET |
| Policy but no gate ownership | amber | ATT. OPERATOR — WORLD GATE OWNERSHIP NOT DETECTED |
| Policy + ownership but no binding | amber | ATT. OPERATOR — GATE BOUND BUT NOT BINDING VERIFIED |
| Assembly query failed | crimson | ATT. OPERATOR — ASSEMBLY QUERY FAILED: \<error\> |
| Assembly not resolved | blue | ATT. OPERATOR — ASSEMBLY NOT RESOLVED. INDEXER MAY BE COLD-STARTING. |

## CHECK PASSAGE Telemetry Phases

The sponsored transaction flow emits these telemetry events via
`fw-action-telemetry`:

```
started              Flow initiated
build_ok             PTB kind bytes built (getObject + getCoins via SuiJsonRpcClient)
sponsor_request      Gas station POST sent
sponsor_ok           Gas station returned wrapped tx + sponsor signature
wallet_sign_requested  Wallet prompted for co-sign
wallet_sign_ok       Wallet approved (or wallet_sign_failed + wallet_sign_rejected)
done                 On-chain execution complete (or failed + error class)
```

Inspect in browser console:
```js
window.__fwActionTelemetry.summary()   // counters
window.__fwActionTelemetry.dump()      // full event buffer
```

## Known Caveats

### Wallet connection required before object resolution

SmartObjectProvider will not fetch assembly data until `isConnected` is
true (wallet connected). The in-game surface shows OBJECT=LOADING and
TYPE=OBJECT COMMAND until the operator connects their wallet. After
connection, the object resolves and the correct screen renders.

### Wallet approval required for CHECK PASSAGE

The sponsored transaction flow builds the PTB and gets gas station
sponsorship without wallet interaction. The wallet popup appears only
at the co-signing step. If the user rejects or the popup times out,
the button shows RETRY and the error is displayed in crimson.

### fwExtensionActive is false for all gates

As of 2026-05-18, no Stillness gates have `fwExtensionActive: true`.
The binding flow has not been exercised on any live gate. The
Extension auth row will show MISSING for all gates until an operator
binds their GatePolicy to a world gate.

### Numeric itemId discovery

To find a gate's numeric itemId:
```
GET https://ef-indexer-production.up.railway.app/world/gates?tenant=stillness
```
Returns `WorldGateCandidate[]` with `itemId` and `worldGateId` fields.
As of 2026-05-18: 41 gates indexed, 35 online, 6 offline.

## File Map

| File | Role |
|------|------|
| `App.tsx` | Surface detection: `?itemId=` → in-game, else → web |
| `ingame/ingame-object-types.ts` | `parseInGameParams()`, `assemblyToScreen()`, screen labels |
| `ingame/InGameObjectShell.tsx` | SmartObjectProvider wrapper |
| `ingame/InGameObjectCommandSurface.tsx` | Context strip, routing to object screens |
| `ingame/GateObjectSurface.tsx` | SmartGate screen: identity, authority, binding, passage |
| `ingame/ingame-ui.tsx` | Shared `AttOperatorBar` component |
| `hooks/useCheckPassage.ts` | TRIBE_STANDING fetch + sponsored check_passage |
| `hooks/useSponsoredTransaction.ts` | Generic sponsored tx executor |
| `lib/tx-check-passage.ts` | PTB builder for `reputation_gate::check_passage` |
| `lib/fw-action-telemetry.ts` | In-memory action telemetry (console inspector) |
