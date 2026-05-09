# World Gate Ownership Resolution Report

## 1. Executive Summary
This report investigates the ownership mismatch identified in the `OwnerCap` discovery preflight. We analyzed the active local wallet (`0xcfcf...`) and all other wallets in the local keystore to determine if they control the necessary EVE `Character` or `OwnerCap<Gate>` objects. The investigation confirms that **no local wallet owns a Character or a Gate**, leaving us without the authority to authorize the `FrontierWarden` extension on the currently bound Gate or any other Gate.

## 2. Current Blocked Gate Authority Path
- **Bound world Gate:** `0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c`
- **Its OwnerCap:** `0xf0947247bcb8bbb6409eca42ad93ec21ef777bbda56dc22f1fbbf8a793f8d2d2`
- **OwnerCap Owner:** The `Character` object `0x83c90a36b8ec223d48aa9e3b7ccd4c9ed29ac18e2d488b518148b5d0e7402ca0`
- **Character Name:** `mumuyu`
- **Character Wallet:** `0xe8e3a759ebf1fdc69df24ab3a7d1ae99c382b672db2866e5853fb0bcaaffb2f6`
- **Active Local Wallet:** `0xcfcf2247346d7a0676e2018168f94b86e1d1263fd3afd6862685725c8c49db8f`

Because our active local wallet does not match the Character's controlling wallet, we cannot borrow the `OwnerCap<Gate>` to call `gate::authorize_extension`.

## 3. Active Wallet Character Discovery
To determine if our local wallets control *any* Characters, we queried the Sui RPC for `PlayerProfile` objects owned by each address in our keystore:
- `0xcfcf2247...` (busy-phenacite): **0 PlayerProfile objects found.**
- `0x33b4bfc8...` (festive-opal): **0 PlayerProfile objects found.**
- `0xb2159e60...` (nifty-chalcedony): **0 PlayerProfile objects found.**

Without a `PlayerProfile`, a wallet cannot control a `Character` object on the Stillness network.

## 4. Owned Gate Candidates
We additionally queried the RPC to check if any of our local wallets directly owned an `OwnerCap<Gate>` object (bypassing the Character borrow pattern entirely):
- `0xcfcf2247...`: **0 OwnerCap<Gate> objects found.**
- `0x33b4bfc8...`: **0 OwnerCap<Gate> objects found.**
- `0xb2159e60...`: **0 OwnerCap<Gate> objects found.**

## 5. Viable Binding Candidates
Based on the queries above, there are **0 viable owned Gate candidates** in the local environment. We do not have authority over any world Gate on the testnet.

## 6. Recommendation: Tenant Authority Model
The lack of Gate ownership by our local wallets is **not a failure**, but an accurate reflection of the **FrontierWarden multi-tenant authority model**. FrontierWarden is platform infrastructure. The site owner is not expected to own every Gate. Instead, each tenant (tribe/operator) must prove their own world Gate authority via their connected wallet and Character.

To unblock the development of the extension authorization flow, we must shift our focus to the operator experience:

1. **Implement Tenant Discovery:** Build the frontend hooks necessary to query the active connected wallet for its `PlayerProfile`, `Character`, and `OwnerCap<Gate>`. This allows any tenant to authorize their own Gate.
2. **Use current bound Gate with correct wallet:** Acquire the private key for `0xe8e3a759ebf1fdc69df24ab3a7d1ae99c382b672db2866e5853fb0bcaaffb2f6` (the owner of Character "mumuyu") and connect it to the dashboard.
3. **Acquire/Create a new Gate:** Log into the EVE testnet, create a new Character using one of the local wallets, and acquire a world Gate. Then, rebind the policy to test the flow yourself.

## 7. Next Branch Recommendation
The next branch should pivot toward building the infrastructure for the tenant operators:

**`codex/operator-owned-gate-discovery-hook`**
This branch will build the React hooks and RPC queries necessary for any connected operator to discover their own Gate authority, fully realizing the multi-tenant architecture.
