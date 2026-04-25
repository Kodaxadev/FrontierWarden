
# EVE FRONTIER TRIBAL INTELLIGENCE LAYER
## Product Specification v1.0 — From Generic Reputation to Tribe Infrastructure

---

## THE INSIGHT

EF-Map is a **read-only viewer** of public chain data. It calculates routes using 
Dijkstra/A* over Smart Gate adjacency [^94^][^96^], but it cannot:
- Write gate state back to the chain
- Weight routes by tribe-specific intel
- Verify who reported a gate as hostile
- Persist tactical marks across sessions

Your protocol is a **writable, reputation-gated, tribe-sovereign intelligence layer**.
The routing is the commodity. The **verified live intel** is the moat.

---

## PART 1: EVE FRONTIER-SPECIFIC SCHEMA REGISTRY

### Core Intel Schemas

| Schema ID | Type | Value Range | Issued By | Expires |
|-----------|------|-------------|-----------|---------|
| `GATE_HOSTILE` | Boolean | 0/1 | Gate Monitor Oracle | 24 epochs |
| `GATE_CAMPED` | Boolean | 0/1 | Player Report Oracle | 12 epochs |
| `GATE_CLEAR` | Boolean | 0/1 | Scout Oracle | 6 epochs |
| `HEAT_TRAP` | Severity | 0-100 | Combat Oracle | 24 epochs |
| `ROUTE_VERIFIED` | Boolean | 0/1 | Route Oracle | 48 epochs |
| `SYSTEM_CONTESTED` | Faction ID | 0-65535 | Territory Oracle | 72 epochs |
| `SHIP_KILL` | Kill Value | 0-∞ | EF-Map Combat Oracle | Permanent |
| `GATE_TOLL` | SUI Amount | 0-∞ | Gate Owner Oracle | Until changed |
| `TRIBE_STANDING` | Score | -1000 to +1000 | Tribe Oracle | 30 epochs |
| `PLAYER_BOUNTY` | SUI Amount | 0-∞ | Bounty Oracle | Until claimed |

### Schema Definitions (Move)

```move
// GATE_HOSTILE — reported by automated gate monitors or player scouts
public entry fun register_gate_schemas(registry: &mut SchemaRegistry, ctx: &mut TxContext) {
    // Gate status schemas
    schema_registry::register_schema(registry, b"GATE_HOSTILE", 1, option::none(), true, ctx);
    schema_registry::register_schema(registry, b"GATE_CAMPED", 1, option::none(), true, ctx);
    schema_registry::register_schema(registry, b"GATE_CLEAR", 1, option::none(), true, ctx);
    schema_registry::register_schema(registry, b"GATE_TOLL", 1, option::none(), true, ctx);

    // Route intel schemas
    schema_registry::register_schema(registry, b"HEAT_TRAP", 1, option::none(), true, ctx);
    schema_registry::register_schema(registry, b"ROUTE_VERIFIED", 1, option::none(), true, ctx);
    schema_registry::register_schema(registry, b"SYSTEM_CONTESTED", 1, option::none(), true, ctx);

    // Combat schemas
    schema_registry::register_schema(registry, b"SHIP_KILL", 1, option::none(), false, ctx);
    schema_registry::register_schema(registry, b"PLAYER_BOUNTY", 1, option::none(), true, ctx);
}
```

---

## PART 2: GATE INTEL ORACLE NETWORK

### Oracle Types for EVE Frontier

| Oracle | Data Source | Schema | Stake | TEE Required |
|--------|-------------|--------|-------|--------------|
| **Gate Monitor Bot** | Automated gate proximity scan | `GATE_HOSTILE`, `GATE_CAMPED`, `GATE_CLEAR` | 5,000 SUI | Yes |
| **EF-Map Combat** | Killboard indexer | `SHIP_KILL`, `HEAT_TRAP` | 10,000 SUI | Yes |
| **Scout Network** | Player-submitted reports | `GATE_CAMPED`, `ROUTE_VERIFIED` | 1,000 SUI | No |
| **Territory Oracle** | Tribe sovereignty claims | `SYSTEM_CONTESTED`, `TRIBE_STANDING` | 2,000 SUI | No |
| **Gate Owner** | Smart Gate owner | `GATE_TOLL` | 500 SUI | No |

### Gate Monitor Bot Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Gate Monitor Bot (Automated Oracle)             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  EVE Client │───▶│  Proximity  │───▶│  Gate State │     │
│  │   Hook      │    │   Scanner   │    │   Engine    │     │
│  └─────────────┘    └─────────────┘    └──────┬──────┘     │
│                                                │            │
│  Detects: hostile ships near gate              │            │
│  Threshold: >3 ships with pirate score >80     │            │
│  Cooldown: 6 epochs between reports            │            │
│                                                ▼            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         AWS Nitro Enclave (Isolated TEE)             │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────┐  │    │
│  │  │  Gate State │───▶│  Aggregate  │───▶│  Sign   │  │    │
│  │  │   Update    │    │   Severity  │    │  Attest │  │    │
│  │  └─────────────┘    └─────────────┘    └────┬────┘  │    │
│  │                                              │       │    │
│  │  Output: GATE_CAMPED attestation for gate_id │       │    │
│  │  Value: severity score (0-100)               │       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Player Scout Network (Human Oracle)

```move
// Players manually report gate status via frontend
// Lower stake, no TEE, but reports are weighted by reporter's reputation

public entry fun report_gate_status(
    scout_cap: &OracleCapability,
    gate_profile: &mut ReputationProfile,
    gate_id: vector<u8>,
    status: u8,  // 0=CLEAR, 1=CAMPED, 2=HOSTILE
    ctx: &mut TxContext
) {
    let schema_id = if (status == 0) { b"GATE_CLEAR" }
        else if (status == 1) { b"GATE_CAMPED" }
        else { b"GATE_HOSTILE" };

    profile::update_score(
        scout_cap,
        gate_profile,
        schema_id,
        status as u64,
        1,
        ctx
    );
}
```

---

## PART 3: ROUTE PLANNER WITH TRIBAL INTEL OVERLAY

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Route Planner Frontend                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Star Map   │───▶│  Pathfinding│───▶│   Render    │     │
│  │   Canvas    │    │   Engine    │    │   Layer     │     │
│  └─────────────┘    └──────┬──────┘    └─────────────┘     │
│                            │                                │
│  Data Sources:             │                                │
│  ┌─────────────────────────┘                                │
│  │                                                           │
│  ▼                                                           │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  1. CCP World Contracts (MUD tables)                 │     │
│  │     - Smart Gate adjacency                          │     │
│  │     - System coordinates                            │     │
│  │     - Gate ownership                                │     │
│  │                                                      │     │
│  │  2. Your Attestation Layer (Sui)                     │     │
│  │     - GATE_HOSTILE / GATE_CAMPED / GATE_CLEAR       │     │
│  │     - HEAT_TRAP scores                              │     │
│  │     - ROUTE_VERIFIED flags                          │     │
│  │     - TRIBE_STANDING (syndicate-level diplomacy)    │     │
│  │                                                      │     │
│  │  3. EF-Map Public Data (optional fallback)           │     │
│  │     - Static gate connections                       │     │
│  │     - Base system metadata                          │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Pathfinding with Intel Weights

```typescript
// TypeScript pseudo-code for route planner
interface RouteOptions {
    startSystem: string;
    endSystem: string;
    tribeId?: string;           // filter intel by tribe
    avoidHostileGates: boolean; // skip gates with GATE_HOSTILE > 0
    maxHeatTrap: number;        // max HEAT_TRAP score allowed
    preferVerifiedRoutes: boolean; // weight ROUTE_VERIFIED higher
    avoidSystems: string[];     // manual blocklist
}

interface SystemIntel {
    systemId: string;
    gateHostile: boolean;
    gateCamped: boolean;
    heatTrapScore: number;
    routeVerified: boolean;
    contestedBy: string | null; // tribe/syndicate ID
    standing: number;           // your tribe's standing in this system
}

function calculateRoute(options: RouteOptions): Route {
    // 1. Fetch base graph from CCP world contracts
    const graph = await fetchGateGraphFromMUD();

    // 2. Fetch live intel from Sui attestations
    const intel = await fetchIntelFromSui(options.tribeId);

    // 3. Build weighted graph
    const weightedGraph = graph.map(edge => {
        const systemIntel = intel[edge.destinationSystem];
        let weight = edge.baseDistance;

        // Apply intel modifiers
        if (systemIntel.gateHostile) weight *= 1000;      // effectively block
        if (systemIntel.gateCamped) weight *= 10;         // strongly avoid
        if (systemIntel.heatTrapScore > 50) weight *= 5;  // moderate avoid
        if (systemIntel.routeVerified) weight *= 0.8;     // prefer verified
        if (systemIntel.standing < -50) weight *= 3;      // enemy territory

        return { ...edge, weight };
    });

    // 4. Run A* with custom heuristic
    return aStar(weightedGraph, options.startSystem, options.endSystem);
}
```

### Visual Layer: Star Map with Intel Overlay

```typescript
// Canvas rendering with intel overlay
function renderSystem(ctx: CanvasRenderingContext2D, system: System, intel: SystemIntel) {
    // Base system rendering
    ctx.beginPath();
    ctx.arc(system.x, system.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Intel overlay
    if (intel.gateHostile) {
        // Red glow for hostile
        ctx.beginPath();
        ctx.arc(system.x, system.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fill();

        // Skull icon
        ctx.fillStyle = '#ff0000';
        ctx.fillText('☠️', system.x - 6, system.y - 10);
    } else if (intel.gateCamped) {
        // Yellow glow for camped
        ctx.beginPath();
        ctx.arc(system.x, system.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fill();

        // Warning icon
        ctx.fillStyle = '#ffff00';
        ctx.fillText('⚠️', system.x - 6, system.y - 10);
    } else if (intel.routeVerified) {
        // Green glow for verified safe
        ctx.beginPath();
        ctx.arc(system.x, system.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.fill();

        // Checkmark
        ctx.fillStyle = '#00ff00';
        ctx.fillText('✓', system.x - 4, system.y - 10);
    }

    // Heat trap indicator
    if (intel.heatTrapScore > 0) {
        const intensity = intel.heatTrapScore / 100;
        ctx.beginPath();
        ctx.arc(system.x, system.y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, ${255 * (1 - intensity)}, 0, ${intensity})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
```

---

## PART 4: TRIBE TACTICAL MARKS (ON-CHAIN VS EF-MAP'S EPHEMERAL)

### EF-Map's Limitation

EF-Map's shared marks are:
- **Ephemeral** — stored in Cloudflare KV, not on-chain [^29^]
- **Unverified** — anyone can place a mark, no reputation weighting
- **Non-composable** — other tools can't read them
- **Server-dependent** — if EF-Map goes down, marks disappear

### Your System's Advantage

Your tactical marks are:
- **Permanent** — on-chain attestations, persist forever
- **Reputation-weighted** — marks from high-rep oracles carry more weight
- **Composable** — any Smart Assembly can read them
- **Tribe-sovereign** — marks can be tribe-specific or public

```move
// Tactical mark attestation
public entry fun place_tactical_mark(
    cap: &OracleCapability,
    mark_profile: &mut ReputationProfile,  // profile for the mark itself
    system_id: vector<u8>,
    mark_type: vector<u8>,  // e.g., b"HOSTILE_FLEET", b"SAFE_HARBOR"
    value: u64,
    ctx: &mut TxContext
) {
    profile::update_score(
        cap,
        mark_profile,
        mark_type,
        value,
        1,
        ctx
    );
}
```

---

## PART 5: SMART GATE INTEGRATION (THE KILLER FEATURE)

### Reputation-Gated Smart Gate (Move, post-migration)

```move
module reputation_gate::gate {
    use reputation::profile::{Self, ReputationProfile};
    use reputation::oracle_registry::{Self, OracleRegistry};

    public struct SmartGate has key {
        id: UID,
        owner: address,
        tribe_id: vector<u8>,
        base_toll: u64,
        reputation_registry: address,
    }

    public fun can_jump(
        gate: &SmartGate,
        character_id: address,
        character_profile: &ReputationProfile,
        registry: &OracleRegistry,
        payment: Balance<SUI>,
        ctx: &TxContext
    ): bool {
        let pirate_score = profile::get_score(character_profile, b"PIRATE_INDEX");
        let standing_score = profile::get_score(character_profile, b"TRIBE_STANDING");
        let gate_hostile = profile::get_score(character_profile, b"GATE_HOSTILE");

        // Block if gate is reported hostile by tribe oracle
        if (gate_hostile > 0) return false;

        // Block known pirates
        if (pirate_score > 80) return false;

        // Calculate toll based on standing
        let toll = if (standing_score > 500) { 0 }           // Ally: free
            else if (standing_score > 0) { gate.base_toll * 2 }  // Neutral: 2x
            else { gate.base_toll * 10 };                        // Enemy: 10x

        // Verify payment
        assert!(payment.value() >= toll, EInsufficientPayment);

        // Process payment
        // ...

        true
    }
}
```

---

## PART 6: COMPETITIVE POSITIONING VS EF-MAP

| Capability | EF-Map | Your System |
|------------|--------|-------------|
| **Route calculation** | A* / Dijkstra [^94^][^96^] | A* / Dijkstra (same) |
| **Gate adjacency data** | Reads CCP MUD tables | Reads CCP MUD tables |
| **Live gate state** | ❌ No | ✅ On-chain attestations |
| **Tribe-specific intel** | ❌ No | ✅ Filtered by tribe ID |
| **Reputation-weighted reports** | ❌ No | ✅ Weighted by oracle stake |
| **Tactical marks** | Ephemeral KV [^29^] | Permanent on-chain |
| **Smart Gate integration** | ❌ No | ✅ Direct contract calls |
| **Bounty integration** | ❌ No | ✅ PLAYER_BOUNTY schema |
| **Write path** | ❌ Read-only | ✅ Full read/write |
| **Composability** | ❌ Closed | ✅ Open schema registry |

**The pitch**: EF-Map shows you the map. Your system shows you the **tribe's map** — live, verified, and actionable.

---

## PART 7: FRONTEND SPECIFICATION

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Map rendering** | Canvas 2D / WebGL | 200k systems, need performant rendering |
| **Pathfinding** | Web Worker (A*) | Offload from main thread |
| **Chain data** | Sui SDK + MUD indexer | Dual-chain support (EVM now, Sui future) |
| **State management** | Zustand | Lightweight, no boilerplate |
| **Styling** | Tailwind + custom CSS | Brutalist UI (per user's preference) |

### Key Screens

1. **Star Map** — Main view with intel overlay
2. **Route Planner** — Origin/destination with options
3. **Intel Feed** — Live attestations stream
4. **Tribe Dashboard** — Member reputation, standing, marks
5. **Oracle Registry** — Stake, delegate, challenge
6. **Schema Explorer** — Browse attestation types

### Data Flow

```
Player opens map
    → Frontend fetches gate graph from MUD indexer (static)
    → Frontend fetches live intel from Sui (dynamic)
    → Frontend merges into weighted graph
    → Player sets route options
    → A* runs in Web Worker
    → Route rendered with intel overlay
    → Player clicks "Report Gate Camped"
    → Frontend calls `report_gate_status` on Sui
    → Attestation issued, score updated
    → All tribe members see updated intel instantly
```

---

## PART 8: 8-WEEK MVP ROADMAP

| Week | Deliverable | Key Files |
|------|-------------|-----------|
| 1 | Define EVE schemas | `schema_registry.move` — gate intel schemas |
| 2 | Gate Monitor Oracle | Rust service — automated gate scanning |
| 3 | Route planner engine | TypeScript — A* with intel weights |
| 4 | Star map frontend | Canvas 2D — basic rendering + intel overlay |
| 5 | Player scout network | Frontend — manual report submission |
| 6 | Tribe dashboard | React — member rep, standing, marks |
| 7 | Smart Gate integration | Move — `reputation_gate.move` |
| 8 | Testnet deployment | Full system on Sui testnet |

---

## PART 9: GO-TO-MARKET

### Phase 1: Tribe Partnership (Weeks 1-4)
- Partner with 1-2 top tribes from hackathon
- Offer free oracle registration for tribe leaders
- Build tribe-specific intel dashboards

### Phase 2: EF-Map Integration (Weeks 5-6)
- Reach out to EF-Map team
- Propose: EF-Map reads your attestations as additional data layer
- Your protocol provides live intel, EF-Map provides routing engine
- **Partnership, not competition**

### Phase 3: Public Launch (Weeks 7-8)
- Open oracle registration to all players
- Launch bounty program for accurate gate reports
- Host "Scout of the Week" based on oracle reputation

---

## THE THESIS (REFINED)

EF-Map is the **Google Maps** of EVE Frontier — it shows you the roads.
Your system is **Waze** — it shows you the accidents, police, and hazards,
but verified by stake, weighted by reputation, and tribe-specific.

The routing engine is the commodity. The **verified live intel** is the moat.
And the moat gets deeper every time a tribe adopts your protocol.

---

*This specification reframes the generic reputation protocol as EVE Frontier tribal infrastructure. All prior technical work (v4 Move modules) remains valid — this document adds the product layer on top.*
