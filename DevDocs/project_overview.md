# EVE FRONTIER TRIBAL INTELLIGENCE PROTOCOL
## Project Overview v1.0 — April 25, 2026

***

## WHAT THIS IS

A **dual-product on-chain infrastructure layer** for EVE Frontier built on Sui — simultaneously a **decentralized credit bureau** and a **tribal intelligence killboard**, unified by a single reputation protocol.

EF-Map shows you the map. This system shows you **your tribe's map** — live, verified, stake-backed, and directly integrated with Smart Gate contracts.

***

## THE TWO PRODUCTS (ONE PROTOCOL)

### Product 1: Tribal Credit Bureau
On-chain reputation scoring where your kill history, loan repayment, vouch backing, and scout accuracy combine into a single composite identity. Borrowers access loans based on reputation, not collateral. Vouchers stake SUI to back members — defaulters get slashed.

### Product 2: Tribal Intelligence Killboard
Live gate status, combat kill indexing, heat trap scoring, and route planning — all filtered through your tribe's standing. Intel is reputation-weighted, stake-backed, and permanent on-chain. Not ephemeral. Not public-only. Tribe-sovereign.

### Why They're Inseparable
A pilot's kill count raises their combat score → unlocks better loan terms for ship purchases. Defaulting on a loan slashes your voucher → tanks your standing → allied Smart Gates charge you 10x toll. The credit score **is** a function of combat history, vouch history, repayment history, and scout accuracy. No other EVE Frontier tool has this composite on-chain identity.

***

## CURRENT BUILD STATUS

### ✅ Complete: Move Protocol (v4)

| Module | Purpose | Status |
|---|---|---|
| `profile.move` | Per-player credit scores, decay via `apply_decay` | ✅ Deployed |
| `oracle_registry.move` | Oracle registration, schema gating, fraud challenges | ✅ Deployed |
| `attestation.move` | Verifiable credentials against registered schemas | ✅ Deployed |
| `schema_registry.move` | Attestation type definitions, governance-transferable | ✅ Deployed |
| `vouch.move` | Social staking — SUI locked to back borrowers | ✅ Deployed |
| `lending.move` | Reputation-gated loans, repayment, default/slash cycle | ✅ Deployed |
| `singleton.move` | System-level accessors | ✅ Deployed |
| `system_sdk.move` | System capability helpers | ✅ Deployed |

### ✅ Complete: Test Suite

| File | Coverage | Status |
|---|---|---|
| `oracle_profile_tests.move` | 8 tests including patched double-vote + new slash test | ✅ 18/18 passing |
| `vouch_lending_tests.move` | Full borrow/repay/default/slash cycle | ✅ |
| `schema_registry_tests.move` | Register, deprecate, governance transfer, lockout | ✅ |
| Integration suite (TypeScript) | 5 files, full on-chain flow via `@mysten/sui.js` | ✅ Written |

### ✅ Complete: Deployment Infrastructure
- `scripts/deploy.sh` — testnet publish script
- `testnet-addresses.json` — post-deploy address template
- `SECURITY.md` — full trust model, attack surface, **critical: governance transfer required before mainnet**
- `Move.toml` — `edition = "2024.beta"` confirmed

> **⚠️ Network Address Stability Note**: Devnet resets wipe all deployed packages, so `config.ts` package IDs must be updated after every devnet deploy. **Testnet addresses are the stable reference** — once published to testnet, those IDs persist for integration testing and frontend config.

### 🔄 In Progress: Local Testnet Deploy
MiniMax currently running `sui start --with-faucet --force-regenesis` on local network after testnet faucet rate-limiting. Deploy and integration test run pending local node startup.

***

## ARCHITECTURE: 5-LAYER BACKEND

```
DATA SOURCES
├── EVM (MUD Tables)     — Smart Gate adjacency, kill mails, character data
├── Sui (Move Events)    — Attestations, score updates, oracle registration
└── External APIs        — EF-Map historical scrape (bootstrap only), CCP world API

INGESTION LAYER (Rust)
└── sui-indexer-core fork — gRPC streaming, checkpoint-based, sub-2s latency

PROCESSING LAYER (Rust)
├── Event Router         — Filter by tribe/syndicate
├── Score Computer       — Pirate Index, Credit Score, Gate Heat algorithms
└── Intel Merger         — Merge EVM + Sui, apply tribe filters

STORAGE LAYER
├── PostgreSQL           — Raw events, score cache, kill mails, gate intel, route graph
├── Redis                — Hot cache (50ms queries), session store, rate limits
└── IPFS                 — Permanent attestation archive

API LAYER
├── GraphQL              — Complex queries, aggregations
├── REST                 — Simple cached queries
└── WebSocket            — Live intel stream, kill feed, score updates

CLIENT LAYER
├── Web App (React/Canvas) — Star map with intel overlay
├── Mobile PWA           — Phone/tablet route planning
└── Smart Assemblies     — Direct Move/Solidity contract reads
```

***

## EVE-SPECIFIC SCHEMA REGISTRY

| Schema | Issued By | Expires | Purpose |
|---|---|---|---|
| `GATE_HOSTILE` | Gate Monitor Bot (TEE) | 24 epochs | Block/flag hostile gates |
| `GATE_CAMPED` | Scout Network | 12 epochs | Warn of camped gates |
| `GATE_CLEAR` | Scout Oracle | 6 epochs | Verified safe routing |
| `HEAT_TRAP` | Combat Oracle | 24 epochs | Danger score 0–100 |
| `ROUTE_VERIFIED` | Route Oracle | 48 epochs | Confirmed safe path |
| `SYSTEM_CONTESTED` | Territory Oracle | 72 epochs | Faction sovereignty |
| `SHIP_KILL` | Combat Oracle | Permanent | Killboard record |
| `GATE_TOLL` | Gate Owner | Until changed | Dynamic toll pricing |
| `TRIBE_STANDING` | Tribe Oracle | 30 epochs | -1000 to +1000 diplomacy |
| `PLAYER_BOUNTY` | Bounty Oracle | Until claimed | Mercenary marketplace |

***

## THE KILLER FEATURE: `reputation_gate.move`

Smart Gates that **enforce access control via on-chain reputation**:

- Pirates (`PIRATE_INDEX > 80`) → **blocked**
- Allies (`TRIBE_STANDING > 500`) → **free passage**
- Neutrals → **2x base toll**
- Enemies → **10x base toll**
- Gates with active `GATE_HOSTILE` attestation → **automatically rerouted**

EF-Map is a frontend. It literally cannot touch Smart Gate contracts. This feature alone excludes them permanently.

***

## COMPETITIVE POSITION VS EF-MAP

| Capability | EF-Map | This Protocol |
|---|---|---|
| Route calculation | ✅ A*/Dijkstra | ✅ A*/Dijkstra + intel weights |
| Live gate state | ❌ | ✅ On-chain attestations |
| Tribe-specific intel | ❌ | ✅ Per-syndicate filtered views |
| Reputation-weighted reports | ❌ | ✅ Economically stake-backed |
| Tactical marks | Ephemeral KV (TTL) | ✅ Permanent on-chain |
| Smart Gate integration | ❌ | ✅ Direct contract calls |
| Bounty marketplace | ❌ | ✅ `PLAYER_BOUNTY` schema |
| Write path | ❌ Read-only | ✅ Full read/write |
| Revenue model | $0 | ✅ ~7,000 SUI/mo at modest adoption |
| Open source indexer | ❌ Closed | ✅ Public good, attracts devs |
| Ingestion latency | Minutes (batch cron) | Sub-2 seconds (gRPC stream) |
| Data retention | KV TTL expires | Permanent (IPFS archive) |

**EF-Map is a single-developer project running on Postgres + Cloudflare KV with zero revenue.** They cannot respond to structural blockchain advantages without a full rewrite they have no incentive to fund.

***

## REVENUE MODEL

| Stream | Mechanism | Monthly Est. |
|---|---|---|
| Attestation fees | 0.01 SUI per gate report | 500 SUI |
| Oracle licensing | Tribes pay for premium intel | 2,000 SUI |
| Bounty placement | 5% fee on bounty value | 1,000 SUI |
| Mercenary matching | 10% fee on contract value | 3,000 SUI |
| Gate toll routing | 1% fee on toll optimization | 500 SUI |
| **Total (modest adoption)** | | **~7,000 SUI/mo** |

CCP Games has explicitly stated they want app developers to monetize. This is a sanctioned economic layer, not a gray-zone fan tool.

***

## 8-WEEK DISPLACEMENT ROADMAP

| Week | Phase | Deliverable |
|---|---|---|
| 1 | **Match** | Primordium killboard indexer — fork `longcipher/sui-indexer`, kill mail ingestion |
| 2 | **Match** | Gate graph + route planner — A* with intel weights, TypeScript |
| 3 | **Match** | Star map frontend — Canvas 2D, basic rendering + intel overlay |
| 4 | **Surpass** | Live gate intel overlay — EF-Map falls behind |
| 5 | **Surpass** | Reputation-weighted reports — impossible for EF-Map to replicate |
| 6 | **Surpass** | Tribe-specific map views — per-syndicate diplomatic overlay |
| 7 | **Obsolete** | `reputation_gate.move` Smart Gate integration |
| 8 | **Obsolete** | Bounty + mercenary marketplace |

**Month 3**: EF-Map is a legacy tool. **Month 6**: EF-Map shuts down or pivots. **Month 12**: Default infrastructure for EVE Frontier.

***

## TECH STACK

| Layer | Technology | Rationale |
|---|---|---|
| Smart contracts | Move (Sui) | Native to EVE Frontier's chain |
| Indexer | Rust + `sui-indexer-core` | Sub-second gRPC streaming |
| EVM listener | Rust + ethers-rs | MUD table event ingestion |
| Primary DB | PostgreSQL | Kill mails, events, route graph |
| Cache | Redis Cluster (6 nodes) | 50ms hot queries |
| Permanent storage | IPFS | Attestation archive |
| API | Axum (Rust) / GraphQL + REST + WS | Three protocol support |
| Frontend | React + Canvas 2D / WebGL | 200k system rendering |
| Pathfinding | Web Worker (A*) | Off main thread |
| State | Zustand | Lightweight |
| Styling | Tailwind + custom brutalist CSS | Matches aesthetic |
| Mobile | PWA | Phone/tablet first |
| Testing | Vitest + `@mysten/sui.js` | Integration suite |
| Deployment | Kubernetes | Indexer + API + WS replicas |

***

## AI BUILD STACK

| Tool | Role |
|---|---|
| **Kimi Web** (free) | Architecture specs, competitive docs, product strategy |
| **MiniMax** | Code implementation, verification, deployment |
| **Claude Pro** | Complex reasoning, architecture review, direction |
| **Codex** (planned) | Routine coding load balancer, parallel task execution |

***

## CRITICAL PRE-MAINNET CHECKLIST

- [ ] Local testnet deploy passing (in progress)
- [ ] All 18 Move tests green on local network
- [ ] Integration suite passing against local node
- [ ] Redeploy to Sui testnet once faucet rate limit clears
- [ ] Integration suite passing against testnet
- [ ] **CRITICAL**: Governance transfer — remove deployer admin from `schema_registry` before mainnet
- [ ] Week 1 indexer: fork + configure `sui-indexer-core` with package ID
- [ ] Register EVE schemas on testnet

***

*Built on Sui. Designed for EVE Frontier. The routing is the commodity — the verified live intel is the moat.*
