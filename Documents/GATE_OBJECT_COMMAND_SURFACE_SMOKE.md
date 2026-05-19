# Gate Object Command Surface — Live Smoke Test

**Branch:** `codex/gate-object-command-surface-smoke`
**Date:** 2026-05-18
**Goal:** Validate the in-game gate path end-to-end with a real Stillness
world gate.

## Test Setup

| Parameter | Value |
|-----------|-------|
| World Gate Sui ID | `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c` |
| Numeric itemId | `1000005269846` |
| Tenant | `stillness` |
| Linked Gate | `0xb2a07bad90170dfc123d20b9855b8b94b2673665f331102e9f8ccdcbb1549ea9` |
| Gate Status | `online` |
| FW Extension Active | `false` |
| Test URL | `https://frontierwarden.kodaxa.dev/?itemId=1000005269846&tenant=stillness` |

Source: `/world/gates?tenant=stillness` API — 41 gates indexed, 35 online,
6 offline. The target gate `0x019f53...` is online with a linked peer.

## Results

### What Worked

1. **In-game surface detection** — `parseInGameParams()` correctly returned
   `{ itemId: '1000005269846', tenant: 'stillness' }`.
2. **Surface routing** — App.tsx branched to `InGameObjectShell` instead of
   the web dashboard.
3. **Context strip rendered** — OPERATOR cell green (wallet auto-connected
   from previous session), OBJECT cell shows LOADING, TYPE cell shows
   OBJECT COMMAND (amber — assembly type unknown because resolution failed).
4. **ATT. OPERATOR bar** — crimson error bar displayed the provider error
   message correctly.
5. **Web mode link** — footer link to full command center rendered.

### Blocker: Missing `VITE_EVE_WORLD_PACKAGE_ID`

SmartObjectProvider's `getObjectId()` calls `getEveWorldPackageId()` which
reads `VITE_EVE_WORLD_PACKAGE_ID` from `import.meta.env`. This env var is
**not set on the Vercel deployment**.

The BCS derivation path is:
```
itemId (1000005269846) + tenant ("stillness")
  → BCS serialize as TenantItemId { id: u64, tenant: string }
  → deriveObjectID(registryAddress, typeTag, bcsKey)
  → Sui object ID
```

This requires `VITE_EVE_WORLD_PACKAGE_ID` to construct the type tag. Without
it, the provider throws at the BCS step and never reaches the GraphQL query.

**Error (repeats every 10s via polling):**
```
[DappKit] SmartObjectProvider: Query error: Error: Missing required
environment variable: VITE_EVE_WORLD_PACKAGE_ID. Please set it in your
.env file.
```

### Fix Applied: Vercel Environment Variable

Set on Vercel (frontierwarden project) and redeployed 2026-05-18:
```
VITE_EVE_WORLD_PACKAGE_ID=0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c
```

This is the Stillness world package ID — already used in
`operator-gate-authority.ts` as `STILLNESS_WORLD_PACKAGE_ID`.

Production deployment: `dpl_3JyFhPWf8rcWQXfQrqHv2kEHu8Jt`

## Checklist

| Step | Status | Notes |
|------|--------|-------|
| Numeric itemId found | PASS | `1000005269846` from `/world/gates` API |
| In-game surface renders | PASS | Context strip + ATT bars visible |
| Wallet connected | PASS | Auto-connected from previous session |
| SmartObjectProvider resolves | **PASS** | BCS derived Sui object ID from itemId + tenant |
| assembly.type = SmartGate | **PASS** | TYPE cell shows "GATE OPERATIONS" (green) |
| GateObjectSurface renders | **PASS** | All sections: gate identity, authority, passage decision |
| Unknown fallback does not render | **PASS** | Gate screen took over, no placeholder visible |

## Confirmed Live Behavior

After env fix and Vercel rebuild, the full gate path works end-to-end:

1. SmartObjectProvider derived Sui object ID from `itemId=1000005269846` +
   `tenant=stillness` via BCS.
2. GraphQL query fetched the assembly object successfully.
3. `transformToAssembly()` parsed the Move type string, detected
   `Assemblies.SmartGate`.
4. `assemblyToScreen()` returned `'gate'`.
5. Context strip: OPERATOR green (`0x9cc0...20e1`), OBJECT green
   (`0x019f...0a7c`), TYPE green ("GATE OPERATIONS").
6. `GateObjectSurface` rendered all sections:
   - **Gate Identity** — Object `0x019f...0a7c`, Owner `0xe8e3...b2f6`
   - **Authority** — Policy authority MISSING, World gate ownership
     MISSING, Extension auth MISSING (correct — test wallet does not
     own this gate's caps)
   - **ATT. OPERATOR** — amber warning "NO GATE POLICY FOUND FOR THIS
     WALLET" (correct)
   - **Passage Decision** — Traveler shown, TRIBE_STANDING attestation
     found (`0x308d...be49`), CHECK PASSAGE button enabled, status
     "proof ready"
7. The unknown/placeholder fallback did NOT render.

## Gate Universe Summary

From the `/world/gates` response (41 gates total):

- **35 online** gates with `fwExtensionActive: false` (no FrontierWarden
  extensions bound yet — expected for pre-binding testing)
- **6 offline** gates
- **2 unlinked** gates (no `linkedGateId`)
- **0 gates** with `fwExtensionActive: true`

This confirms the binding flow has not yet been exercised on any live gate.
The `fwExtensionActive: false` state is correct — it will flip to `true`
after an operator binds their GatePolicy to a world gate via the
FrontierWarden extension.
