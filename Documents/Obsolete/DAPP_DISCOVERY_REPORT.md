# FRONTIERWARDEN DAPP DISCOVERY REPORT
## EVE Frontier Official dApp Integration Research
### Date: April 26, 2026

---

## EXECUTIVE SUMMARY

This report consolidates all research on the official EVE Frontier dApp integration surface as of April 26, 2026. The key finding: **EVE Frontier is in a dual-chain transition state** — the live game runs on EVM (Redstone L2 / MUD Framework), while CCP is actively migrating to Sui. The `@evefrontier/dapp-kit` package is a **Sui-only React SDK** that does not connect to the live EVM game. This creates a critical architectural decision for FrontierWarden.

**Bottom line:** Your protocol is deployed on Sui devnet. The live game is on EVM. The dapp-kit is for Sui. You cannot use dapp-kit to interact with live Smart Assemblies today. You need a **dual-chain frontend strategy**.

---

## 1. @EVEFRONTIER/DAPP-KIT (SUI-ONLY SDK)

### 1.1 Package Identity

| Field | Value |
|---|---|
| **Package name** | `@evefrontier/dapp-kit` |
| **Current version** | `v0.1.7` |
| **Registry** | npm (public) |
| **Install command** | `pnpm add @evefrontier/dapp-kit` |
| **Peer dependencies** | `@tanstack/react-query`, `react` |
| **Companion packages** | `@eveworld/ui-components` (Material UI + Tailwind) |

Source: [^80^]

### 1.2 Core Hooks & Providers

#### `EveFrontierProvider`

```tsx
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <EveFrontierProvider queryClient={queryClient}>
      <MyDapp />
    </EveFrontierProvider>
  );
}
```

**Requirements:**
- Must wrap app with `QueryClient` from `@tanstack/react-query`
- Must keep `react`, `@mysten/dapp-kit-react`, and `@mysten/sui` versions in sync with the package's declared ranges

Source: [^80^]

#### `useConnection`

```tsx
const { isConnected, handleConnect } = useConnection();
```

**Returns:**
- `isConnected: boolean` — whether a wallet session is active
- `handleConnect: () => void` — triggers the connection flow

**Critical behavior:** This hook does NOT return a standard Sui wallet adapter. It returns an EVE Vault-specific connection state. The connection flow goes through **EVE Vault** (FusionAuth OAuth + zkLogin), not through a browser wallet extension.

Source: [^80^] [^84^]

#### `useSmartObject`

```tsx
const { assembly, loading } = useSmartObject();
```

**Returns:**
- `assembly: SmartAssembly | undefined` — the linked Smart Assembly data
- `loading: boolean` — fetch state

**Configuration:** The Smart Assembly is configured via:
- Environment variable: `VITE_OBJECT_ID` (Sui Object ID)
- URL parameters: `?itemId=...&tenant=...`

**Tenant support:** The SDK supports multiple game shards (Stillness, Utopia, etc.). The `tenant` parameter determines which shard's data to load.

Source: [^80^]

#### `useNotification`

Purpose: Display in-game notifications to the player. Exact signature not documented in public sources.

#### `useSponsoredTransaction`

**Purpose:** Submit transactions without the player needing SUI for gas.

**Gas sponsor:** The documentation does not explicitly state who pays. Based on Sui ecosystem patterns and CCP's partnership with Mysten Labs, the likely sponsors are:
1. **CCP/Mysten Labs** — for player onboarding transactions (zkLogin + sponsored tx is the standard Sui onboarding pattern)
2. **The dapp developer** — for custom contract interactions (you would need to run a gas station)

**Critical unknown:** Whether `useSponsoredTransaction` can sponsor transactions to **your** Sui devnet contracts, or only to CCP's official Sui contracts. The Sui migration is not yet live in-game.

Source: [^38^] [^80^]

### 1.3 Subpath Exports

| Subpath | Contents |
|---|---|
| `@evefrontier/dapp-kit` | Default: providers, hooks, types, utils |
| `@evefrontier/dapp-kit/graphql` | GraphQL client, queries, response types |
| `@evefrontier/dapp-kit/types` | Type definitions only |
| `@evefrontier/dapp-kit/utils` | Utilities (parsing, transforms, config) |
| `@evefrontier/dapp-kit/hooks` | Hooks only |
| `@evefrontier/dapp-kit/providers` | Providers only |
| `@evefrontier/dapp-kit/config` | Config / dApp kit setup |

Source: [^80^]

### 1.4 Full API Documentation

**URL:** http://sui-docs.evefrontier.com/

This is a TypeDoc-generated site. The search results confirm it exists but do not scrape the full hook signatures. You should browse this directly for:
- Exact `useSponsoredTransaction` parameters
- `useNotification` signature
- GraphQL query shapes
- Type definitions for `SmartAssembly`, `Tenant`, etc.

---

## 2. EVE VAULT AUTHENTICATION (FUSIONAUTH + ZKLOGIN)

### 2.1 Architecture Overview

EVE Vault is **not** a standard browser wallet. It is a Chrome extension + web app that:

1. Authenticates the player via **FusionAuth OAuth** (EVE Frontier's identity provider)
2. Derives a **zkLogin address** on Sui using Enoki (Mysten Labs' zkLogin service)
3. Exposes the derived address via the **Sui Wallet Standard**

Source: [^84^]

### 2.2 How It Works

```
Player clicks "Sign in with EVE Vault"
         │
         ▼
OAuth flow to FusionAuth (EVE Frontier account)
         │
         ▼
zkLogin address derivation via Enoki API
         │
         ▼
Sui wallet address created (no private key exposed to player)
         │
         ▼
Address exposed to dapps via Sui Wallet Standard
```

**Key characteristic:** The player never manages a seed phrase or private key. The wallet is non-custodial but abstracted behind OAuth.

Source: [^71^] [^84^]

### 2.3 Multi-Tenant / Multi-Network

| Feature | Status |
|---|---|
| **Networks** | Devnet, Testnet (switchable in UI) |
| **Tenants** | Stillness, Utopia, Tauceti, Tesseract, Tetra, Tiaki |
| **Per-network auth** | ✅ Separate login sessions per network |
| **Auto-rollback on failure** | ✅ If login fails on one network, falls back |

Source: [^84^]

### 2.4 dApp Integration Pattern

```tsx
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";

<WalletProvider
  autoConnect
  walletFilter={(wallet) => wallet.name.includes("Eve Vault")}
>
  <App />
</WalletProvider>
```

**Important:** This uses `@mysten/dapp-kit` (the standard Sui SDK), not `@evefrontier/dapp-kit`. EVE Vault registers itself as "Eve Vault" in the page context. The standard Sui `WalletProvider` discovers it automatically.

Source: [^84^]

### 2.5 Implications for FrontierWarden

| Question | Answer |
|---|---|
| Does dapp-kit replace standard Sui wallet connect? | **No** — it wraps and specializes it for EVE Vault |
| Can players use Phantom, Sui Wallet, etc.? | **No** — dapp-kit filters to EVE Vault only |
| Is the wallet non-custodial? | **Yes** — but abstracted behind OAuth |
| Does the player need SUI? | **Not for sponsored transactions** |
| What chain does the wallet point to? | **Sui** — but the live game is still on EVM |

---

## 3. THE DUAL-CHAIN PROBLEM (CRITICAL)

### 3.1 Current State of EVE Frontier

| Layer | Technology | Status |
|---|---|---|
| **Live game (in-game)** | EVM L2 (Redstone, OP Stack) + MUD Framework | ✅ Active |
| **Smart Assemblies in-game** | Solidity contracts on MUD world | ✅ Active |
| **External API** | Public API to live universe data | ✅ Active |
| **Sui migration** | Move contracts, zkLogin, sponsored tx | 🔄 In progress (testnet) |
| **CCP's Sui contracts** | `evefrontier/world-contracts` | 🔄 "Future use, not active" |

Sources: [^102^] [^91^] [^94^]

### 3.2 What This Means

**The `@evefrontier/dapp-kit` connects to Sui. Your live game is on EVM.**

A player using your dapp via dapp-kit would be interacting with:
- ✅ Your Sui devnet protocol (attestations, scores, lending)
- ❌ **NOT** the live Smart Assemblies (gates, turrets, SSUs)
- ❌ **NOT** the live game state (character data, inventory, location)

The live `canJump` gate logic is a **Solidity function on MUD**, not a Sui Move function:

```solidity
// Live gate contract (EVM/MUD)
function canJump(uint256 characterId, uint256 sourceGateId, uint256 destinationGateId) 
    public view returns (bool) {
    uint256 characterCorpId = CharactersTable.getCorpId(characterId);
    return characterCorpId == MY_CORP_ID;
}
```

Source: [^34^]

### 3.3 CCP's Sui Contracts (Future)

CCP has published `evefrontier/world-contracts` — Sui Move contracts for EVE Frontier. However, the repo explicitly states:

> "This repository contains code intended for future use. While it's not currently active in game or production ready, it is being shared early for visibility, collaboration, review and reference."

Source: [^91^]

**The current live contracts are at:** `projectawakening/world-chain-contracts` (Solidity/MUD)

---

## 4. BUILDER EXAMPLES & SMART GATE PATTERNS

### 4.1 Official Builder Examples

**Repository:** `github.com/projectawakening/builder-examples` [^31^]

**Examples:**
- 📦 **Smart Storage Unit** — Create a SSU vending machine for item trading
- 🎯 **Smart Turret** — Configure a Smart Turret with a custom strategy
- 🚪 **Smart Gate** — Control access based on Tribe membership

**Setup pattern:**
```bash
# 1. Install tools (Git, NVM, Node 20, PNPM, Foundry)
# 2. Deploy local world: docker compose up
# 3. Copy world address from logs
# 4. cd smart-gate && cat readme.md
```

Source: [^31^]

### 4.2 Smart Gate `canJump` Interface (EVM/Solidity)

The official template for gate access control:

```solidity
contract MySmartGateSystem is System {
  uint256 public constant MY_CORP_ID = 2000137;

  function canJump(
    uint256 characterId,
    uint256 sourceGateId,
    uint256 destinationGateId
  ) public view returns (bool) {
    uint256 characterCorpId = CharactersTable.getCorpId(characterId);
    return characterCorpId == MY_CORP_ID;
  }
}
```

**Key insight:** `canJump` is a `view` function that reads from MUD tables (`CharactersTable`). It does not call external contracts. To integrate your reputation protocol, a gate operator would need to either:
1. **Mirror reputation data into MUD tables** (complex, requires CCP cooperation)
2. **Use an off-chain oracle** that the Solidity contract queries (not currently supported by MUD)
3. **Wait for Sui migration** where your Move contracts can be called directly

Source: [^34^]

### 4.3 Community Example: ef_guard Gate

**Repository:** `brainy-bots/efguard-gate-example` [^108^]

This replaces the standard tribe-membership check with an `ef_guard` access control system. It demonstrates that the builder scaffold can be modified for custom gate logic, but still within the EVM/MUD framework.

---

## 5. EVE TOKEN & ON-CHAIN ECONOMY

### 5.1 EVE Token (ERC-20 on Redstone)

| Field | Value |
|---|---|
| **Chain** | Redstone (EVM L2, OP Stack) |
| **Standard** | ERC-20 |
| **Decimals** | 18 |
| **Contract** | Not verified in search results; likely deployed via MUD world |
| **Usage** | In-game currency for tolls, trades, bounties |

**Note:** The search results found the Redstone (RED) token contract at `0xc43c...` [^105^], but this is the **Redstone chain's native token**, not the EVE game token. The EVE token contract address is not publicly indexed on Etherscan.

### 5.2 MUD Table Representation

In the MUD framework, tokens are represented as:
- **ERC-20 tokens:** Standard Solidity contracts deployed in the MUD world
- **In-game items:** Singletons (unique NFT-like objects) recorded on-chain [^71^]
- **Character data:** MUD tables (`CharactersTable`, `InventoryTable`, etc.)

Your protocol's `ScoreCache` on Sui does not natively read these tables. You need:
- An **EVM listener** (ethers-rs) to index MUD events
- A **mapping layer** that correlates EVM character IDs with Sui zkLogin addresses

---

## 6. SHIP JUMP MECHANICS (FOR ROUTE PLANNING)

### 6.1 Jump Range Formula

```
range = (ΔT × C_eff × M_hull) / (3 × M_current)

Where:
  ΔT = 150 - ship_temperature (equilibrates to system external temp)
  C_eff = specific_heat × (1 + adaptive_level × 0.02)
  M_hull = ship base mass in kg
  M_current = total loaded mass (hull + cargo + fuel)
```

Source: [^99^]

### 6.2 External Temperature (Heat Index)

```
H(D) = 100 × (2/π) × arctan(K × 2π × √(L / L_sun) / D)

Where:
  L_sun = 3.828 × 10²⁶ watts
  K = 100 (distance scale constant)
  D = distance from star in light-seconds
```

**Critical thresholds:**
| Zone | Temperature | Effect |
|---|---|---|
| Red (heat trap) | ≥ 90 | **No fuel jumps possible** |
| Orange | 80–89 | Significantly reduced range |
| Yellow | 70–79 | Moderately reduced range |
| White (safe) | < 70 | Normal range |

Source: [^99^]

### 6.3 Ship Specifications (Selected)

| Ship | Mass (kg) | Specific Heat | Fuel Capacity | Cargo |
|---|---|---|---|---|
| **Reflex** (starter) | 9,750,000 | 3.0 | 1,750 | 520 m³ |
| **Recurve** | 10,200,000 | 1.0 | 970 | 520 m³ |
| **Lai** | 18,929,160 | 2.5 | 2,400 | 1,040 m³ |
| **USV** | 30,266,600 | 1.8 | 2,420 | 3,120 m³ |
| **Maul** (capital) | 548,435,920 | 2.5 | 24,160 | 20,800 m³ |

Source: [^99^]

### 6.4 Fuel & Distance

```
distance = (fuel_quantity × fuel_quality) / (0.0000001 × ship_mass)
```

Fuel quality varies (e.g., SOF-40 = 0.40 quality). Smart Gates and stargates cost **zero fuel**.

### 6.5 Routing Algorithms

| Algorithm | Use Case |
|---|---|
| A* | Fast heuristic, may use slightly more fuel |
| Dijkstra | Optimal fuel/jump count guarantee |
| Dijkstra WASM | 2–5× speed improvement |
| Dijkstra WASM Temp-Limited | Temperature-aware, avoids heat traps |

Source: [^99^]

---

## 7. MIGRATION ASSESSMENT: WHAT CHANGES FOR FRONTIERWARDEN

### 7.1 Your Current Frontend

| Feature | Current Implementation |
|---|---|
| CONNECT wallet | `@mysten/sui` generic SDK |
| REPORT INCIDENT | On-chain attestation (Sui Move) |
| CREATE BOUNTY | On-chain attestation (Sui Move) |
| GET /intel/:system_id | Read-only API call |

### 7.2 What dapp-kit Changes

| Feature | Change Required |
|---|---|
| CONNECT wallet | **Replace** `@mysten/sui` wallet connect with `EveFrontierProvider` + `useConnection` |
| REPORT INCIDENT | **Keep** Sui transaction, but wrap with your gas station (POST /sponsor-attestation) |
| CREATE BOUNTY | **Keep** Sui transaction, but wrap with your gas station (POST /sponsor-attestation) |
| GET /intel/:system_id | **No change** — read-only, no wallet needed |

### 7.3 What dapp-kit Does NOT Solve

| Problem | Status |
|---|---|
| Connect to live Smart Assemblies | ❌ dapp-kit is Sui-only; live game is EVM |
| Read live character location | ❌ No live game state in Sui yet |
| Submit gate attestation to live gate | ❌ Live gates are Solidity, not Move |
| Query MUD `CharactersTable` | ❌ dapp-kit has no EVM provider |

### 7.4 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTIERWARDEN FRONTEND                    │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React + Canvas 2D)                               │
│  ├── @evefrontier/dapp-kit (Sui wallet + EVE Vault auth)    │
│  └── @mysten/sui (for direct Sui interactions when gas station unavailable)     │
├─────────────────────────────────────────────────────────────┤
│  API Layer                                                    │
│  ├── /v1/intel/:system_id (read-only, no auth)              │
│  ├── /v1/score/:player (read-only, no auth)               │
│  └── /v1/evaluate (read-only, no auth)                      │
├─────────────────────────────────────────────────────────────┤
│  Transaction Layer (Sui only)                                 │
│  ├── Your gas station (primary)                            │
│  └── Direct @mysten/sui calls (for complex multi-move calls)│
├─────────────────────────────────────────────────────────────┤
│  EVM Bridge (future)                                          │
│  └── ethers.js + MUD world ABI (for live game state)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. USESPONSOREDTRANSACTION DEEP DIVE

### 8.1 What We Know

- The hook exists in `@evefrontier/dapp-kit`
- Sui ecosystem standard: sponsored transactions let dapps pay gas for users
- CCP/Mysten partnership includes "gasless interactions through Sponsored Transactions" [^38^]

### 8.2 What We Don't Know (RESOLVED — April 26, 2026)

*Following the Nemotron source inspection, all unknowns are now resolved:*

| Previously Unknown | Finding |
|---|---|
| 1. **Who is the gas sponsor?** | CCP runs a managed gas station for Smart Assembly interactions only |
| 2. **Does it work on devnet?** | Yes, but only for CCP's assembly-specific endpoints |
| 3. **Can it sponsor arbitrary Move calls?** | **No** — `SponsoredTransactionInput` requires `assembly` + `assemblyType`, has no `packageId`/`target` |
| 4. **Rate limits?** | Unknown — not documented in public sources |

**Confirmed answer:** CCP's `useSponsoredTransaction` routes to assembly-specific endpoints and **cannot** sponsor third-party Move contracts (your attestations). Your gas station is the primary path.

### 8.3 Recommendation

**`useSponsoredTransaction` cannot sponsor third-party Move contracts.** Build your gas station as the primary path. Fallback: Direct SUI payment via `@mysten/sui` for players who have SUI in their wallet.

---

## 9. HACKATHON WINNER REPOS (PUBLIC AVAILABILITY)

| Winner | Repo Status | Overlap with FrontierWarden |
|---|---|---|
| **CradleOS** (1st) | Not found in search | None — civilization dashboard |
| **Blood Contract** (2nd) | Not found in search | Bounty marketplace only |
| **Civilization Control** (3rd) | Not found in search | Gate management UI only |
| **EasyAssemblies** (Utility) | Not found | SSU config only |
| **Frontier Flow** (Technical) | Not found | No-code generator |
| **Bazaar** (Creative) | Not found | Marketplace only |
| **Shadow Broker** (Weirdest) | Not found | Espionage tradecraft |

**Finding:** None of the hackathon winner repos are publicly indexed. They may be private, unlisted, or not yet published. This limits competitive analysis to the descriptions in the winner announcements.

---

## 10. ACTIONABLE RECOMMENDATIONS

### 10.1 Immediate (This Week)

1. **Browse sui-docs.evefrontier.com directly** — scrape all hook signatures, especially `useSponsoredTransaction` and `useNotification`
2. **Install `@evefrontier/dapp-kit` locally** — inspect the TypeScript definitions in `node_modules` for exact types
3. **Check EVE Vault extension** — install from GitHub releases, observe the network selector, confirm devnet/testnet behavior

### 10.2 Short-Term (Next 2 Weeks)

4. **Build dual-chain frontend architecture**:
   - Sui layer: `@evefrontier/dapp-kit` for wallet + your protocol transactions
   - EVM layer: `ethers.js` + MUD ABI for live game state (character, location, inventory)
   - Bridge layer: Your indexer correlates EVM character IDs with Sui zkLogin addresses
5. **Implement gas station** (primary path — CCP cannot sponsor third-party Move contracts):
   - Your gas station is the primary path
   - Fallback: Direct SUI payment via `@mysten/sui`
6. **Create `DEVNET_NOTES.md`** — track package IDs, Windows workarounds, sponsor status

### 10.3 Medium-Term (Sprint 2)

7. **Validate CradleOS integration surface** — reach out to CradleOS team (attending EVE Fanfest) to confirm if they expose middleware hooks
8. **Build TrustKit mock API** — 3-primitive surface (`getScore`, `evaluate`, `subscribe`) with realistic mock data for demos
9. **Wire real scores** — connect indexer to `ScoreCache`, replace mock data

---

## 11. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sui migration delayed | Medium | High | Maintain EVM bridge as primary data source |
| `useSponsoredTransaction` incompatible with third-party Move | High | High | Your gas station is the primary path |
| EVE Vault only supports CCP's Sui contracts | Low | High | Use `@mysten/dapp-kit` directly for custom contracts |
| Devnet wipes erase player data | High | Medium | Mock-first API; testnet as stable reference |
| Dual-chain architecture complexity | High | Medium | Document clearly; separate EVM and Sui concerns |
| Hackathon winners publish competing reputation layer | Low | High | None needed — 123 submissions, zero reputation protocols |

---

## 12. REFERENCES

| Citation | Source | Date |
|---|---|---|
| [^31^] | `projectawakening/builder-examples` (GitHub, S) | Apr 15, 2026 |
| [^34^] | Dev.to Smart Infrastructure Guide (B) | Oct 8, 2024 |
| [^38^] | Sui Blog — Hackathon Announcement (NA) | Feb 12, 2026 |
| [^67^] | evefrontier.com/build — Smart Assemblies (NA) | Current |
| [^71^] | EVE Frontier Whitepaper — Web3 Gameplay (NA) | Oct 8, 2025 |
| [^80^] | `sui-docs.evefrontier.com` — dapp-kit docs (NA) | Current |
| [^84^] | `evefrontier/evevault` (GitHub, S) | Dec 18, 2025 |
| [^91^] | `evefrontier/world-contracts` (GitHub, S) | Apr 16, 2026 |
| [^94^] | `projectawakening/world-chain-contracts` (GitHub, S) | Jan 18, 2024 |
| [^99^] | EF-Map AI Facts — Ship Mechanics (NA) | Feb 18, 2026 |
| [^102^] | Blockworks — EVE Frontier Crypto (B) | Aug 4, 2025 |
| [^105^] | Etherscan — Redstone Token (B) | Current |
| [^108^] | `brainy-bots/efguard-gate-example` (GitHub, S) | Mar 30, 2026 |

---

*Research current as of April 26, 2026. The dual-chain reality is the dominant constraint. Build for Sui with an EVM bridge, not Sui alone.*
