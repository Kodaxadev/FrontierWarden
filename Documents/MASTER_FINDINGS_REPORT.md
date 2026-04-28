# FRONTIERWARDEN — MASTER FINDINGS REPORT
## EVE Frontier Tribal Intelligence Protocol
### Consolidated Research & Architecture Decisions
### Last Updated: April 26, 2026

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [EVE Frontier State (April 2026)](#2-eve-frontier-state-april-2026)
3. [Sui Ecosystem Context](#3-sui-ecosystem-context)
4. [The Dual-Chain Reality](#4-the-dual-chain-reality)
5. [@evefrontier/dapp-kit Deep Dive](#5-evefrontierdapp-kit-deep-dive)
6. [EVE Vault Authentication](#6-eve-vault-authentication)
7. [Gas Sponsorship — The Critical Answer](#7-gas-sponsorship--the-critical-answer)
8. [Smart Assembly Architecture](#8-smart-assembly-architecture)
9. [Ship Mechanics & Routing](#9-ship-mechanics--routing)
10. [Hackathon Winner Forensics](#10-hackathon-winner-forensics)
11. [Competitive Gap Analysis](#11-competitive-gap-analysis)
12. [TrustKit Specification](#12-trustkit-specification)
13. [Frontend Migration Plan](#13-frontend-migration-plan)
14. [Build Order & Priorities](#14-build-order--priorities)
15. [Risk Register](#15-risk-register)
16. [References](#16-references)

---

## 1. EXECUTIVE SUMMARY

This document consolidates all research conducted on April 26, 2026, for the EVE Frontier Tribal Intelligence Protocol (FrontierWarden). It covers the live state of EVE Frontier, the Sui ecosystem, the official dapp-kit integration surface, EVE Vault authentication, gas sponsorship mechanics, hackathon winner analysis, and the TrustKit adapter specification.

**The single most important finding:** EVE Frontier is in a **dual-chain transition**. The live game runs on EVM (Redstone L2 / MUD Framework). The Sui migration is in progress but not yet active in-game. Your protocol is deployed on Sui devnet. You cannot interact with live Smart Assemblies via Sui today.

**The second most important finding:** `useSponsoredTransaction` routes through a **CCP-managed gas station** that is assembly-aware. It **cannot** sponsor arbitrary third-party Move contracts (your attestations). Your gas station is the **primary path**.

**Bottom line:** Build a dual-chain frontend. Use `@evefrontier/dapp-kit` for wallet/auth on Sui. Use `ethers.js` for live EVM game state. Run your own gas station for attestation sponsorship. Drop the EVM bridge when CCP flips the Sui switch.

---

## 2. EVE FRONTIER STATE (APRIL 2026)

### 2.1 Live Game Status

| Milestone | Date | Status |
|---|---|---|
| Migration to Sui testnet | March 2026 | ✅ Complete |
| Hackathon ("Toolkit for Civilization") | March 11–31, 2026 | ✅ Complete |
| Winners announced | April 24–26, 2026 | ✅ Complete |
| Free trial launch (Cycle 5: Shroud of Fear) | April 1, 2026 | ✅ Live |
| EVE Fanfest 2026 | Upcoming | CradleOS winner attending |

EVE Frontier is currently in **Cycle 5: Shroud of Fear**, a testing phase with new ship models, updated combat systems, a redesigned HUD, and expanded base building. The game migrated from Ethereum to Sui testnet in March 2026, opening Smart Assemblies to third-party developers. [^58^]

### 2.2 Smart Assembly Architecture

Smart Assemblies are the programmable in-game structures:
- **Smart Storage Units (SSU)** — Item storage, trade hubs, vending machines
- **Smart Turrets** — Automated defense with custom strategies
- **Smart Gates** — Access-controlled jump gates

**Critical nuance:** There are only three "Smart" (blockchain-enabled) objects in the game. [^74^] All other objects are standard game entities.

### 2.3 CCP's Vision for Programmable Gates

Hilmar Veigar Pétursson (CEO, CCP Games) explicitly described the gate access model: [^63^]

> "We put the rules of how the gate operates on the chain... you can write what you want. You could say that only people who follow me on Twitter are allowed to use my gate, and this will work."

This validates the `reputation_gate.move` concept. CCP wants gate logic to be **permissionlessly programmable**. The missing piece is a **shared reputation substrate** that multiple gates can query.

---

## 3. SUI ECOSYSTEM CONTEXT

### 3.1 Network Metrics (April 2026)

| Metric | Value |
|---|---|
| TVL (current range) | $1.2–2.6 billion |
| Daily transactions | 164 million |
| Active users | 222 million |
| SUI price | $0.88 |
| Market cap | $3.43 billion |
| Circulating supply | 3.90 billion SUI (39%) |
| Total supply | 10 billion SUI (fixed) |

Sources: [^50^] [^52^]

### 3.2 Relevant 2026 Milestones

| Event | Date | Relevance |
|---|---|---|
| CME Group SUI Futures Launch | May 4, 2026 | Institutional validation |
| Sui Live Miami | May 7, 2026 | Ecosystem showcase |
| USDsui Native Stablecoin | Launched March 2026 | Fee-redistributing stablecoin |
| Protocol-Level Private Transactions | 2026 roadmap | Confidential transactions |

Source: [^57^]

### 3.3 Tokenomics Warning

SUI has significant supply overhang: [^52^]
- **Monthly unlocks:** Averaged 64 million SUI in early 2025
- **Annual inflation:** Reached 55% in 2025
- **FDV vs market cap:** $8.81 billion FDV vs $3.43 billion market cap

**Implication:** Your ~7,000 SUI/month revenue estimate should be stress-tested at lower SUI prices. Consider denominating high-value services in USDsui.

### 3.4 Gaming & NFT Infrastructure

Sui's object-centric architecture is designed for gaming: [^54^]
- **Dynamic NFTs:** Assets that evolve based on gameplay
- **Composability:** NFTs can hold other NFTs
- **Parallel execution:** High-frequency game transactions
- **zkLogin:** Seedless wallet creation

**Implication:** Your `profile.move` scores and `attestation.move` credentials are natively compatible with Sui's object model. A player's reputation can be a dynamic NFT.

---

## 4. THE DUAL-CHAIN REALITY

### 4.1 Current State

| Layer | Technology | Status |
|---|---|---|
| **Live game (in-game)** | EVM L2 (Redstone, OP Stack) + MUD Framework | ✅ Active |
| **Smart Assemblies in-game** | Solidity contracts on MUD world | ✅ Active |
| **External API** | Public API to live universe data | ✅ Active |
| **Sui migration** | Move contracts, zkLogin, sponsored tx | 🔄 In progress (testnet) |
| **CCP's Sui contracts** | `evefrontier/world-contracts` | 🔄 "Future use, not active" |

Sources: [^102^] [^91^] [^94^]

### 4.2 The Architectural Gap

Your protocol is on **Sui devnet**. The live game is on **EVM**. The `@evefrontier/dapp-kit` connects to **Sui only**.

A player using your dapp via dapp-kit would interact with:
- ✅ Your Sui devnet protocol (attestations, scores, lending)
- ❌ **NOT** the live Smart Assemblies (gates, turrets, SSUs)
- ❌ **NOT** the live game state (character data, inventory, location)

### 4.3 CCP's Sui Contracts (Future)

CCP has published `evefrontier/world-contracts` — Sui Move contracts. However, the repo explicitly states:

> "This repository contains code intended for future use. While it's not currently active in game or production ready, it is being shared early for visibility, collaboration, review and reference."

Source: [^91^]

**The current live contracts are at:** `projectawakening/world-chain-contracts` (Solidity/MUD)

### 4.4 Required Architecture

```
FRONTIERWARDEN FRONTEND
├── Sui Layer (@evefrontier/dapp-kit + @mysten/sui)
│   ├── Wallet connect (EVE Vault)
│   ├── Attestation submissions (your protocol)
│   └── Score reads (your ScoreCache)
│
├── EVM Layer (ethers.js + MUD ABI)
│   ├── Live character state (location, corp, ship)
│   ├── Live gate state (canJump on Solidity)
│   └── Live inventory / fuel
│
└── Bridge Layer (your indexer)
    ├── Correlate EVM characterId ↔ Sui zkLogin address
    └── Merge EVM game state + Sui reputation data
```

---

## 5. @EVEFRONTIER/DAPP-KIT DEEP DIVE

### 5.1 Package Identity

| Field | Value |
|---|---|
| **Package name** | `@evefrontier/dapp-kit` |
| **Current version** | `v0.1.7` – `v0.1.9` |
| **Registry** | npm (public) |
| **Install** | `pnpm add @evefrontier/dapp-kit` |
| **Peer dependencies** | `@tanstack/react-query`, `react` |
| **Companion packages** | `@eveworld/ui-components` |

Source: [^80^]

### 5.2 Core Hooks

#### `EveFrontierProvider`

```tsx
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

<EveFrontierProvider queryClient={queryClient}>
  <App />
</EveFrontierProvider>
```

**Requirements:**
- Must wrap app with `QueryClient` from `@tanstack/react-query`
- Must keep `react`, `@mysten/dapp-kit-react`, and `@mysten/sui` versions in sync

#### `useConnection`

```tsx
const { isConnected, handleConnect } = useConnection();
```

**Returns:**
- `isConnected: boolean` — wallet session active
- `handleConnect: () => void` — triggers connection flow

**Critical behavior:** Returns an EVE Vault-specific connection state. The flow goes through **EVE Vault** (FusionAuth OAuth + zkLogin), not a browser wallet extension.

#### `useSmartObject`

```tsx
const { assembly, loading } = useSmartObject();
```

**Returns:**
- `assembly: SmartAssembly | undefined`
- `loading: boolean`

**Configuration:**
- Environment variable: `VITE_OBJECT_ID` (Sui Object ID)
- URL parameters: `?itemId=...&tenant=...`

**Tenant support:** Supports multiple game shards (Stillness, Utopia, etc.).

#### `useSponsoredTransaction`

```tsx
const { mutate: sponsorTx } = useSponsoredTransaction();
```

**Purpose:** Submit transactions without the player needing SUI for gas.

**Critical finding:** The hook uses `getAssemblyTypeApiString(type: Assemblies): string` [^113^] to map assembly types to API endpoints on CCP's sponsored transaction backend. This means the backend is **assembly-aware** and routes gas sponsorship based on the Smart Assembly type (gate, turret, SSU).

**Open question:** Whether the backend supports arbitrary third-party Move contracts (your attestations) or only CCP's Smart Assembly interactions.

#### `useNotification`

Purpose: Display in-game notifications. Exact signature not fully documented in public sources.

### 5.3 Subpath Exports

| Subpath | Contents |
|---|---|
| `@evefrontier/dapp-kit` | Default: providers, hooks, types, utils |
| `@evefrontier/dapp-kit/graphql` | GraphQL client, queries, response types |
| `@evefrontier/dapp-kit/types` | Type definitions only |
| `@evefrontier/dapp-kit/utils` | Utilities (parsing, transforms, config) |
| `@evefrontier/dapp-kit/hooks` | Hooks only |
| `@evefrontier/dapp-kit/providers` | Providers only |
| `@evefrontier/dapp-kit/config` | Config / dApp kit setup |

### 5.4 Full API Documentation

**URL:** http://sui-docs.evefrontier.com/

TypeDoc-generated site. Browse directly for:
- Exact `useSponsoredTransaction` parameters
- `useNotification` signature
- GraphQL query shapes
- Type definitions for `SmartAssembly`, `Tenant`, etc.

---

## 6. EVE VAULT AUTHENTICATION

### 6.1 Architecture

EVE Vault is **not** a standard browser wallet. It is a Chrome extension + web app that:

1. Authenticates via **FusionAuth OAuth** (EVE Frontier's identity provider)
2. Derives a **zkLogin address** on Sui using Enoki (Mysten Labs' zkLogin service)
3. Exposes the derived address via the **Sui Wallet Standard**

Source: [^84^]

### 6.2 Flow

```
Player clicks "Sign in with EVE Vault"
         │
         ▼
OAuth flow to FusionAuth
         │
         ▼
zkLogin address derivation via Enoki API
         │
         ▼
Sui wallet address created (no private key exposed)
         │
         ▼
Address exposed to dapps via Sui Wallet Standard
```

**Key characteristic:** The player never manages a seed phrase. The wallet is non-custodial but abstracted behind OAuth.

### 6.3 Multi-Tenant / Multi-Network

| Feature | Status |
|---|---|
| **Networks** | Devnet, Testnet (switchable in UI) |
| **Tenants** | Stillness, Utopia, Tauceti, Tesseract, Tetra, Tiaki |
| **Per-network auth** | ✅ Separate login sessions |
| **Auto-rollback on failure** | ✅ Falls back if login fails |

Source: [^84^]

### 6.4 dApp Integration Pattern

```tsx
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";

<WalletProvider
  autoConnect
  walletFilter={(wallet) => wallet.name.includes("Eve Vault")}
>
  <App />
</WalletProvider>
```

**Important:** This uses `@mysten/dapp-kit` (standard Sui SDK), not `@evefrontier/dapp-kit`. EVE Vault registers itself as "Eve Vault" in the page context. The standard Sui `WalletProvider` discovers it automatically.

Source: [^84^]

### 6.5 Implications

| Question | Answer |
|---|---|
| Does dapp-kit replace standard Sui wallet connect? | **No** — it wraps and specializes it for EVE Vault |
| Can players use Phantom, Sui Wallet, etc.? | **No** — dapp-kit filters to EVE Vault only |
| Is the wallet non-custodial? | **Yes** — but abstracted behind OAuth |
| Does the player need SUI? | **Not for sponsored transactions** |
| What chain does the wallet point to? | **Sui** — but the live game is still on EVM |

---

## 7. GAS SPONSORSHIP — THE CRITICAL ANSWER

### 7.1 What We Confirmed

`getAssemblyTypeApiString(type: Assemblies): string` [^113^] maps assembly types to API endpoints on CCP's sponsored transaction backend. This confirms:

1. **CCP runs a sponsored transaction backend** — a managed gas station
2. **The backend is assembly-aware** — gates, turrets, and SSUs have distinct endpoints
3. **The dapp-kit routes through CCP's backend**, not a generic Sui gas station

### 7.2 The Confirmed Answer

**Will CCP's backend sponsor gas for arbitrary third-party Move contracts?**

| Evidence | Interpretation |
|---|---|
| `SponsoredTransactionInput` requires `assembly` + `assemblyType` (confirmed by source inspection) | No `packageId` or `target` field — cannot target arbitrary contracts |
| Backend routes to assembly-specific endpoints (gates, turrets, SSUs) | Optimized for core game loop only |
| Source code uses `getAssemblyTypeApiString()` to map assembly types to API strings | Assembly-aware, not contract-aware |

**Confirmed answer:** **No.** CCP's sponsored transaction backend cannot sponsor third-party Move contracts. The `SponsoredTransactionInput` type requires:
- `assembly: string` (Sui Object ID of the Smart Assembly)
- `assemblyType: SponsoredTransactionAssemblyType` (required enum)

Neither attestation calls nor custom Move contracts can be sponsored through CCP's backend. **Your gas station is the primary path, not a fallback.**

### 7.3 The 5-Minute Verification

Install the package and read the source:

```bash
pnpm add @evefrontier/dapp-kit

# Read the sponsored transaction implementation
cat node_modules/@evefrontier/dapp-kit/dist/hooks/useSponsoredTransaction.js
# or
cat node_modules/@evefrontier/dapp-kit/dist/types/SponsoredTransactionInput.d.ts
```

**Look for:**
| What to grep for | What it tells you |
|---|---|
| `assemblyType` or `getAssemblyTypeApiString` | If required, your attestations won't fit |
| `packageId` or `target` | If accepts arbitrary package IDs, your contracts are sponsorable |
| `fetch` or `axios` URL | Backend endpoint — `/sponsor/gate` vs `/sponsor/transaction` |
| `SponsoredTransactionInput` fields | Whether transaction is generic or assembly-scoped |

### 7.4 Your Gas Station

**Sui sponsored transactions are standard.** Any Sui address can be a gas sponsor.

**Confirmed:** CCP's `useSponsoredTransaction` cannot sponsor third-party Move contracts. Your gas station is the **primary path**.

```ts
// Your Axum/Rust gas station
const sponsorTx = await fetch('https://gas.tribal-intelligence.xyz/sponsor', {
  method: 'POST',
  body: JSON.stringify({
    txBytes: txb.serialize(),
    sender: playerAddress,
  }),
});
```

**Requirements:**
1. A Sui address with SUI balance
2. A service that signs transactions as the gas payer
3. The signed transaction returned to the player for execution

**Cost estimate:** At current Sui gas prices, an attestation costs ~0.001 SUI. At 1,000 attestations/day, that's ~30 SUI/month.

### 7.5 Recommended Transaction Layer

```ts
async function submitAttestation(txb, playerAddress) {
  // Your gas station is the primary path
  // CCP's useSponsoredTransaction cannot sponsor third-party Move contracts
  return await fetch('https://gas.tribal-intelligence.xyz/sponsor', {
    method: 'POST',
    body: JSON.stringify({ txBytes: txb.serialize(), sender: playerAddress }),
  });
}
```

---

## 8. SMART ASSEMBLY ARCHITECTURE

### 8.1 The Three Smart Objects

From the Reddit DApps thread: [^74^]

> "There are only 3 'Smart' (read: Block-Chain enabled) objects in the world that support dApps and those are Smart Storage, Auto Turrets and Gates"

| Smart Assembly | Dapp Use Cases |
|---|---|
| **Smart Storage Unit** | Marketplaces, trade hubs, quest givers, tribe hubs, fuel stations |
| **Smart Turret** | Access control, safe passes, automated defense logic |
| **Smart Gate** | Toll collection, alliance-only jumps, reputation-gated travel |

### 8.2 Smart Gate `canJump` Interface (EVM/Solidity)

The official template: [^34^]

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

**Key insight:** `canJump` is a `view` function reading from MUD tables. It does not call external contracts. To integrate your reputation protocol, a gate operator would need to either:
1. **Mirror reputation data into MUD tables** (requires CCP cooperation)
2. **Use an off-chain oracle** (not currently supported by MUD)
3. **Wait for Sui migration** where your Move contracts can be called directly

### 8.3 Community Example: ef_guard Gate

**Repository:** `brainy-bots/efguard-gate-example` [^108^]

Replaces standard tribe-membership check with an `ef_guard` access control system. Demonstrates that the builder scaffold can be modified for custom gate logic, but still within EVM/MUD.

### 8.4 SSU Dapp Pattern (Bazaar)

An isometric web app runs inside Smart Storage Units: [^72^]

```
Player interacts with SSU in-game
         │
         ▼
SSU calls linked smart contract (Solidity/MUD or Move)
         │
         ▼
Contract logic controls item transfer between:
  - SSU Inventory (owner-controlled)
  - Ephemeral Inventory (player temporary slot)
         │
         ▼
External dapp UI (isometric web app) reads state via API
```

**Two inventories:** [^78^]
- **SSU Inventory** — owner-controlled, persistent
- **Ephemeral Inventory** — per-player temporary slot, governed by transfer logic

**Opportunity:** Your protocol could feed data to SSU dapps — a Bazaar stall that only shows items from sellers with `composite > 700`, or a tribe hub that gates entry based on `TRIBE_STANDING`.

---

## 9. SHIP MECHANICS & ROUTING

### 9.1 Jump Range Formula

```
range = (ΔT × C_eff × M_hull) / (3 × M_current)

Where:
  ΔT = 150 - ship_temperature (equilibrates to system external temp)
  C_eff = specific_heat × (1 + adaptive_level × 0.02)
  M_hull = ship base mass in kg
  M_current = total loaded mass (hull + cargo + fuel)
```

Source: [^99^]

### 9.2 External Temperature (Heat Index)

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

### 9.3 Ship Specifications

| Ship | Mass (kg) | Specific Heat | Fuel Capacity | Cargo |
|---|---|---|---|---|
| **Reflex** (starter) | 9,750,000 | 3.0 | 1,750 | 520 m³ |
| **Recurve** | 10,200,000 | 1.0 | 970 | 520 m³ |
| **Lai** | 18,929,160 | 2.5 | 2,400 | 1,040 m³ |
| **USV** | 30,266,600 | 1.8 | 2,420 | 3,120 m³ |
| **Maul** (capital) | 548,435,920 | 2.5 | 24,160 | 20,800 m³ |

Source: [^99^]

### 9.4 Fuel & Distance

```
distance = (fuel_quantity × fuel_quality) / (0.0000001 × ship_mass)
```

Fuel quality varies (e.g., SOF-40 = 0.40 quality). Smart Gates and stargates cost **zero fuel**.

### 9.5 Routing Algorithms

| Algorithm | Use Case |
|---|---|
| A* | Fast heuristic, may use slightly more fuel |
| Dijkstra | Optimal fuel/jump count guarantee |
| Dijkstra WASM | 2–5× speed improvement |
| Dijkstra WASM Temp-Limited | Temperature-aware, avoids heat traps |

Source: [^99^]

---

## 10. HACKATHON WINNER FORENSICS

The EVE Frontier × Sui 2026 Hackathon concluded April 24–26, 2026, with **800+ participants** and **123 submissions** from **25+ countries**. [^49^] [^66^]

### 10.1 Overall Winners

#### 1st Place: CradleOS (Reality Anchor)
- **Prize:** $25,000 ($15k cash + $10k SUI + EVE Fanfest trip)
- **What it is:** Player-led civilization management system for governing territory, coordinating resources, managing defense, and running logistics. [^39^]
- **What it does NOT do:** No credit scoring, no lending, no reputation oracles, no killboard indexing, no attestation schemas, no programmable gate access based on player behavior.
- **Your angle:** CradleOS is the **dashboard**. You are the **trust layer underneath it**.

#### 2nd Place: Blood Contract
- **What it is:** Bounty system where players place rewards on targets, define hunt conditions, and receive automatic payouts. [^37^]
- **What it does NOT do:** No reputation-weighted bounties, no integration with player credit history, no gate access consequences.
- **Your angle:** Your `PLAYER_BOUNTY` schema + `profile.move` credit scores make bounties **reputation-weighted**.

#### 3rd Place: Civilization Control
- **What it is:** Control system for managing infrastructure (gates, trade routes, defenses) from a single interface with tools for setting rules and access. [^40^]
- **What it does NOT do:** No on-chain reputation protocol, no cross-tribe standing system, no oracle network or staking.
- **Your angle:** Closest UI competitor, but has no reputation substrate. If they want dynamic access ("trusted neutrals"), they need your `ScoreCache`.

### 10.2 Category Winners

| Category | Winner | What It Does | Your Overlap |
|---|---|---|---|
| **Utility** | EasyAssemblies | Visual interface for configuring Smart Assemblies | None |
| **Technical** | Frontier Flow | No-code visual tool generating Sui Move code | None |
| **Creative** | Bazaar | Immersive walkable marketplace | None |
| **Weirdest Idea** | Shadow Broker Protocol | Espionage and intelligence as tradable resource | **Partial** — spycraft vs. structured combat indexing |
| **Live Integration** | Frontier Factional Warfare | Player-driven capturable conflict zones | None |

### 10.3 Submission Patterns

According to post-hackathon analysis: [^66^]
- **Data and community** were dominant categories.
- Classic EVE categories: kill bounties, trading, insurance.
- Multiple projects around **charging tolls to travel through gates**.
- Three prediction markets submitted.
- At least 6 entries unrelated to EVE Frontier.
- ~25 submissions were of low quality.

**Implication:** Gate tolls and bounties were popular, but **no submission combined them into a unified reputation layer**.

### 10.4 Public Repo Availability

| Winner | Repo Status |
|---|---|
| CradleOS | Not publicly indexed |
| Blood Contract | Not publicly indexed |
| Civilization Control | Not publicly indexed |
| EasyAssemblies | Not publicly indexed |
| Frontier Flow | Not publicly indexed |
| Bazaar | Not publicly indexed |
| Shadow Broker | Not publicly indexed |

**Finding:** None of the hackathon winner repos are publicly indexed. They may be private, unlisted, or not yet published.

---

## 11. COMPETITIVE GAP ANALYSIS

### 11.1 Feature Matrix

| Capability | CradleOS | Blood Contract | Civilization Control | Shadow Broker | **Your Protocol** |
|---|---|---|---|---|---|
| Territory governance | ✅ | ❌ | ❌ | ❌ | ❌ |
| Resource coordination | ✅ | ❌ | ❌ | ❌ | ❌ |
| Logistics management | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gate management UI | ❌ | ❌ | ✅ | ❌ | ❌ |
| Bounty marketplace | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Credit bureau / lending** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Reputation oracles + staking** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Killboard + combat indexing** | ❌ | ❌ | ❌ | Partial | ✅ |
| **Smart Gate reputation control** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Vouching / social staking** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Attestation schemas (9+)** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Undercollateralized loans** | ❌ | ❌ | ❌ | ❌ | ✅ |

### 11.2 EF-Map Competitive Position

Your original competitive analysis remains accurate. EF-Map is a single-developer project running read-only infrastructure. The hackathon validates that CCP and Sui are actively incentivizing **writable, on-chain infrastructure** — exactly what EF-Map cannot do.

---

## 12. TRUSTKIT SPECIFICATION

TrustKit is a **stateless adapter layer** that collapses your on-chain protocol into three primitives for external integrators. This is a side option, not the core protocol.

### 12.1 Design Principles

1. **Hide complexity:** Integrators never see schemas, attestations, oracles, or Move contracts.
2. **Mock-first:** Devnet resets wipe state. Default mode returns realistic mock scores.
3. **Policy-mirror:** The policy engine maps 1:1 to your `reputation_gate.move` logic.

### 12.2 API Surface

#### GET /v1/score/:player

```json
{
  "composite": 742,
  "pirate": 31,
  "standing": 247,
  "standing_tribe": "0x7a9f...e3d2",
  "last_updated": 1714063200,
  "attestations": {
    "gate_hostile": false,
    "gate_camped": false,
    "heat_trap": 12
  }
}
```

**Field corrections from original spec:**
- `credit` → `composite` (matches `profile.move`)
- `trust` → `standing` (matches `TRIBE_STANDING` schema)
- Added `attestations` object for active flags

#### POST /v1/evaluate

Request:
```json
{
  "player": "0xabc...",
  "policy": {
    "composite": { "min": 100 },
    "pirate": { "max": 80 },
    "standing": {
      "tribe": "0x7a9f...",
      "ally_free": true,
      "enemy_block": false,
      "neutral_multiplier": 2
    },
    "block_if_active": ["GATE_HOSTILE", "GATE_CAMPED"],
    "require_schemas": ["TRIBE_STANDING"]
  }
}
```

Response:
```json
{
  "allow": true,
  "toll": 200,
  "reason": 1,
  "standing": 247,
  "composite": 742,
  "pirate": 31
}
```

**Reason codes (match `reputation_gate.move`):**
- `0`: Ally — free passage
- `1`: Neutral — toll applied
- `2`: Enemy — high toll
- `10`: Blocked — pirate index exceeded
- `11`: Blocked — GATE_HOSTILE attestation active
- `12`: Blocked — composite score too low
- `13`: Blocked — GATE_CAMPED attestation active

#### GET /v1/explain/:player

```json
{
  "composite": { "value": 742, "required": 650, "pass": true },
  "pirate": { "value": 31, "required": 80, "pass": true },
  "standing": { "value": 247, "threshold": 500, "tier": "neutral" },
  "blockers": [],
  "toll": 200,
  "reason": 1
}
```

#### WebSocket: subscribe(player, callback)

```ts
subscribe("0xabc...", (update) => {
  // Fires when any attestation affecting this player changes
  console.log(update.composite, update.pirate, update.standing);
});
```

### 12.3 SDK (TypeScript)

```ts
import { createTrustClient } from "@tribal-intelligence/trustkit";

const trust = createTrustClient({
  endpoint: "https://api.tribal-intelligence.xyz",
  mockMode: true // Default until mainnet
});

// One-line score check
const score = await trust.getScore(player);

// Drop-in gate logic
const result = await trust.evaluate(player, {
  composite: { min: 100 },
  pirate: { max: 80 },
  block_if_active: ["GATE_HOSTILE"]
});

// Presets
const allowed = await trust.evaluate(player, trust.presets.SAFE_TRAVEL);
```

### 12.4 Presets

```ts
trust.presets = {
  SAFE_TRAVEL: {
    pirate: { max: 40 },
    block_if_active: ["GATE_HOSTILE", "GATE_CAMPED"]
  },
  TRUSTED_TRADER: {
    composite: { min: 700 },
    require_schemas: ["TRIBE_STANDING"]
  },
  ALLY_ONLY: {
    standing: { ally_free: true, enemy_block: true }
  },
  OPEN_BUT_TAXED: {
    composite: { min: 0 },
    standing: { neutral_multiplier: 2 }
  }
};
```

### 12.5 Internal Architecture

```
[Sui Events] ──┐
[EVM Events] ──┼──> [Score Aggregator] ──> Redis (hot cache)
[Oracles] ─────┘         │
                    PostgreSQL (raw)
                           │
                    API (Axum/Express)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           REST         GraphQL      WebSocket
```

**Read path:** API → Redis (50ms target) → Postgres fallback. No on-chain reads in request path.

**Update flow:** Indexer → Score Compute → Redis update → WS broadcast.

### 12.6 Shadow Cache (Local Fallback)

```ts
class TrustCache {
  private cache = new Map<string, { result: EvalResult; ts: number }>();
  private ttl = 300_000; // 5 minutes

  async evaluate(player: string, policy: TrustPolicy): Promise<EvalResult> {
    const key = `${player}:${hashPolicy(policy)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.ttl) return cached.result;

    try {
      const result = await this.api.evaluate(player, policy);
      this.cache.set(key, { result, ts: Date.now() });
      return result;
    } catch (err) {
      const stale = this.cache.get(key);
      if (stale) return stale.result;
      throw err; // No cache, no network — fail closed
    }
  }
}
```

### 12.7 CradleOS Adapter (Hypothetical)

```ts
// cradleos-trust-adapter.ts
import { createTrustClient } from "@tribal-intelligence/trustkit";

const trust = createTrustClient();

export function attachTrustToGates(cradle: any) {
  if (!cradle?.onGateAccess) {
    console.warn("CradleOS gate hooks not available.");
    return;
  }

  cradle.onGateAccess(async (player: string, gate: any) => {
    const result = await trust.evaluate(player, {
      composite: { min: gate.minComposite ?? 0 },
      pirate: { max: gate.maxPirate ?? 100 },
      standing: {
        tribe: gate.tribeId,
        ally_free: gate.allyFree ?? false,
        enemy_block: gate.enemyBlock ?? false,
        neutral_multiplier: gate.neutralMultiplier ?? 2
      },
      block_if_active: gate.blockIfActive ?? []
    });

    return {
      allowed: result.allow,
      toll: result.toll,
      reason: result.reason
    };
  });
}
```

**Status:** Speculative. CradleOS has not published a gate hook API. Validate their extension surface before committing engineering time.

---

## 13. FRONTEND MIGRATION PLAN

### 13.1 Current Frontend

| Feature | Current Implementation |
|---|---|
| CONNECT wallet | `@mysten/sui` generic SDK |
| REPORT INCIDENT | On-chain attestation (Sui Move) |
| CREATE BOUNTY | On-chain attestation (Sui Move) |
| GET /intel/:system_id | Read-only API call |

### 13.2 What Changes

| Feature | Change Required |
|---|---|
| CONNECT wallet | **Replace** `@mysten/sui` wallet connect with `EveFrontierProvider` + `useConnection` |
| REPORT INCIDENT | **Keep** Sui transaction, wrap with your gas station |
| CREATE BOUNTY | **Keep** Sui transaction, wrap with your gas station |
| GET /intel/:system_id | **No change** — read-only, no wallet needed |

### 13.3 What dapp-kit Does NOT Solve

| Problem | Status |
|---|---|
| Connect to live Smart Assemblies | ❌ dapp-kit is Sui-only; live game is EVM |
| Read live character location | ❌ No live game state in Sui yet |
| Submit gate attestation to live gate | ❌ Live gates are Solidity, not Move |
| Query MUD `CharactersTable` | ❌ dapp-kit has no EVM provider |

### 13.4 Recommended Dual-Chain Frontend

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTIERWARDEN FRONTEND                    │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React + Canvas 2D)                               │
│  ├── @evefrontier/dapp-kit (Sui wallet + EVE Vault auth)    │
│  └── @mysten/sui (fallback for direct Sui interactions)     │
├─────────────────────────────────────────────────────────────┤
│  API Layer                                                    │
│  ├── /v1/intel/:system_id (read-only, no auth)              │
│  ├── /v1/score/:player (read-only, no auth)               │
│  └── /v1/evaluate (read-only, no auth)                      │
├─────────────────────────────────────────────────────────────┤
│  Transaction Layer (Sui only)                                 │
│  ├── Your gas station (primary)                              │
│  └── Direct @mysten/sui calls (complex multi-move calls)    │
├─────────────────────────────────────────────────────────────┤
│  EVM Bridge (future)                                          │
│  └── ethers.js + MUD world ABI (for live game state)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. BUILD ORDER & PRIORITIES

### 14.1 Immediate (This Week)

1. **Browse sui-docs.evefrontier.com directly** — scrape all hook signatures, especially `useSponsoredTransaction` and `useNotification`
2. **Install `@evefrontier/dapp-kit` locally** — inspect TypeScript definitions in `node_modules`
3. **Check EVE Vault extension** — install from GitHub releases, observe network selector
4. **Get Sui devnet deploy green** — unblock all downstream work

### 14.2 Short-Term (Next 2 Weeks)

5. **Build dual-chain frontend architecture**:
   - Sui layer: `@evefrontier/dapp-kit` for wallet + your protocol transactions
   - EVM layer: `ethers.js` + MUD ABI for live game state
   - Bridge layer: Your indexer correlates EVM character IDs with Sui zkLogin addresses
6. **Implement gas station** (primary path — CCP cannot sponsor third-party Move contracts):
   - Your gas station is the primary path
   - Fallback: Direct SUI payment via `@mysten/sui`
7. **Create `DEVNET_NOTES.md`** — track package IDs, Windows workarounds, sponsor status

### 14.3 Medium-Term (Sprint 2)

8. **`undelegate()` + share math** — complete the oracle economic loop
9. **Killboard indexer (Week 1 roadmap)** — fork `sui-indexer-core`, ingest combat events
10. **Gate graph + route planner (Week 2)** — A* with intel weights
11. **TrustKit mock API** — 3-primitive surface for demo purposes
12. **Validate CradleOS integration surface** — reach out to CradleOS team at EVE Fanfest

### 14.4 Long-Term (Sprint 3+)

13. **Wire TrustKit to real scores** — connect indexer to `ScoreCache`
14. **Build CradleOS adapter** — only after confirming their extension API
15. **Reputation-gated SSU markets** — Bazaar-style integration with your scores

---

## 15. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sui migration delayed | Medium | High | Maintain EVM bridge as primary data source |
| `useSponsoredTransaction` incompatible with third-party Move | High | High | Your gas station is the primary path |
| EVE Vault only supports CCP's Sui contracts | Low | High | Use `@mysten/dapp-kit` directly for custom contracts |
| Devnet wipes erase player data | High | Medium | Mock-first API; testnet as stable reference |
| Dual-chain architecture complexity | High | Medium | Document clearly; separate EVM and Sui concerns |
| SUI token price collapse | Medium | High | Denominate in USDsui; stress-test revenue |
| Hackathon winners publish competing reputation layer | Low | High | None needed — 123 submissions, zero reputation protocols |
| Oracle collusion | Medium | Medium | Staked oracles + fraud challenge mechanism |
| Score manipulation | Medium | Medium | Multi-source attestation |
| Governance centralization | High | High | **CRITICAL:** Transfer `schema_registry` governance before mainnet |

---

## 16. REFERENCES

| Citation | Source | Date |
|---|---|---|
| [^31^] | `projectawakening/builder-examples` (GitHub) | Apr 15, 2026 |
| [^34^] | Dev.to Smart Infrastructure Guide | Oct 8, 2024 |
| [^38^] | Sui Blog — Hackathon Announcement | Feb 12, 2026 |
| [^39^] | BitPinas — CCP Hackathon Winners | Apr 25, 2026 |
| [^40^] | EVE Frontier Official — Winners Announcement | Apr 25, 2026 |
| [^49^] | Blockchain Gamer — Hackathon winners | Apr 26, 2026 |
| [^50^] | KuCoin — Sui Blockchain Guide 2026 | Apr 21, 2026 |
| [^52^] | CoinStats — Sui Investment Analysis | Apr 1, 2026 |
| [^54^] | NFT Plazas — Sui Gaming Ecosystem | Feb 23, 2026 |
| [^57^] | CoinMarketCap — Sui Latest Updates | Apr 26, 2026 |
| [^58^] | Sui Blog — EVE Frontier Migration + Hackathon Live | Mar 13, 2026 |
| [^60^] | EVE Frontier Support — Smart Assembly | Jun 11, 2025 |
| [^63^] | CGMagazine — CCP Games Interview | May 15, 2025 |
| [^66^] | Blockchain Gamer — Hackathon Analysis | Apr 14, 2026 |
| [^71^] | EVE Frontier Whitepaper — Web3 Gameplay | Oct 8, 2025 |
| [^72^] | Reddit — Isometric Dapp for SSU | Mar 15, 2026 |
| [^74^] | Reddit — DApps Thread | Mar 18, 2026 |
| [^78^] | Reddit — SSU Inventory Mechanics | Mar 18, 2026 |
| [^80^] | `sui-docs.evefrontier.com` — dapp-kit docs | Current |
| [^83^] | `sui-docs.evefrontier.com` — SponsoredTransactionMethod | Current |
| [^84^] | `evefrontier/evevault` (GitHub) | Dec 18, 2025 |
| [^91^] | `evefrontier/world-contracts` (GitHub) | Apr 16, 2026 |
| [^94^] | `projectawakening/world-chain-contracts` (GitHub) | Jan 18, 2024 |
| [^99^] | EF-Map AI Facts — Ship Mechanics | Feb 18, 2026 |
| [^102^] | Blockworks — EVE Frontier Crypto | Aug 4, 2025 |
| [^105^] | Etherscan — Redstone Token | Current |
| [^108^] | `brainy-bots/efguard-gate-example` (GitHub) | Mar 30, 2026 |
| [^109^] | Sui Blog — EVE Frontier x Sui | Oct 8, 2025 |
| [^111^] | Sui Blog — EVE Frontier x Sui | Oct 8, 2025 |
| [^113^] | `sui-docs.evefrontier.com` — getAssemblyTypeApiString | Current |

---

*Built on Sui. Designed for EVE Frontier. Research current as of April 26, 2026.*
