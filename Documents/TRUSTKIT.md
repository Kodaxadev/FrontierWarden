# TRUSTKIT — Strategic Research & Specification
## EVE Frontier Tribal Intelligence Protocol
### Last Updated: April 26, 2026

---

## EXECUTIVE SUMMARY

This document consolidates all current research as of April 26, 2026, for the EVE Frontier Tribal Intelligence Protocol. It covers the live state of EVE Frontier, the Sui ecosystem context, a forensic breakdown of every hackathon winner, the actual Smart Assembly architecture, and an updated TrustKit adapter specification grounded in real competitive gaps.

**Key finding:** No hackathon winner — including CradleOS, Civilization Control, or Blood Contract — implements an on-chain reputation layer with lending, vouching, and programmable gate access. The gap is real and unclaimed.

---

## 1. EVE FRONTIER STATE (APRIL 2026)

### 1.1 Live Game Status

| Milestone | Date | Status |
|---|---|---|
| Migration to Sui testnet | March 2026 | ✅ Complete |
| Hackathon ("Toolkit for Civilization") | March 11–31, 2026 | ✅ Complete |
| Winners announced | April 24–26, 2026 | ✅ Complete |
| Free trial launch (Cycle 5: Shroud of Fear) | April 1, 2026 | ✅ Live |
| EVE Fanfest 2026 | Upcoming | CradleOS winner attending |

EVE Frontier is currently in **Cycle 5: Shroud of Fear**, a testing phase that includes new ship models, updated combat systems, a redesigned HUD, and expanded base building. The game migrated from Ethereum to Sui testnet in March 2026, opening Smart Assemblies to third-party developers for the first time. [^58^]

### 1.2 Smart Assembly Architecture (Critical Nuance)

Smart Assemblies are the programmable in-game structures: **Smart Storage Units**, **Smart Turrets**, and **Smart Gates**. [^60^] However, there is a **dual-chain reality** that your architecture already correctly accounts for:

- **Historical (pre-March 2026):** Smart Assemblies ran on an Ethereum blockchain using Solidity and the MUD Framework. [^60^]
- **Current (post-March 2026):** EVE Frontier migrated to Sui testnet. Smart Assemblies are now accessible to third-party developers on Sui, but the underlying data layer spans both chains during transition. [^58^]
- **External tools** connect via a publicly readable API to the live universe data. [^58^]

**Implication for your protocol:** Your dual-chain indexer (EVM MUD + Sui Move) is not over-engineering — it is a necessity. The game state is in transition, and tribes will operate infrastructure across both chains until full Sui migration is complete.

### 1.3 CCP's Vision for Programmable Gates

Hilmar Veigar Pétursson (CEO, CCP Games) explicitly described the gate access control model in a May 2025 interview: [^63^]

> "We put the rules of how the gate operates on the chain... you can write what you want. You could say that only people who follow me on Twitter are allowed to use my gate, and this will work."

This validates your `reputation_gate.move` concept entirely. CCP wants gate logic to be **permissionlessly programmable** by players. The missing piece — which no hackathon team built — is a **shared reputation substrate** that multiple gates can query instead of each tribe rolling their own access logic.

---

## 2. SUI ECOSYSTEM CONTEXT (APRIL 2026)

### 2.1 Network Metrics

| Metric | Value | Date |
|---|---|---|
| TVL (peak) | $2.6 billion | October 2025 |
| TVL (current range) | $1.2–2.6 billion | April 2026 |
| Daily transactions | 164 million | March 2026 |
| Active users | 222 million | December 2025 |
| SUI price | $0.88 | April 2026 |
| Market cap | $3.43 billion | April 2026 |
| Circulating supply | 3.90 billion SUI (39%) | April 2026 |
| Total supply | 10 billion SUI (fixed) | April 2026 |

Sources: [^50^] [^52^]

### 2.2 Relevant 2026 Milestones

| Event | Date | Relevance to Protocol |
|---|---|---|
| CME Group SUI Futures Launch | May 4, 2026 | Institutional validation; SUI becomes a macro-hedgeable asset |
| Sui Live Miami | May 7, 2026 | Ecosystem showcase; potential partnership visibility |
| USDsui Native Stablecoin | Launched March 2026 | Fee-redistributing stablecoin; could denominate tolls/loans |
| Sui Stack (S2) Platform | 2026 (transitioning) | Full-stack developer platform; may simplify indexer deployment |
| Protocol-Level Private Transactions | 2026 roadmap | Confidential transactions for institutional gate tolls |

Source: [^57^]

### 2.3 Gaming & NFT Infrastructure

Sui's object-centric architecture is explicitly designed for gaming: [^54^]
- **Dynamic NFTs:** Assets that evolve based on gameplay (kill history, reputation, ship upgrades).
- **Composability:** NFTs can hold other NFTs (e.g., a ship NFT containing module NFTs).
- **Parallel execution:** High-frequency game transactions without congestion.
- **zkLogin:** Seedless wallet creation — critical for onboarding EVE players who don't know Sui.

**Implication:** Your `profile.move` scores and `attestation.move` credentials are natively compatible with Sui's object model. A player's reputation can be a dynamic NFT that gates, lenders, and bounty boards all read from.

### 2.4 Tokenomics Warning

SUI has significant supply overhang: [^52^]
- **Monthly unlocks:** Averaged 64 million SUI in early 2025; 44 million SUI unlock in October 2025 preceded a flash crash from $3.80 to $0.50.
- **Annual inflation:** Reached 55% in 2025.
- **FDV vs market cap:** $8.81 billion FDV vs $3.43 billion market cap — a 2.57x gap indicating dilution risk.

**Implication for revenue model:** Your ~7,000 SUI/month revenue estimate should be stress-tested at lower SUI prices. Consider denominating high-value services (bounties, loans) in USDsui or a stable unit.

---

## 3. HACKATHON WINNER FORENSIC BREAKDOWN

The EVE Frontier × Sui 2026 Hackathon concluded April 24–26, 2026, with **800+ participants** and **123 submissions** from **25+ countries**. [^49^] [^66^]

### 3.1 Overall Winners

#### 1st Place: CradleOS (Reality Anchor)
- **Prize:** $25,000 ($15k cash + $10k SUI + EVE Fanfest trip)
- **What it is:** A player-led civilization management system for governing territory, coordinating resources, managing defense, and running logistics through shared on-chain infrastructure. [^39^]
- **What it does NOT do:**
  - No credit scoring or lending
  - no reputation oracles
  - no killboard indexing
  - no attestation schemas
  - no programmable gate access based on player behavior
- **Your angle:** CradleOS is the **dashboard**. You are the **trust layer underneath it**.

#### 2nd Place: Blood Contract
- **What it is:** A bounty system where players place rewards on targets, define hunt conditions, and receive automatic payouts. [^37^]
- **What it does NOT do:**
  - No reputation-weighted bounties (anyone can place/claim)
  - no integration with player credit history
  - no gate access consequences for targets or hunters
- **Your angle:** Your `PLAYER_BOUNTY` schema + `profile.move` credit scores make bounties **reputation-weighted**. A high-pirate-index player costs more to bounty-hunt because they're dangerous; a low-credit player can't post large bounties without voucher backing.

#### 3rd Place: Civilization Control
- **What it is:** A control system for managing infrastructure (gates, trade routes, defenses) from a single interface with tools for setting rules and access. [^40^]
- **What it does NOT do:**
  - No on-chain reputation protocol
  - no cross-tribe standing system
  - no oracle network or staking
  - access rules are likely static or tribe-membership-based
- **Your angle:** This is your **closest UI competitor**, but it has no reputation substrate. If they want dynamic access ("let trusted neutrals through"), they need your `ScoreCache`.

### 3.2 Category Winners

| Category | Winner | What It Does | Your Overlap |
|---|---|---|---|
| **Utility** | EasyAssemblies | Visual interface for configuring Smart Assemblies (gates, storage, defenses) | None — you don't build config UIs |
| **Technical** | Frontier Flow | No-code visual tool that generates Sui Move code for Smart Assembly automation | None — you write the actual protocol, not no-code generators |
| **Creative** | Bazaar | Immersive walkable marketplace; social trading space | None — you don't build marketplaces |
| **Weirdest Idea** | Shadow Broker Protocol | Espionage and intelligence as a tradeable, weaponized resource | **Partial overlap** with your killboard, but Shadow Broker is about **spycraft tradecraft** (buying/selling secrets), not structured combat indexing + credit scoring |
| **Live Integration** | Frontier Factional Warfare | Player-driven capturable conflict zones enforced by in-world structures | None — you don't build territory warfare mechanics |

### 3.3 Submission Patterns

According to post-hackathon analysis: [^66^]
- **Data and community** were the dominant project categories.
- Classic EVE categories: kill bounties, trading, insurance.
- Multiple projects around **charging tolls to travel through gates**.
- Three prediction markets were submitted.
- At least 6 entries were unrelated to EVE Frontier (general Sui projects).
- ~25 submissions were of low quality.

**Implication:** Gate tolls and bounties were popular hackathon themes, but **no submission combined them into a unified reputation layer**. Blood Contract does bounties. Civilization Control does gates. You do both + lending + vouching + oracles.

---

## 4. COMPETITIVE GAP ANALYSIS

### 4.1 Feature Matrix (Your Protocol vs. Hackathon Winners)

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

### 4.2 EF-Map Competitive Position (Updated)

Your original competitive analysis remains accurate. EF-Map is a single-developer project running read-only infrastructure. The hackathon validates that CCP and Sui are actively incentivizing **writable, on-chain infrastructure** — exactly what EF-Map cannot do.

---

## 5. SMART ASSEMBLY & GATE ARCHITECTURE

### 5.1 The Dual-Chain Reality

Your indexer architecture is correct. The current state is:

```
EVE FRONTIER UNIVERSE
├── EVM Layer (MUD Framework / Solidity)
│   ├── Smart Gate adjacency data
│   ├── Kill mails (combat events)
│   └── Character / inventory state
│
└── Sui Layer (Move)
    ├── Your reputation protocol
    ├── Attestations
    ├── ScoreCache
    └── Lending / vouching
```

External tools read from **both** layers via the public API. [^58^] Your `sui-indexer-core` fork ingests Sui events; your EVM listener (ethers-rs) ingests MUD table events.

### 5.2 Gate Access Control Flow

CCP's design intent is that gate operators write custom access logic. [^63^] Your protocol inserts a **reputation oracle** into that flow:

```
Player approaches Smart Gate
         │
         ▼
Gate Contract (EVM/Solidity or Sui/Move)
         │
         ├──> Static allowlist? (Basic)
         │
         └──> Query ScoreCache (Your Protocol)
                  │
                  ├──> Composite Score >= threshold?
                  ├──> Pirate Index <= threshold?
                  ├──> Active GATE_HOSTILE attestation?
                  ├──> Tribe Standing (ally/neutral/enemy)?
                  └──> Return: ALLOW + toll_amount
```

This is the **"visa card"** system Hilmar described — but instead of each tribe issuing their own visa, your protocol is the **shared visa bureau**.

---

## 6. TRUSTKIT SPECIFICATION (UPDATED)

TrustKit is a **stateless adapter layer** that collapses your on-chain protocol into three primitives for external integrators. This is a side option, not the core protocol.

### 6.1 Design Principles

1. **Hide complexity:** Integrators never see schemas, attestations, oracles, or Move contracts.
2. **Mock-first:** Devnet resets wipe state. The default mode returns realistic mock scores.
3. **Policy-mirror:** The policy engine maps 1:1 to your `reputation_gate.move` logic.

### 6.2 API Surface

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
- `credit` → `composite` (matches `profile.move` field name)
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

#### WebSocket: subscribe(player, callback)

```ts
subscribe("0xabc...", (update) => {
  // Fires when any attestation affecting this player changes
  console.log(update.composite, update.pirate, update.standing);
});
```

### 6.3 SDK (TypeScript)

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

### 6.4 Presets

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

### 6.5 Internal Architecture

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

### 6.6 CradleOS Adapter (Hypothetical)

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

**Status:** This adapter is speculative. CradleOS has not published a gate hook API. Validate their extension surface before committing engineering time.

---

### 6.7 Gas Station

```ts
POST /sponsor
  Accepts: { tx_bytes: string, sender: string }
  Returns: { sponsored_tx_bytes: string }
  Auth: rate-limit by sender address
  Keypair: SPONSOR_KEYPAIR env var, never in git
  Cost: ~0.001 SUI per attestation, ~30 SUI/month at 1k/day
  Primary: this endpoint ( CCP's useSponsoredTransaction incompatible with third-party Move contracts )
```

**Sui sponsored transactions are standard.** Any Sui address can be a gas sponsor. The gas station is a simple service that signs transactions with a funded keypair.

**Implementation sketch (Axum/Rust):**

```rust
use sui_sdk::crypto::SuiKeyPair;
use sui_sdk::types::crypto::Signature;

async fn sponsor_handler(
    State(state): State<AppState>,
    Json(req): Json<SponsorRequest>,
) -> Result<Json<SponsorResponse>, AppError> {
    // Rate limit by sender
    state.rate_limiter.check(&req.sender).await?;

    // Deserialize transaction
    let tx_data = bcs::from_bytes(&req.tx_bytes)?;

    // Sign as gas sponsor
    let signature = state.keypair.sign(&tx_data);

    // Return sponsored transaction bytes
    Ok(Json(SponsorResponse {
        sponsored_tx_bytes: bcs::to_bytes(&(tx_data, signature))?,
    }))
}
```

**Environment:**
```bash
SPONSOR_KEYPAIR="<ed25519-private-key>"  # Never commit to git
SPONSOR_RATE_LIMIT=100  # requests per hour per sender
SPONSOR_MIN_BALANCE=1000  # SUI — alert if below
```

**Cost model:**
| Metric | Value |
|---|---|
| Per attestation gas | ~0.001 SUI |
| Daily volume (1k attestations) | ~1 SUI |
| Monthly cost | ~30 SUI |
| Buffer (10x) | ~300 SUI/month |

**Confirmed finding:** `SponsoredTransactionInput` requires `assembly` (item_id) + `assemblyType`, with **no** `packageId` or `target` field. The CCP backend routes to assembly-specific endpoints (`/sponsor/gate`, `/sponsor/turret`, etc.) and cannot sponsor third-party Move contracts. Your `attestation.move` calls require this custom gas station as the primary path.

**Flow:**
1. Player submits attestation
2. Call your `/sponsor` endpoint directly
3. If gas station is down → prompt player to fund wallet with SUI
4. If player has no SUI → queue attestation for later submission

---

## 7. DEVNET & WINDOWS REALITY

### 7.1 Devnet Constraints (April 26, 2026)

- **Devnet resets wipe all deployed packages.** Package IDs in `config.ts` must be updated after every deploy. [^from project overview]
- **Testnet addresses are the stable reference** — once published to testnet, IDs persist.
- **Current status:** Package live on Sui devnet as of April 25, 2026. Indexer running, 9 schemas registered, all API endpoints operational. See `DEVNET_NOTES.md` for package ID and deployment details.

### 7.2 Windows Development Issues

Your team is developing on Windows, which creates known friction with the Sui CLI:
- Path resolution differences (`Move.toml` paths, artifact directories)
- `sui move test` vs `sui client publish` behavior gaps
- Terminal encoding issues with Move compiler output

**Recommendation:** Maintain a `DEVNET_NOTES.md` at repo root tracking:
- Current package IDs after each reset
- Exact Windows CLI workaround (WSL path, PowerShell escape, etc.)
- Last successful publish timestamp

### 7.3 Build Order Recommendation

| Priority | Task | Blocker |
|---|---|---|
| 1 | Gas station endpoint | None — unblocks testnet gate integration |
| 2 | Frontend dapp-kit migration + visual pass | Gas station (dep) |
| 3 | Cross-package consistency test | None — parallelize with 1–2 |
| 4 | `undelegate()` implementation | Green deploy |
| 5 | TrustKit API (mock mode) | None — can parallelize |
| 6 | Wire TrustKit to real scores | Indexer EVM ingestion |

---

## 8. RISK FACTORS

### 8.1 Sui Ecosystem Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Token unlock dilution (55% annual inflation) | High | Denominate loans/bounties in USDsui or stable units |
| Devnet instability | Medium | Mock-first API; testnet as stable reference |
| Validator centralization (114 nodes, 30M SUI stake req) | Low | Your protocol is application-layer; not directly affected |
| Competitive L1 pressure (Solana Firedancer, Ethereum L2) | Medium | EVE Frontier exclusivity on Sui creates lock-in |

### 8.2 EVE Frontier Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Game not yet launched (Cycle 5 testing) | High | Build for current tester base; iterate with CCP feedback |
| Smart Assembly dual-chain complexity | Medium | Your dual-chain indexer already handles this |
| CCP changes gate access API | Medium | Abstract behind TrustKit adapter; version the API |
| Player adoption of on-chain tools | Medium | Focus on tribe leaders (power users) first |

### 8.3 Protocol Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Oracle collusion | Medium | Staked oracles + fraud challenge mechanism |
| Score manipulation | Medium | Multi-source attestation (combat + trade + vouch) |
| Governance centralization | High | **CRITICAL:** Transfer `schema_registry` governance before mainnet |

---

## 9. STRATEGIC POSITIONING

### 9.1 What You Are (Updated)

You are not:
- A civilization dashboard (that's CradleOS)
- A no-code Smart Assembly builder (that's Frontier Flow)
- A walkable marketplace (that's Bazaar)
- A raw bounty board (that's Blood Contract)

You are:
> **The on-chain reputation substrate that makes every other tool more trustworthy.**

### 9.2 The TrustKit Decision

**Build it if:**
- You want CradleOS/Civilization Control to integrate without understanding Move.
- You want to become the default "visa bureau" for gate access.

**Skip it if:**
- You want to focus entirely on the core protocol and let integrators read `ScoreCache` directly.
- The 1-hour integration promise is not verifiable (CradleOS has not published hooks).

**Recommended path:** Build TrustKit as a **mock-mode API** while you finish the core protocol. It costs ~1 day and creates a demo surface for partnerships. Do not invest in the CradleOS adapter until you confirm their extension API exists.

### 9.3 Near-Term Wins

1. **Local testnet deploy** — unblock all downstream work.
2. **`undelegate()` + share math** — complete the oracle economic loop.
3. **Killboard indexer (Week 1 roadmap)** — fork `sui-indexer-core`, ingest combat events.
4. **Gate graph + route planner (Week 2)** — A* with intel weights; visual proof of concept.
5. **TrustKit mock API** — 3-primitive surface for demo purposes.

---

## 10. REFERENCES

| Citation | Source | Date |
|---|---|---|
| [^49^] | Blockchain Gamer — Hackathon winners | April 26, 2026 |
| [^39^] | BitPinas — CCP Hackathon Winners | April 25, 2026 |
| [^40^] | EVE Frontier Official — Winners Announcement | April 25, 2026 |
| [^58^] | Sui Blog — EVE Frontier Migration + Hackathon Live | March 13, 2026 |
| [^60^] | EVE Frontier Support — Smart Assembly | June 11, 2025 |
| [^63^] | CGMagazine — CCP Games Interview | May 15, 2025 |
| [^66^] | Blockchain Gamer — Hackathon Analysis | April 14, 2026 |
| [^50^] | KuCoin — Sui Blockchain Guide 2026 | April 21, 2026 |
| [^52^] | CoinStats — Sui Investment Analysis | April 1, 2026 |
| [^57^] | CoinMarketCap — Sui Latest Updates | April 26, 2026 |
| [^54^] | NFT Plazas — Sui Gaming Ecosystem | February 23, 2026 |

---

*Built on Sui. Designed for EVE Frontier. Research current as of April 26, 2026.*
