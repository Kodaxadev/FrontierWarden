# Object Type Detection Spike — Smoke Test Results

**Branch:** `codex/object-type-detection-spike`
**Date:** 2026-05-18
**Goal:** Validate in-game object routing assumptions with real SmartGate data.

## Critical Finding: `?objectId=` Is Not Supported

**SmartObjectProvider** (from `@evefrontier/dapp-kit`) reads object identity
from exactly two sources, checked in priority order:

1. `VITE_OBJECT_ID` env var — treated as a direct Sui object ID.
2. `?itemId=<numeric>` query param — combined with `?tenant=` (default
   `stillness`) to derive a Sui object ID via BCS + AssemblyRegistry.

It does **not** read `?objectId=` from query params.

Our `parseInGameParams()` in `ingame-object-types.ts` parses `?objectId=`
and returns it, but SmartObjectProvider never consumes that value. Any URL
using `?objectId=0x019f53...` will result in the "No object ID provided"
error path inside SmartObjectProvider.

### Why This Matters

EVE Frontier's smart assembly frame opens dapps with `?itemId=<numeric>`.
That path works correctly. The `?objectId=` path was speculative — added in
case operators paste a Sui object ID directly — but it has no upstream
support without a custom provider wrapper.

### Resolution

Removed `objectId` from `parseInGameParams()`. The function now only reads
`?itemId=` (matching what SmartObjectProvider actually consumes). This
eliminates the false positive where our code says "in-game mode detected"
but SmartObjectProvider can't resolve the object.

If direct Sui object ID support is needed later, the correct approach is a
custom wrapper that sets `VITE_OBJECT_ID` dynamically or patches
SmartObjectProvider's initialization state. That is out of scope for this
spike.

## SmartObjectProvider Initialization Flow

```
Mount → useEffect (line 188-220)
  ├── VITE_OBJECT_ID set?
  │     → setSelectedObjectId(envObjectId)
  │     → setIsObjectIdDirect(true)         ← direct Sui object ID
  │     → return (skip query param check)
  │
  └── ?itemId= query param present?
        → setSelectedObjectId(queryItemId)  ← numeric item ID
        → setIsObjectIdDirect(false)        ← will BCS-derive objectId
        → (else) log error, setLoading(false)

Fetch → useEffect (line 222-260)
  ├── Requires: selectedObjectId AND isConnected (wallet connected)
  ├── isObjectIdDirect=true  → { objectId: ... }
  └── isObjectIdDirect=false → { itemId: ..., selectedTenant: ... }
        → getObjectId(itemId, tenant) → BCS derive → Sui object ID
```

**Wallet connection required:** SmartObjectProvider won't fetch assembly
data until `isConnected` is true (line 224). This means the in-game surface
will show "LOADING" until the operator connects their wallet, then it
resolves the assembly type.

## Known Object IDs

| Asset | Sui Object ID | Numeric itemId |
|-------|---------------|----------------|
| World Gate | `0x019f53078f...30a7c` | `1000005269846` |
| GatePolicy | `0x7b10f2ee46...53807` | N/A (not an assembly) |
| GateAdminCap | `0x7876d36be7...53a3` | N/A (not an assembly) |

Numeric itemId confirmed via `/world/gates?tenant=stillness` API (41 gates
indexed). See `GATE_OBJECT_COMMAND_SURFACE_SMOKE.md` for live test results.

## Testing Path

To validate the full in-game flow:

1. Query `/world/gates?tenant=stillness` to get the numeric `itemId`.
2. Open `http://localhost:5173/?itemId=<numeric>&tenant=stillness`.
3. Connect wallet.
4. Verify: SmartObjectProvider resolves → `useSmartObject()` returns
   assembly → `assemblyToScreen()` returns `'gate'` →
   GateObjectSurface renders.

Without a running local dev server and the indexer having gate data, this
cannot be validated in the spike. The code path is structurally sound.

## Assembly Type Detection

`assemblyToScreen()` maps dapp-kit's `Assemblies` enum to FrontierWarden
screen types. The mapping relies on `assembly.type` from
SmartObjectProvider, which comes from the GraphQL response's Move type
string parsed in `transformToAssembly()`.

The 7 assembly types in dapp-kit:
- `SmartGate` → `'gate'`
- `SmartStorageUnit` → `'storage'`
- `SmartTurret` → `'turret'`
- `NetworkNode` → `'node'`
- `Manufacturing` → `'manufacturing'`
- `Refinery` → `'refinery'`
- `Assembly` (base) → `'unknown'`

## Code Changes

1. **`ingame-object-types.ts`**: Removed `objectId` from
   `parseInGameParams()` return type and parsing logic. In-game mode now
   requires `?itemId=` (matching SmartObjectProvider's actual behavior).

2. **`InGameObjectCommandSurface.tsx`**: Removed `objectId` display from
   the context strip (was showing the parsed-but-unused objectId). Now only
   shows the assembly ID from SmartObjectProvider.
