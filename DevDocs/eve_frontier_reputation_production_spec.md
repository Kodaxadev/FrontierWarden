
# EVE FRONTIER ON-CHAIN REPUTATION SYSTEM
## Deep Architectural Analysis — Production-Ready Build Spec

---

## EXECUTIVE SUMMARY

The on-chain reputation/karma system remains the highest-value white space in EVE Frontier. 
Despite 123 hackathon submissions and explicit whitepaper backing, no team built a generalized 
reputation protocol. Three critical corrections significantly alter scope and strategy — 
the opportunity is actually **larger** than initially framed because the attestation primitive 
doesn't exist yet on Sui.

**Key Insight**: You're not building a reputation app. You're building the **canonical attestation 
standard for Sui gaming** — with EVE Frontier as the first customer.

---

## CORRECTION 1: NO EAS ON SUI — YOU'RE BUILDING THE PRIMITIVE

### The Gap
- **EAS (Ethereum Attestation Service)** is EVM-native only (Ethereum, Optimism, Base, Polygon) [^54^]
- Karma GAP uses EAS on Optimism — not applicable to Sui
- No Move equivalent exists in the Sui ecosystem (confirmed via awesome-sui curated list)

### Implication
**You're not using an attestation layer — you're building it.**

This increases scope by 2-3 weeks of Move contract work before reputation logic begins:
- Attestation object schema
- Oracle registry  
- Schema versioning system

### The Opportunity
Whoever builds the canonical attestation standard for Sui gaming owns the primitive for:
- EVE Frontier
- Future CCP games on Sui
- All Sui gaming ecosystems

**Defensibility is the schema registry, not reputation data.**

### Reference Architecture (Move)

```move
public struct Schema has key {
    id: UID,
    schema_id: vector<u8>,       // e.g., b"KILL_ATTESTATION_V1"
    resolver: Option<address>,    // optional on-chain resolver
    revocable: bool,
}

public struct Attestation has key, store {
    id: UID,
    schema_id: vector<u8>,
    issuer: address,              // oracle address
    subject: address,             // player's Sui address
    claim_type: vector<u8>,
    value: u64,
    expiration_epoch: u64,
    revoked: bool,
}

public struct SchemaRegistry has key {
    id: UID,
    schemas: Table<vector<u8>, Schema>,
}
```

### Sui-Specific Design Patterns

From Sui's object-centric model [^56^][^60^]:
- **Registry as shared object**: Like DeepBook's Registry, your SchemaRegistry should be a `share_object` created once at package publish time
- **Table for indexing**: Use `Table<vector<u8>, Schema>` for O(1) schema lookups by ID [^78^]
- **Capability pattern**: Use `key` without `store` for non-transferable oracle credentials (SBT-style) [^58^]

### Move Best Practices for Schema Registry [^79^]

```move
module reputation::schema_registry {
    // === Imports ===
    use sui::table::{Self, Table};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // === Errors ===
    const ESchemaAlreadyExists: u64 = 1;
    const ESchemaNotFound: u64 = 2;

    // === Structs ===
    public struct SchemaRegistry has key {
        id: UID,
        schemas: Table<vector<u8>, Schema>,
        admin: address,
    }

    public struct Schema has store {
        schema_id: vector<u8>,
        resolver: Option<address>,
        revocable: bool,
        created_at: u64,
    }

    // === Init ===
    fun init(ctx: &mut TxContext) {
        let registry = SchemaRegistry {
            id: object::new(ctx),
            schemas: table::new(ctx),
            admin: tx_context::sender(ctx),
        };
        transfer::share_object(registry);
    }

    // === Admin Functions ===
    public entry fun register_schema(
        registry: &mut SchemaRegistry,
        schema_id: vector<u8>,
        resolver: Option<address>,
        revocable: bool,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, 0);
        assert!(!table::contains(&registry.schemas, schema_id), ESchemaAlreadyExists);

        let schema = Schema {
            schema_id: copy schema_id,
            resolver,
            revocable,
            created_at: tx_context::epoch(ctx),
        };
        table::add(&mut registry.schemas, schema_id, schema);
    }
}
```

---

## CORRECTION 2: SMART ASSEMBLIES ARE CURRENTLY SOLIDITY (BUT MIGRATING)

### Current State
- Smart Assemblies run on **Ethereum blockchain** (Solidity) using the **MUD Framework** [^13^]
- Official docs: "You program them using industry-standard languages, such as Solidity" [^13^]
- Builder examples use Anvil, Foundry, Solidity [^66^][^70^]
- **GitHub repo**: `projectawakening/builder-examples` — 97 stars, actively maintained [^66^]

### Migration Timeline
- **March 2026**: Migration to Sui testnet began with Cycle 5 "Shroud of Fear" [^10^][^69^]
- **Late March/Early April 2026**: Full transition from EVM testnet to Sui [^65^][^67^]
- **Cycle 6**: June 2026 — further Sui integration [^71^]

### Key Implications

1. **Dual-support window**: Oracle layer must serve both Ethereum-based (current) and Move-based (post-migration) assemblies
2. **Don't anchor to Move-only from day one**
3. **Current Smart Gate example** (Solidity/MUD) [^16^]:

```solidity
contract MySmartGateSystem is System {
  function canJump(uint256 characterId, uint256 sourceGateId, uint256 destinationGateId) 
    public view returns (bool) {
    // Currently uses CharactersTable.getCorpId(characterId) from MUD tables
    uint256 characterCorpId = CharactersTable.getCorpId(characterId);
    return (characterCorpId == MY_CORP_ID);
  }
}
```

### Post-Migration (Move):
```move
public fun can_jump(
    character_id: address,
    registry: &ReputationRegistry,
    tribe_registry: &TribeRegistry,
    ctx: &TxContext
): bool {
    let pirate_score = get_score(registry, character_id, b"PIRATE_INDEX");
    let credit_score = get_score(registry, character_id, b"CREDIT");
    if (pirate_score > 80 && credit_score < 500) return false;
    if (is_member(tribe_registry, MY_TRIBE, character_id)) return true;
    true
}
```

### Sui Object Model Nuances

From Sui's architecture paper [^60^]:
- **Shared objects require consensus**: ReputationRegistry as a shared object will be sequenced via consensus, adding ~100-200ms latency
- **Owned objects are fast**: Player reputation profiles can be owned objects for parallel reads
- **PTB composition**: Use Programmable Transaction Blocks to batch reputation checks with other operations [^37^]

---

## CORRECTION 3: POD IS PRIVACY LAYER, NOT STORAGE

### What POD Actually Is
- **Provable Object Data (POD)** = CCP's privacy layer for selective disclosure [^55^]
- Use cases: covert fleet movement, private vaults, espionage, exclusive exploration data
- Players choose WHEN and WITH WHOM to reveal activities

### Correct Architecture
- **Attestations live on-chain** (visible)
- **POD enables selective disclosure**: Player ZK-proves "score > 700" without revealing raw score
- **Pipeline**: On-chain attestation → POD ZK-proof → Smart Gate verifies proof

### Previous Error
Incorrectly attributed storage role to POD. POD is the privacy wrapper, not the data store.

### POD Development Environment
CCP provides `projectawakening/pod-flow` — a standalone mocking environment for POD and smart contract development with GPC circuits [^66^]. This means POD integration is testable today.

---

## COMPETITIVE THREAT: EF-MAP

### The Real Threat
**EF-Map** is the unacknowledged competitive threat in the oracle layer, not Periscope.

### EF-Map's Existing Infrastructure
- **4,390+ kill mails indexed** [^29^]
- Data pipeline: Primordium indexer → Postgres → Docker cron → Cloudflare KV
- Schema includes: `killer_character_id`, `victim_character_id`, `solar_system_id`, `kill_timestamp`, `loss_type`
- Already resolved aggregation bugs (unique killers bug, KV quota problems)
- Built tribe attribution
- **Killboard built in ~4 hours**

### The Risk
If EF-Map publishes a "pirate score" endpoint from existing data (<1 day of work), they become the **de facto combat oracle** before you've written a schema.

### Strategic Response: Partnership, Not Competition

**Negotiation framework:**
- **You provide**: Schema registry, credit/governance oracles, Smart Assembly integration
- **They provide**: Signed combat attestations from existing kill data
- **Revenue share**: Oracle fees split between protocol and data provider
- **Standard**: EF-Map attestations conform to your schema registry

This transforms threat into moat.

---

## SUI SBT IMPLEMENTATION DEEP DIVE

### Sui's Native SBT Pattern

From Sui's official documentation [^57^][^58^]:

```move
// SBT implementation: remove `store` ability
public struct ReputationProfile has key {
    id: UID,
    // No `store` ability = non-transferable
    // Only module that defined it can transfer
}

// Dynamic fields for evolving reputation
public struct ReputationScore has store {
    schema_id: vector<u8>,
    value: u64,
    last_updated: u64,
}

// Add score dynamically
public fun add_score(
    profile: &mut ReputationProfile,
    schema_id: vector<u8>,
    value: u64,
    ctx: &TxContext
) {
    let score = ReputationScore {
        schema_id,
        value,
        last_updated: tx_context::epoch(ctx),
    };
    dynamic_field::add(&mut profile.id, schema_id, score);
}
```

### Key Sui Advantages for Reputation

1. **Dynamic fields**: Reputation scores can be added/updated without redeploying the contract [^57^]
2. **Object display standard**: Custom visualization logic for reputation UIs
3. **zkLogin integration**: Players can prove reputation without revealing wallet address [^33^]
4. **Cross-chain identity**: SuiLink pattern for linking Ethereum/Solana addresses [^57^]

### Real-World SBT Examples on Sui

| Project | Use Case | Pattern |
|---------|----------|---------|
| **DeepBook** | DBClaimNFT for token allocations | SBT as claim ticket [^57^] |
| **SuiNS** | Name service decentralization | SBT for governance rights [^57^] |
| **SuiLink** | Cross-chain identity | SBT linking ETH/SOL addresses [^57^] |
| **SuiPlay0X1** | Pre-order reservations | SBT as physical device reservation [^57^] |

---

## WHITEPAPER-BACKED USE CASES

### 1. Kill Mail as Oracle
CCP explicitly positioned Kill Mail as an oracle [^55^]:
> "Kill Mail serves as an oracle of the data that can feed military intelligence, urban planning, or underpin emerging in-game financial instruments."

**Signal**: Financial instruments on kill data are intentional design, not speculation.

### 2. Singletons (Item-Level Reputation)
CCP introduced **Singletons** — ships with on-chain provenance [^55^]:
> "it will be possible to prove that one ship was newly crafted while the other was owned by a famous fleet commander, or fought in a battle, or was obtained in a treacherous way."

**Example**: DA FABUL's ship with K/D 53.31 carries that history as a Singleton.

**Requirement**: Your reputation system needs a **Singleton attestation type** — "this item has combat provenance" — not just character attestations.

### 3. Risk Profiling & Reputation Scores
CCP's whitepaper explicitly states [^50^]:
> "This onchain information can form the basis of risk profiling and reputation scores, which can then be utilized to underwrite decision-making for developers looking to form financial relationships with other inhabitants of the Frontier."

---

## REVISED ARCHITECTURE

### Four Layers (Corrected)

| Layer | Component | Technology | Notes |
|-------|-----------|------------|-------|
| **Layer 0** | Schema Registry (NEW) | Move — no EAS exists | Shared object, Table indexing |
| **Layer 1** | Soulbound Identity | SBTs on Sui | `key` without `store`, dynamic fields |
| **Layer 2** | Behavioral Attestations | Custom Move attestation objects | Referencing SchemaRegistry |
| **Layer 3** | Contextual Scores | Oracle network (EF-Map + others) | Signed attestations |
| **Layer 4** | Programmable Access | Solidity (now) / Move (post-migration) | Dual-support required |

### Oracle Network Design

| Oracle | Source | Attestation Type | Status |
|--------|--------|-----------------|--------|
| **EF-Map** | Existing killboard | Combat record, Pirate Index | **Partner candidate** |
| **Trade Oracle** | Marketplace/DEX events | Credit score, trade volume | Build or partner |
| **Tribe Oracle** | Tribe governance records | Membership, contributions | Tribe-run |
| **Dispute Oracle** | DAO jury outcomes | Conflict resolution | Community DAO |
| **Singleton Oracle** | Ship provenance data | Item-level combat history | Future (post-Singleton launch) |

---

## REVISED BUILD ORDER

| Phase | Duration | What | Why |
|-------|----------|------|-----|
| **Phase 0** | 2-3 weeks | Define Sui attestation schema standard (Move) | No EAS exists — building the primitive; open standard drives adoption |
| **Phase 1** | 1-2 weeks | Oracle partnerships (EF-Map combat, Periscope trade) | Neutralize competitive threat; faster than building from scratch |
| **Phase 2** | 2-3 weeks | SBT identity + credit score | Undercollateralized lending is the killer app |
| **Phase 3** | 2-3 weeks | Pirate Index + governance scores | Tribe vetting, mercenary markets |
| **Phase 4** | Post-migration | Smart Assembly integration (Move) | Solidity version too short-lived; wait for Sui transition |
| **Phase 5** | Ongoing | Singleton attestations | Item-level reputation for ship provenance |

---

## ECONOMIC MODEL

### Revenue Streams

| Stream | Mechanism | Est. Value |
|--------|-----------|------------|
| **Attestation fees** | Small SUI fee per attestation issued | Protocol baseline |
| **Oracle licensing** | Monthly fee for tribes/apps using premium oracles | B2B revenue |
| **Score query fees** | Micro-fee for Smart Assembly reputation checks | Usage-based |
| **Dispute resolution** | Percentage of escrow value for arbitration | High-margin |

### Network Effects

1. **Data accumulation**: Historical signal increases in value over time
2. **Oracle lock-in**: Tribes build workflows around specific oracles
3. **Standard setting**: Defines data schema for all future Frontier tools
4. **Composability**: CradleOS governance, Blood Contract bounty reliability, Bazaar seller ratings all integrate

---

## RISK MATRIX (Corrected)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| EF-Map launches competing oracle | High | High | **Partner before they compete** |
| Sui migration delays | Medium | Medium | Build schema standard first; delay assembly integration |
| Low adoption (chicken-egg) | Medium | High | Free tier for basic scores; premium for advanced |
| Oracle collusion | Low | High | Multi-sig committees; oracle reputation staking |
| Sybil attacks | Medium | Medium | SUI staking + zkLogin Web2 linkage |
| CCP builds competing system | Low | High | Neutral protocol positioning; CCP historically outsources tools |

---

## THE THESIS (Unchanged)

The reputation thesis remains sound:
- **Whitepaper explicitly backs it** [^50^][^55^]
- **Data infrastructure is live** (EF-Map, Periscope) [^29^]
- **No one built it in 123 submissions** [^18^]
- **Strong network effects** once established

The corrections are **architectural, not strategic**. The opportunity is larger than initially framed because the attestation primitive doesn't exist yet — meaning the builder who creates it owns not just Frontier reputation, but the standard for Sui gaming attestations.

---

## KEY METRICS TO TRACK

| Metric | Target | Why |
|--------|--------|-----|
| Schema adoptions | 5+ tools using registry | Standard network effect |
| Oracle partners | 3+ live oracles | Data coverage |
| Attestations issued | 10,000+ | Usage traction |
| Smart Assembly integrations | 10+ | Platform lock-in |
| Credit scores queried | 1,000+/week | Financial use case validation |

---

## TECHNICAL DEEP DIVE: NAUTILUS PATTERN FOR ORACLES

From Sui's Nautilus documentation [^64^], oracles can use **TEE (Trusted Execution Environment)** attestation:

```
Enclave exposes 3 HTTP endpoints:
1. /health_check — domain reachability
2. /get_attestation — signed attestation document for on-chain registration
3. /process_data — custom logic endpoint

PCR (Platform Configuration Registers):
- PCR0: OS and boot environment
- PCR1: Application code  
- PCR2: Runtime configuration
```

**Application to Reputation Oracles:**
- EF-Map runs their indexer in a TEE
- TEE generates ephemeral keypair inside isolated memory
- Private key never leaves enclave
- Public key registered on-chain via `/get_attestation`
- Signed kill data from `/process_data` is verifiable by Move contract

This provides **cryptographic guarantee** that kill data came from the legitimate EF-Map infrastructure, not a spoofed source.

---

## SMART ASSEMBLY INTEGRATION: CURRENT STATE

### Available Assembly Types [^13^]
- **Smart Storage Unit** — Storage and dispensing of items
- **Smart Turret** — Defense of an area  
- **Smart Gate** — Connecting two solar systems

### Current Programming Model
- **Language**: Solidity with MUD Framework [^13^][^74^]
- **Deployment**: Via `world-chain-contracts` repo [^74^]
- **Namespace system**: Each builder gets unique namespace [^70^]
- **Interaction**: Through MUD tables (e.g., `CharactersTable.getCorpId()`) [^16^]

### Reputation Integration Point
The `canJump()` pattern [^16^] is exactly where reputation checks would slot in:

```solidity
// Current: Corp-based access
uint256 characterCorpId = CharactersTable.getCorpId(characterId);
if(characterCorpId == MY_CORP_ID) return true;

// Future: Reputation-based access
uint256 pirateScore = ReputationOracle.getScore(characterId, "PIRATE_INDEX");
uint256 creditScore = ReputationOracle.getScore(characterId, "CREDIT");
if(pirateScore > 80 && creditScore < 500) return false;
```

---

## SUI MIGRATION STATUS (April 2026)

### Confirmed Timeline
- **March 11, 2026**: Cycle 5 "Shroud of Fear" launched with Sui migration [^69^]
- **March 13, 2026**: Hackathon went live alongside migration [^10^]
- **April 2026**: Migration "currently being worked on" — testnet active [^11^]
- **Cycle 6**: June 2026 — further Sui integration planned [^71^]

### What This Means for Builders
1. **Testnet is live on Sui** — Smart Assemblies are now programmable by third parties on Sui [^10^]
2. **EVM still running** — Dual-chain period for backward compatibility
3. **Move contracts deployable now** — No need to wait for mainnet
4. **Hackathon proved viability** — 123 submissions on Sui infrastructure [^18^]

---

## DYNAMIC FIELDS PATTERN FOR REPUTATION SCORES [^83^]

Sui's review rating example demonstrates the exact pattern for reputation:

```move
public struct Service has key, store {
    id: UID,
    reward_pool: Balance<SUI>,
    reward: u64,
    top_reviews: vector<ID>,
    reviews: ObjectTable<ID, Review>,
    overall_rate: u64,
    name: String
}
```

**Adapted for ReputationProfile:**

```move
public struct ReputationProfile has key {
    id: UID,
    // Dynamic fields hold scores: schema_id -> ReputationScore
}

public struct ReputationScore has store {
    schema_id: vector<u8>,
    value: u64,
    last_updated: u64,
    issuer: address,  // oracle that issued this score
}

// Add score as dynamic field
public fun add_reputation_score(
    profile: &mut ReputationProfile,
    schema_id: vector<u8>,
    value: u64,
    issuer: address,
    ctx: &TxContext
) {
    let score = ReputationScore {
        schema_id: copy schema_id,
        value,
        last_updated: tx_context::epoch(ctx),
        issuer,
    };
    dynamic_field::add(&mut profile.id, schema_id, score);
}

// Query score
public fun get_score(
    profile: &ReputationProfile,
    schema_id: vector<u8>
): u64 {
    let score: &ReputationScore = dynamic_field::borrow(&profile.id, schema_id);
    score.value
}
```

---

## TABLE VS OBJECTTABLE DECISION MATRIX [^83^]

| Collection | Use When | Reputation Application |
|------------|----------|----------------------|
| **Table** | Values don't need to be Sui objects; stored as children but not accessible by ID | SchemaRegistry.schemas (Schema is not an object) |
| **ObjectTable** | Values are Sui objects; accessible by ID from transaction explorer | Service.reviews (Review is an object) |
| **Dynamic Fields** | Flexible key-value; keys can be any type with `copy + drop + store` | ReputationProfile.scores (key = schema_id vector<u8>) |

**For reputation system:**
- **SchemaRegistry**: Use `Table<vector<u8>, Schema>` — schemas don't need to be independent objects
- **ReputationProfile**: Use **dynamic fields** — scores are keyed by schema_id, flexible addition
- **Attestations**: Use `ObjectTable<ID, Attestation>` — attestations are objects that may be referenced independently

---

## COMPLETE MOVE MODULE SPEC

```move
module reputation::protocol {
    // === Imports ===
    use std::option::{Self, Option};
    use std::vector;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::object_table::{Self, ObjectTable};
    use sui::dynamic_field;
    use sui::event;

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const ESchemaExists: u64 = 2;
    const ESchemaNotFound: u64 = 3;
    const EInvalidOracle: u64 = 4;
    const EAttestationRevoked: u64 = 5;

    // === Events ===
    public struct SchemaRegistered has copy, drop {
        schema_id: vector<u8>,
        resolver: Option<address>,
    }

    public struct AttestationIssued has copy, drop {
        attestation_id: ID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
    }

    // === Layer 0: Schema Registry ===
    public struct SchemaRegistry has key {
        id: UID,
        schemas: Table<vector<u8>, Schema>,
        admin: address,
    }

    public struct Schema has store {
        schema_id: vector<u8>,
        resolver: Option<address>,
        revocable: bool,
        created_at: u64,
    }

    // === Layer 1: SBT Identity ===
    public struct ReputationProfile has key {
        id: UID,
        owner: address,
        created_at: u64,
    }

    // === Layer 2: Attestations ===
    public struct Attestation has key, store {
        id: UID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
        expiration_epoch: u64,
        revoked: bool,
        issued_at: u64,
    }

    // === Layer 3: Oracle Registry ===
    public struct OracleRegistry has key {
        id: UID,
        oracles: Table<address, OracleInfo>,
        admin: address,
    }

    public struct OracleInfo has store {
        oracle_address: address,
        name: vector<u8>,
        schemas: vector<vector<u8>>,  // which schemas this oracle can issue
        reputation_score: u64,         // oracle's own reputation
        registered_at: u64,
    }

    // === Init ===
    fun init(ctx: &mut TxContext) {
        let schema_registry = SchemaRegistry {
            id: object::new(ctx),
            schemas: table::new(ctx),
            admin: tx_context::sender(ctx),
        };
        transfer::share_object(schema_registry);

        let oracle_registry = OracleRegistry {
            id: object::new(ctx),
            oracles: table::new(ctx),
            admin: tx_context::sender(ctx),
        };
        transfer::share_object(oracle_registry);
    }

    // === Public Functions ===

    // Create reputation profile (SBT)
    public entry fun create_profile(ctx: &mut TxContext) {
        let profile = ReputationProfile {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            created_at: tx_context::epoch(ctx),
        };
        transfer::transfer(profile, tx_context::sender(ctx));
    }

    // Register new attestation schema
    public entry fun register_schema(
        registry: &mut SchemaRegistry,
        schema_id: vector<u8>,
        resolver: Option<address>,
        revocable: bool,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAuthorized);
        assert!(!table::contains(&registry.schemas, schema_id), ESchemaExists);

        let schema = Schema {
            schema_id: copy schema_id,
            resolver,
            revocable,
            created_at: tx_context::epoch(ctx),
        };
        table::add(&mut registry.schemas, schema_id, schema);

        event::emit(SchemaRegistered { schema_id, resolver });
    }

    // Issue attestation (called by registered oracle)
    public entry fun issue_attestation(
        schema_registry: &SchemaRegistry,
        oracle_registry: &OracleRegistry,
        subject_profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        value: u64,
        expiration_epochs: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify oracle is registered for this schema
        assert!(table::contains(&oracle_registry.oracles, sender), EInvalidOracle);
        let oracle_info = table::borrow(&oracle_registry.oracles, sender);
        assert!(vector::contains(&oracle_info.schemas, &schema_id), EInvalidOracle);

        // Verify schema exists
        assert!(table::contains(&schema_registry.schemas, schema_id), ESchemaNotFound);

        let attestation = Attestation {
            id: object::new(ctx),
            schema_id: copy schema_id,
            issuer: sender,
            subject: subject_profile.owner,
            value,
            expiration_epoch: tx_context::epoch(ctx) + expiration_epochs,
            revoked: false,
            issued_at: tx_context::epoch(ctx),
        };

        // Store attestation ID in profile via dynamic field
        let attestation_id = object::id(&attestation);
        dynamic_field::add(&mut subject_profile.id, attestation_id, true);

        transfer::public_transfer(attestation, subject_profile.owner);

        event::emit(AttestationIssued {
            attestation_id,
            schema_id,
            issuer: sender,
            subject: subject_profile.owner,
            value,
        });
    }

    // Query score from profile (view function)
    public fun get_reputation_score(
        profile: &ReputationProfile,
        schema_id: vector<u8>
    ): u64 {
        // In production: aggregate all attestations for this schema
        // For now: placeholder returns 0
        0
    }
}
```

---

*Analysis revised based on: EAS architecture review, Sui ecosystem audit, EF-Map infrastructure documentation, CCP whitepaper v2, Smart Assembly support docs, Sui migration timeline (April 2026), Sui SBT implementation patterns, Nautilus TEE oracle patterns, Project Awakening builder examples, Sui Move best practices, and dynamic fields patterns.*
