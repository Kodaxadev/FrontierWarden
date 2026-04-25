
# EDGE OUT EF-MAP
## Competitive Displacement Strategy for EVE Frontier Tribal Intelligence

---

## THE DECISION

No partnership. No revenue share. No schema registry concessions.

EF-Map is a **single-developer project** with a Postgres database and a Cloudflare KV cache [^29^].
They have first-mover advantage in combat data, but they are **vulnerable** on every axis that matters:
- No write path
- No on-chain persistence
- No reputation system
- No tribe-specific features
- No Smart Assembly integration
- No economic model

You beat them by building **everything they have, plus everything they can't build**, faster.

---

## EF-MAP'S CURRENT STACK (And How to Neutralize Each Piece)

| EF-Map Asset | What It Does | Their Weakness | Your Counter |
|-------------|--------------|----------------|--------------|
| **Primordium indexer** | Indexes kill mails from CCP's chain | Single point of failure, closed source | Build your own indexer + open source it |
| **Postgres DB** | Stores 4,390+ kills | Centralized, not composable | On-chain attestations + off-chain cache |
| **Cloudflare KV** | Caches aggregated data | Ephemeral, 24hr TTL | Permanent on-chain + IPFS fallback |
| **Docker cron** | Refreshes data periodically | Batch delays, not real-time | Event-driven, sub-block latency |
| **Killboard UI** | Displays kills by tribe/system | Read-only, no action layer | Killboard + bounty placement + mercenary hiring |
| **Route planner** | Dijkstra/A* over gate graph | Static weights, no live intel | A* with dynamic intel weights |
| **Star map** | Canvas rendering of systems | Generic, no tribe overlay | Tribe-sovereign map with live marks |

---

## THE KILL SHOT: 6 FEATURES EF-MAP CAN NEVER BUILD

### 1. Live Gate State (They Read, You Write)

EF-Map reads gate adjacency from MUD tables. They **cannot** write gate status back.

**Your move**: Deploy Gate Monitor Oracles that write `GATE_HOSTILE` / `GATE_CAMPED` attestations in real-time. EF-Map users see static maps. Your users see **live tactical overlays**.

**Time to build**: 2 weeks (automated bot + TEE signing)
**EF-Map response time**: 6+ months (would require full protocol redesign)

### 2. Reputation-Weighted Reports (They Have None)

EF-Map marks are unverified — anyone can place them, no weighting.

**Your move**: Every gate report is an attestation from a staked oracle. Reports from 10,000 SUI oracles override reports from 1,000 SUI oracles. Players learn to trust your intel because it's **economically backed**.

**Time to build**: 1 week (already in v4 modules)
**EF-Map response time**: Impossible without blockchain integration

### 3. Smart Gate Integration (They Can't Touch It)

EF-Map is a frontend. It cannot interact with CCP's Smart Gate contracts.

**Your move**: `reputation_gate.move` reads your attestations and enforces access control. A gate with `GATE_HOSTILE > 0` automatically blocks pirates. This is **contract-level integration** — EF-Map literally cannot do this.

**Time to build**: 2 weeks
**EF-Map response time**: Never (they don't write Move/Solidity)

### 4. Tribe Sovereignty (No Concept)

EF-Map shows public data. They have no concept of tribe-specific views.

**Your move**: Syndicate-level intel — "show me the map from Syndicate A's perspective." Enemy gates glow red. Ally gates glow green. Neutral gates are yellow. Each tribe sees a **different map**.

**Time to build**: 1 week (filter by `TRIBE_STANDING`)
**EF-Map response time**: Would require user auth + per-tribe databases

### 5. Bounty + Mercenary Marketplace (No Economic Layer)

EF-Map shows who killed whom. They can't do anything about it.

**Your move**: Click a kill on your killboard → place `PLAYER_BOUNTY` attestation → mercenaries with high combat reputation auto-notified. The killboard is now a **labor marketplace**.

**Time to build**: 2 weeks
**EF-Map response time**: Would require full economic infrastructure

### 6. Permanent Tactical Marks (They Expire)

EF-Map marks live in Cloudflare KV with TTL [^29^]. They vanish.

**Your move**: Every tactical mark is an on-chain attestation. "Hostile fleet at X,Y" persists forever, signed by the reporter's oracle key, weighted by their stake. Future players can see **historical tactical patterns**.

**Time to build**: 1 week (already in v4)
**EF-Map response time**: Would require migrating off KV to permanent storage

---

## THE COMPETITIVE TIMELINE

### Phase 1: Match (Weeks 1-3)
Build everything EF-Map has, but better.

| Week | Deliverable | EF-Map Equivalent |
|------|-------------|-------------------|
| 1 | Primordium indexer + killboard | Their core product |
| 2 | Gate graph + route planner | Their route feature |
| 3 | Star map frontend | Their UI |

**Goal**: Parity. Players can switch without losing functionality.

### Phase 2: Surpass (Weeks 4-6)
Add features EF-Map cannot replicate.

| Week | Deliverable | Why EF-Map Can't Match |
|------|-------------|------------------------|
| 4 | Live gate intel overlay | No write path |
| 5 | Reputation-weighted reports | No blockchain |
| 6 | Tribe-specific map views | No auth system |

**Goal**: Your tool is strictly better. Switching has no downside + upside.

### Phase 3: Obsolete (Weeks 7-8)
Build the integration layer that locks EF-Map out entirely.

| Week | Deliverable | Why EF-Map Is Excluded |
|------|-------------|------------------------|
| 7 | Smart Gate integration | Can't write contracts |
| 8 | Bounty marketplace | No economic layer |

**Goal**: EF-Map becomes "the old tool." Your tool is the default.

---

## THE DATA WAR: HOW TO BEAT THEIR 4,390 KILLS

EF-Map has a head start on combat data. You neutralize this in 30 days.

### Day 1-7: Bootstrap with EF-Map's Public Data
EF-Map's killboard is public. Scrape it (respectfully, via their API if available) and backfill your on-chain attestations. Issue `SHIP_KILL` attestations for historical kills. Now you have their data, but **on-chain and composable**.

### Day 8-14: Incentivize Live Reporting
Launch "Scout Bounties" — players who report accurate gate status earn SUI. First 100 accurate reports get bonus rewards. Your data becomes **more live** than EF-Map's batch-cron updates.

### Day 15-21: Tribe Network Effects
Partner with 3 top tribes. Their members use your tool exclusively. Their intel feeds your oracle network. EF-Map's data becomes **incomplete** because major tribes don't report to them.

### Day 22-30: Default Status
Your killboard has historical + live data. EF-Map only has historical. Players check your tool first. EF-Map becomes a fallback.

---

## THE FRONTEND: BUILDING A BETTER STAR MAP

### EF-Map's UI Weaknesses
- Generic styling — no tribe branding
- No real-time updates — manual refresh
- No action layer — read-only
- Mobile experience — likely poor (single dev)

### Your UI Advantages
- **Brutalist design** — matches user's aesthetic preference [memory]
- **Real-time WebSocket** — intel updates stream live
- **Action buttons** — "Report Hostile", "Place Bounty", "Hire Merc" directly on map
- **Mobile-first** — PWA, works on phone/tablet

### Key Screen: The Tactical Map

```
┌─────────────────────────────────────────────────────────────┐
│  SYNDICATE: NORTHERN COALITION    REP: 847    SUI: 1,240   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ⚠️        ✓         ☠️                                    │
│   [CAMP]   [SAFE]   [HOST]                                  │
│     ●        ●        ●                                     │
│      \      /         |                                    │
│       ●─────●─────────●                                     │
│      /      \        /                                     │
│     ●        ●───────●                                      │
│   [CLEAR]  [VERIFY] [ALLY]                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ROUTE: Jita → Amarr                                │   │
│  │  Distance: 12 jumps  |  Risk: MEDIUM                │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │   │
│  │  ⚠️  Gate 4: CAMPED (reported 3 min ago)            │   │
│  │  ✓   Gate 7: VERIFIED (scout: DA_FABUL)            │   │
│  │  ☠️  Gate 9: HOSTILE (avoid — toll 10x)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Report] [Bounty] [Merc] [Share] [Settings]               │
└─────────────────────────────────────────────────────────────┘
```

---

## THE ECONOMIC FLYWHEEL (WHY EF-MAP CAN'T COMPETE)

EF-Map is a **cost center** — hosting, indexing, development time. No revenue.

Your protocol is a **revenue engine**:

| Revenue Stream | Source | Monthly Est. |
|---------------|--------|--------------|
| **Attestation fees** | 0.01 SUI per gate report | 500 SUI |
| **Oracle licensing** | Tribes pay for premium intel | 2,000 SUI |
| **Bounty placement** | 5% fee on bounty value | 1,000 SUI |
| **Mercenary matching** | 10% fee on contract value | 3,000 SUI |
| **Gate toll routing** | 1% fee on toll optimization | 500 SUI |

**Total**: ~7,000 SUI/month at modest adoption.

EF-Map has **zero revenue**. They cannot hire, cannot scale, cannot compete with a funded protocol. This is the **economic kill shot**.

---

## THE NARRATIVE: HOW TO POSITION AGAINST EF-MAP

### Don't Say
- "We're better than EF-Map"
- "EF-Map is bad"
- "Use our tool instead"

### Do Say
- "EF-Map shows you the map. We show you **your tribe's map**."
- "EF-Map tells you what happened. We tell you **what's happening now**."
- "EF-Map is a viewer. We're **infrastructure**."

### The Pitch to Players
> "EF-Map is great for looking up kills. But when you're flying through hostile space, do you want a map from last week, or a map that updates **every block**? Do you want generic intel, or intel **filtered by your syndicate's standing**? Do you want to see a gate is camped, or do you want your Smart Gate to **automatically reroute** around it?"

### The Pitch to Tribe Leaders
> "EF-Map shows public data. We show **your data** — your scouts, your standing, your marks. Your tribe's intelligence is a competitive advantage. Don't give it away to a public tool."

---

## THE DEFENSIVE MOAT: WHY EF-MAP CAN'T CATCH UP

Even if EF-Map tries to copy you, they face **structural barriers**:

1. **Blockchain expertise**: They'd need to hire Move/Solidity devs. You already have v4 modules.
2. **Economic model**: They'd need to build staking, slashing, treasury. You already have it.
3. **Smart contract integration**: They'd need to learn MUD + Sui. You're already building on both.
4. **Tribe relationships**: You partner with tribes first. They have no relationship layer.
5. **Network effects**: Every tribe that adopts you makes EF-Map less useful. EF-Map has no network effects.

**The gap widens every week you ship.**

---

## 8-WEEK DISPLACEMENT ROADMAP

| Week | Phase | Deliverable | EF-Map Status |
|------|-------|-------------|---------------|
| 1 | Match | Killboard + indexer | Parity |
| 2 | Match | Gate graph + route planner | Parity |
| 3 | Match | Star map frontend | Parity |
| 4 | Surpass | Live gate intel overlay | **Behind** |
| 5 | Surpass | Reputation-weighted reports | **Behind** |
| 6 | Surpass | Tribe-specific views | **Behind** |
| 7 | Obsolete | Smart Gate integration | **Excluded** |
| 8 | Obsolete | Bounty marketplace | **Excluded** |

---

## THE ENDGAME

Month 3: EF-Map is a **legacy tool** used by players who haven't switched.
Month 6: EF-Map shuts down or pivots to a different game.
Month 12: Players don't remember EF-Map existed. Your protocol is **the default**.

The kill shot isn't a single feature. It's the **combination** of:
- Everything EF-Map does (parity)
- Everything EF-Map can't do (live intel, Smart Gates, tribe sovereignty)
- An economic model that funds continued development
- Network effects that make switching cost increase over time

**You don't edge them out by being better at one thing. You edge them out by making them irrelevant.**

---

*This document replaces the partnership strategy with competitive displacement. All v4 technical modules remain valid — this is a strategic reframing, not a technical change.*
