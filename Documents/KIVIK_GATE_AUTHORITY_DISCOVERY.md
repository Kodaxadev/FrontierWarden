# Kivik Gate Authority Discovery

## 1. Executive Summary
This report investigates the on-chain EVE identity and Gate authority for the user's actual identity, "Kivik". While we successfully resolved Kivik's `PlayerProfile` and `Character` objects, we confirmed that **Kivik does not own any world Gate**. Neither the wallet nor the Character object possesses an `OwnerCap<Gate>`, which is strictly required to authorize the FrontierWarden extension.

## 2. Corrected Identity Facts
- **Wallet Address:** `0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`
- **Character Name:** Kivik
- **Grace ID:** `0xeA045D3D7C5631AA1B29b502282E49Fa77188E1B`
- **Character Item ID:** `2112089652`

## 3. Kivik Character / PlayerProfile Discovery
We queried the Sui RPC for `PlayerProfile` objects owned by the wallet `0xabff...` and successfully resolved the identity path:
- **PlayerProfile Object ID:** `0x2a9d6b4980644abfa89a5191cc19f9e14bf4357316689a12317e706c5e09ba68`
- **Character Object ID:** `0x3518e8590b7d353c9cf29da9df6d02d8cbf31b2edbd1b8439afc4afd9992ae9a` (Shared Object)

A query of the `Character` object confirmed the `character_address` matches the wallet, and the `name` is "Kivik".

## 4. OwnerCap<Gate> Discovery Results
To authorize the FrontierWarden extension on a world Gate, the controlling entity must possess an `OwnerCap<Gate>`. In EVE Frontier, this capability is typically transferred to the Character object via the `AddressOwner` pattern.

We queried both the wallet and the Character object for `OwnerCap<Gate>`:
- **Owned by Wallet (`0xabff...`):** 0 `OwnerCap<Gate>` objects found.
- **Owned by Character (`0x3518...`):** 0 `OwnerCap<Gate>` objects found.

*Note: We discovered that the Character currently owns `OwnerCap<Assembly>`, `OwnerCap<NetworkNode>`, and `OwnerCap<Character>`, but the extension authorization strictly requires `OwnerCap<Gate>`.*

## 5. Owned Gate Candidates
There are **0 owned world Gate candidates** associated with the Kivik identity.

## 6. Viable Rebind Candidates
There are **0 viable rebind candidates**. We cannot rebind FrontierWarden to a new Gate because no such Gate exists under Kivik's control.

## 7. Tenant Authority Context & Recommendation
The lack of Gate ownership by the site owner (Kivik) is **not a product failure or a universal blocker**. It is an expected outcome of the FrontierWarden **multi-tenant authority model**. 
The site owner is not expected to own every world Gate. Each tenant/operator connecting to the dashboard will bring their own wallet, Character, and `OwnerCap<Gate>`, and will authorize the extension themselves.

To proceed with testing the authorization flow as the site owner, the user must:
1. Log into the EVE Frontier testnet client.
2. Acquire, build, or otherwise claim control of a world Gate using the Kivik character.
3. Verify that the `OwnerCap<Gate>` is successfully assigned to the Kivik Character object.

Once Kivik owns a Gate, we can safely rebind FrontierWarden to that Gate and test the authorization flow. Alternatively, we can proceed with building the tenant discovery tools so that *any* connected operator can discover their own Gate authority.

## 8. Next Branch Recommendation
The recommended next branch is:
**`codex/operator-owned-gate-discovery-hook`**

This branch will focus on building the frontend logic required for any connected tenant operator to discover their own `PlayerProfile`, `Character`, and `OwnerCap<Gate>`, aligning the codebase with the true multi-tenant authority model.
