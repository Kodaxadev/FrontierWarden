
# EVE FRONTIER REPUTATION SYSTEM — EXECUTIVE BRIEFING
## For Builders: What to Build, Why, and How

---

## THE OPPORTUNITY IN ONE SENTENCE

Build the **canonical attestation standard for Sui gaming** — starting with EVE Frontier's 
on-chain reputation layer — because no equivalent to Ethereum Attestation Service (EAS) exists 
on Sui, and CCP's whitepaper explicitly calls for reputation scores to underwrite in-game 
financial instruments.

---

## WHY NOW (April 2026)

| Factor | Status |
|--------|--------|
| Sui migration | **Live on testnet** since March 2026 [^10^][^69^] |
| Smart Assemblies | **Programmable by third parties** on Sui [^10^] |
| Hackathon proved demand | 123 submissions, $80K prize pool [^18^] |
| Data infrastructure | **EF-Map killboard live** with 4,390+ kills indexed [^29^] |
| Whitepaper backing | Explicit call for "risk profiling and reputation scores" [^50^] |
| Competitive gap | **Zero reputation submissions** in 123 hackathon entries |

---

## THE THREE CORRECTIONS THAT CHANGE EVERYTHING

### 1. No EAS on Sui → You're Building the Primitive
- EAS is EVM-only (Ethereum, Optimism, Base)
- No Move equivalent exists
- **Scope increase**: 2-3 weeks to build schema registry + attestation objects
- **Defensibility**: Whoever owns the schema registry owns the standard

### 2. Smart Assemblies Are Solidity (For Now)
- Currently run on Ethereum with MUD Framework [^13^]
- Sui migration in progress — dual-chain window
- **Build for both**: Solidity oracle interface now, Move native post-migration

### 3. POD Is Privacy Layer, Not Storage
- POD = selective disclosure (ZK proofs), not data anchoring [^55^]
- Attestations live **on-chain** (visible)
- POD wraps attestations for privacy-preserving verification

---

## THE COMPETITIVE THREAT: EF-MAP

**EF-Map has already built the combat data pipeline** [^29^]:
- 4,390+ kill mails indexed
- Primordium indexer → Postgres → Docker cron → Cloudflare KV
- Tribe attribution resolved
- Killboard built in ~4 hours

**Risk**: They can become the de facto combat oracle in <1 day.
**Response**: Partner, don't compete. They provide signed attestations; you provide the schema registry.

---

## WHAT TO BUILD (Layer by Layer)

### Layer 0: Schema Registry (Move)
```move
public struct SchemaRegistry has key {
    id: UID,
    schemas: Table<vector<u8>, Schema>,  // O(1) lookup [^78^]
    admin: address,
}
```
- Shared object (single instance)
- Table indexing for schema lookups
- Admin-gated registration

### Layer 1: SBT Identity (Move)
```move
public struct ReputationProfile has key {
    id: UID,
    owner: address,
    // No `store` ability = non-transferable [^58^]
}
```
- One per player
- Dynamic fields for evolving scores [^83^]

### Layer 2: Attestations (Move)
```move
public struct Attestation has key, store {
    id: UID,
    schema_id: vector<u8>,
    issuer: address,      // oracle address
    subject: address,     // player address
    value: u64,
    expiration_epoch: u64,
    revoked: bool,
}
```
- Issued by registered oracles
- Referencing SchemaRegistry

### Layer 3: Oracle Network
| Oracle | Data Source | Attestation |
|--------|-------------|-------------|
| EF-Map | Killboard | Combat record, Pirate Index |
| Trade Oracle | Marketplace events | Credit score |
| Tribe Oracle | Governance records | Membership, contributions |
| Dispute Oracle | DAO outcomes | Conflict resolution |

### Layer 4: Smart Assembly Integration
**Current (Solidity/MUD)**:
```solidity
function canJump(uint256 characterId) public view returns (bool) {
    uint256 pirateScore = ReputationOracle.getScore(characterId, "PIRATE_INDEX");
    uint256 creditScore = ReputationOracle.getScore(characterId, "CREDIT");
    if (pirateScore > 80 && creditScore < 500) return false;
    return true;
}
```

**Post-Migration (Move)**:
```move
public fun can_jump(
    character_id: address,
    registry: &ReputationRegistry,
    ctx: &TxContext
): bool {
    let pirate_score = get_score(registry, character_id, b"PIRATE_INDEX");
    let credit_score = get_score(registry, character_id, b"CREDIT");
    if (pirate_score > 80 && credit_score < 500) return false;
    true
}
```

---

## KILLER USE CASES (Ranked by Revenue Potential)

| # | Use Case | Revenue Model | Why It Works |
|---|----------|---------------|--------------|
| 1 | **Undercollateralized Lending** | Interest spread | Credit scores unlock credit markets EBank failed to sustain [^46^] |
| 2 | **Insurance Underwriting** | Premium pricing | Ship loss history + fitting risk = viable insurance |
| 3 | **Trustless Escrow** | Mediator fees | Reputation-staked arbitrators earn dispute resolution fees |
| 4 | **Dynamic Gate Tolls** | Infrastructure revenue | Pirates pay 10x, allies pass free |
| 5 | **Mercenary Vetting** | Labor market premium | High combat reputation = higher mercenary rates |
| 6 | **Recruitment Filtering** | SaaS subscription | Tribe HR tools auto-filter by verified scores |

---

## BUILD ORDER (12-Week MVP)

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1-2 | **Schema Registry** | Move contracts: SchemaRegistry, Schema, registration flow |
| 3 | **SBT Identity** | ReputationProfile with dynamic fields |
| 4 | **Attestation Core** | Attestation struct, issue/revoke flow |
| 5 | **Oracle Registry** | Oracle registration, schema authorization |
| 6 | **EF-Map Partnership** | Integration: signed combat attestations |
| 7-8 | **Credit Score** | Aggregate trade/contract history into score |
| 9 | **Pirate Index** | Combat aggregation from EF-Map data |
| 10 | **Solidity Bridge** | Oracle interface for current Smart Assemblies |
| 11-12 | **Demo Integration** | Smart Gate with reputation gating |

---

## WHY THIS WINS

1. **No competition**: 0 of 123 hackathon submissions touched reputation
2. **Whitepaper-backed**: CCP explicitly wants this built [^50^][^55^]
3. **Data ready**: EF-Map already indexes the core combat data [^29^]
4. **Network effects**: Standard begets standard — first schema registry becomes the default
5. **Cross-game potential**: Sui gaming primitive, not just Frontier tool
6. **Strong moat**: Historical data accumulation creates switching costs

---

## NEXT STEPS (This Week)

1. **Reach out to EF-Map** — Propose oracle partnership before they build competing system
2. **Draft schema standard** — Publish open RFC for Sui gaming attestations
3. **Set up Move dev environment** — Sui CLI, testnet access
4. **Review CCP builder examples** — `projectawakening/builder-examples` [^66^]
5. **Join Frontier Discord** — Find tribe partners for Tribe Oracle pilot

---

*The window is 6-12 months. After that, EF-Map or another team will have built the combat oracle, 
and you'll be competing rather than standard-setting.*
