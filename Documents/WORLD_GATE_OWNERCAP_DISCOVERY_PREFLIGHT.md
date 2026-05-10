# World Gate OwnerCap Discovery Preflight

## 1. Executive Summary
This preflight analyzes the precise technical path required to authorize the `FrontierWardenAuth` extension on the bound world Gate (`0x019f...`). We discovered a critical roadblock: **the currently bound world Gate is owned by a Character ("mumuyu") whose wallet address is not in our local keystore**. We know exactly how the transaction must be constructed using the `borrow_owner_cap` / `return_owner_cap` pattern, but we lack the necessary wallet authority to execute it on this specific Gate.

## 2. Atlas Evidence Table

| Concept | Discovery / Evidence |
|---|---|
| `authorize_extension` target | `0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780::gate::authorize_extension` |
| Auth Type Parameter | `0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa::reputation_gate::FrontierWardenAuth` |
| `OwnerCap<Gate>` Location | Stored as `AddressOwner` where the address is the `Character` object ID. |
| Borrow Pattern | `character::borrow_owner_cap<Gate>` accepts a `Receiving<OwnerCap<Gate>>` argument, returning the cap and a receipt. |

## 3. Bound World Gate `owner_cap_id` Discovery Path

To find the precise cap needed for the bound gate (`0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c`):
1. **Query Gate Object:** The world Gate object exposes an `owner_cap_id` field: `0xf0947247bcb8bbb6409eca42ad93ec21ef777bbda56dc22f1fbbf8a793f8d2d2`.
2. **Query OwnerCap Object:** Looking up `0xf0947...` reveals it is owned via `AddressOwner` by `0x83c90a36b8ec223d48aa9e3b7ccd4c9ed29ac18e2d488b518148b5d0e7402ca0`.
3. **Resolve Character Object:** Looking up `0x83c90...` reveals it is the `Character` shared object named "mumuyu", controlled by wallet address `0xe8e3a759ebf1fdc69df24ab3a7d1ae99c382b672db2866e5853fb0bcaaffb2f6`.

## 4. Character / Wallet / OwnerCap Relationship

The `OwnerCap<Gate>` is not directly in the user's wallet. Instead, it has been transferred to the `Character` object ID itself. 
Because the `Character` is a shared object, anyone can reference it, but the `character::borrow_owner_cap` function securely restricts access by consuming a `Receiving<OwnerCap<Gate>>` and (presumably) asserting that `ctx.sender()` matches the `character_address` field on the `Character`.

## 5. Proposed Transaction Shape: Borrow → Authorize → Return

The Programmable Transaction Block (PTB) must be structured precisely as follows:

```typescript
// 1. Borrow the OwnerCap<Gate> from the Character
// Takes: &mut Character, Receiving<OwnerCap<Gate>>
const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PKG_PUBLISHED_AT}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PKG_ORIGINAL_ID}::gate::Gate`],
    arguments: [
        tx.object(characterId), // 0x83c90...
        tx.object(ownerCapId)   // 0xf0947... (Passed as Receiving)
    ]
});

// 2. Authorize the extension on the Gate
// Takes: &mut Gate, &OwnerCap<Gate>
tx.moveCall({
    target: `${WORLD_PKG_PUBLISHED_AT}::gate::authorize_extension`,
    typeArguments: [EFREP_FW_GATE_EXTENSION_TYPENAME],
    arguments: [
        tx.object(worldGateId), // 0x019f5...
        ownerCap
    ]
});

// 3. Return the OwnerCap<Gate> back to the Character
// Takes: &Character, OwnerCap<Gate>, ReturnOwnerCapReceipt
tx.moveCall({
    target: `${WORLD_PKG_PUBLISHED_AT}::character::return_owner_cap`,
    typeArguments: [`${WORLD_PKG_ORIGINAL_ID}::gate::Gate`],
    arguments: [
        tx.object(characterId), // 0x83c90...
        ownerCap,
        receipt
    ]
});
```

## 6. Unknowns / Needs Verification

*   **Borrow Authorization:** We need to confirm if `character::borrow_owner_cap` solely checks `ctx.sender() == character.character_address`, or if it requires passing in the `PlayerProfile` object as well. (The normalized module signature only lists `&mut Character`, `Receiving`, and `&TxContext`, suggesting `ctx.sender` is the only check).

## 7. Tenant Authority Context & Risks

*   **Tenant Authority Mismatch:** Our active local wallet (`0xcfcf22...`) is **NOT** the owner of the currently bound Gate's Character (`0xe8e3...` / "mumuyu"). 
*   **Not a Universal Blocker:** This is a demonstration of the FrontierWarden multi-tenant authority model, not a product failure. The site owner (Kivik/Kodaxa) is not expected to own every world Gate. Each tenant (tribe/operator) must prove their own world Gate authority via their connected wallet/Character.
*   **Tenant Discovery Requirement:** For each tenant, OwnerCap discovery must run against that specific tenant's connected wallet/Character. If we attempt to run this transaction now as the site owner, it will correctly abort with an authorization failure.

## 8. Next Branch Recommendation

Before we can implement `codex/world-gate-extension-authorization-flow`, the frontend/indexer must be prepared to support operator-driven discovery and provisioning.
**Recommended next steps:**
1. Proceed with implementing the tenant authority model and discovery hooks.
2. The site owner is not required to be the one authorizing the gate; the tenant operator will authorize the extension themselves.
