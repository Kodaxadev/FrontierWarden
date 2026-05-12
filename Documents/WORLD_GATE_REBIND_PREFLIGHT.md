# World Gate Rebind Preflight

## 1. Current Blocker Summary
The current authorization flow for the FrontierWarden extension is critically blocked due to a severe authority mismatch:
- The currently configured world Gate (`0x019f...`) is controlled by the Character "mumuyu", whose controlling wallet is `0xe8e3...`.
- Our local environment wallets (including the active `0xcfcf...`) possess **0 `PlayerProfile` objects** and **0 `OwnerCap<Gate>` objects**.
- Without an owned `Character` and its corresponding `OwnerCap<Gate>`, our local wallets physically cannot construct or sign the `borrow_owner_cap` -> `authorize_extension` Programmable Transaction Block (PTB).

## 2. In-Game/On-Chain Steps to Resolve
To overcome this blocker, the local wallet must acquire world Gate ownership. This requires the following actions, typically performed via the EVE Frontier client or CLI:
1. **Wallet Initialization:** Ensure the target wallet (`0xcfcf...` or another local wallet) has sufficient testnet SUI for gas.
2. **Character Creation:** Register a new `PlayerProfile` and instantiate a `Character` object tied to the active wallet.
3. **Gate Acquisition/Construction:** Deploy or claim ownership of a world Gate on the Stillness network, ensuring the resulting `OwnerCap<Gate>` is assigned to the newly created `Character` via the `AddressOwner` pattern.

## 3. Required Owned-Gate Evidence Checklist
Before executing any rebind transaction on-chain, the following data must be definitively gathered and verified for the newly acquired Gate:

- [ ] **Character Wallet Address:** Must match an available key in the local keystore.
- [ ] **Character Object ID:** The shared Character object controlled by the wallet.
- [ ] **World Gate Object ID:** The target Gate to bind to FrontierWarden.
- [ ] **OwnerCap<Gate> Object ID:** The capability object owned by the Character (stored as `AddressOwner`).
- [ ] **Linked Gate ID:** (Optional but recommended) The ID of the destination gate, verifying the Gate is operational.
- [ ] **Online/Offline Status:** Ensure the Gate is actively `ONLINE` on the Stillness testnet.

## 4. Safe Rebind Transaction Path
Once a new Gate is acquired, FrontierWarden must be rebound to point to it. This path must be strictly followed to prevent accidental authorization or state corruption:
1. **Target Identification:** Identify the current `GateAdminCap` (`0x7876d36be78743903085fb0e32e56fa82424fbc6f0ee4997e9a237a14b2253a3`) and the active `GatePolicy` (`0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807`).
2. **Execution:** Use the `GateAdminCap` to call `reputation_gate::bind_world_gate`, pointing it at the **new** world Gate object ID.
3. **Invariants Preserved:**
   - The rebind *only* updates the `GatePolicy` -> `world_gate_id` mapping.
   - The rebind **DOES NOT** call `gate::authorize_extension`.
   - The system status remains **BOUND, not BINDING VERIFIED**.
   - `GateAdminCap` strictly remains separate from `OwnerCap<Gate>`.

## 5. Required Configuration and Documentation Updates
Following a successful rebind transaction, the following artifacts must be updated to reflect the new truth:
- **`.env.local`**: Update `VITE_WORLD_GATE_ID` (and any related `VITE_GATE_OWNER` or `VITE_GATE_CHARACTER_ID` variables).
- **`scripts/testnet-addresses.json`**: Record the new `world_gate_id` and the transaction digest of the rebind.
- **Frontend / Indexer Configs**: Ensure any hardcoded or referenced Gate IDs are migrated.
- **`Documents/WORLD_TOPOLOGY_SPIKE.md`**: Update the "Bound world Gate" reference to reflect the new state.

## 6. Risks
- **Asset Acquisition Delay:** Acquiring a Gate on the testnet may require specific in-game resources or faucet access, potentially blocking immediate progress.
- **State Desync:** If the `.env.local` is updated before the on-chain rebind occurs, the frontend will attempt to query a Gate that the `GatePolicy` does not yet recognize.
- **Accidental Authorization:** Developers might be tempted to bundle the rebind and the extension authorization into a single PTB. This violates the `BOUND` invariant and must be avoided.

## 7. Next Branch Recommendation
Wait for the user to confirm they have successfully acquired a world Gate and provided the required evidence checklist.
Once the evidence is collected, the next branch should be:
**`codex/world-gate-rebind-execution`**
This branch will solely execute the `reputation_gate::bind_world_gate` PTB and update the `.env.local` configuration, strictly maintaining the `BOUND` state.
