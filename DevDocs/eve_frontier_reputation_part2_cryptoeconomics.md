
# EVE FRONTIER REPUTATION SYSTEM — PART 2
## Oracle Cryptoeconomics, Cold-Start Strategy & Tribe Integration

---

## 1. ORACLE CRYPTOECONOMICS: ADAPTING SUI'S STAKING MODEL

Sui's Delegated Proof-of-Stake (DPoS) mechanism provides a proven template for oracle 
cryptoeconomics [^85^][^87^]. The key insight: Sui slashes **rewards, not principal** — 
validators who misbehave lose epoch rewards but keep their stake [^86^]. This is ideal 
for reputation oracles where the penalty for bad data should be economic but not 
catastrophic (you don't want to destroy an oracle's entire stake for a single bad kill mail).

### Oracle Staking Pool Design

```move
public struct OraclePool has key {
    id: UID,
    oracle_address: address,
    staked_sui: Balance<SUI>,
    delegators: Table<address, u64>,  // delegator -> amount
    total_stake: u64,
    reward_pool: Balance<SUI>,
    slash_count: u64,
    last_epoch_active: u64,
    schemas: vector<vector<u8>>,  // which schemas this oracle can attest
}
```

### Staking Mechanics (Adapted from Sui Validator Model)

| Parameter | Sui Validator | Reputation Oracle | Rationale |
|-----------|--------------|-------------------|-----------|
| **Min stake** | 30M SUI [^87^] | 1,000 SUI | Lower barrier for specialized oracles |
| **Stake activation** | Next epoch [^85^] | Next epoch | Consistent with Sui timing |
| **Slashing target** | Epoch rewards only [^86^] | Epoch rewards + attestation fees | Slightly stricter than validators |
| **Slashing threshold** | >2/3 validator vote [^88^] | >2/3 oracle council vote | Social consensus, not automatic |
| **Unbonding** | 24 hours [^86^] | 7 days | Longer lock-up for reputation data integrity |

### The Tallying Rule for Oracles

Sui validators use a "tallying rule" where >2/3 of validators must agree to slash [^88^]. 
For reputation oracles, adapt this:

1. **Oracle Council**: 9 seats — 3 from top tribes, 3 from developer community, 3 from CCP
2. **Challenge Window**: 48 hours to dispute an attestation
3. **Slash Vote**: Council members vote on disputed attestations
4. **Penalty**: 
   - First offense: 10% of epoch rewards burned
   - Second offense: 50% of epoch rewards burned  
   - Third offense: 100% of epoch rewards + removal from oracle registry

### Revenue Model for Oracles

```
Attestation Fee Structure:
├── Base fee: 0.01 SUI per attestation (paid by subject or issuer)
├── Query fee: 0.001 SUI per score lookup (paid by Smart Assembly)
├── Premium tier: 0.05 SUI per attestation (faster confirmation, higher stake)
└── Revenue split: 70% oracle, 20% protocol treasury, 10% delegators
```

### Why Delegators Matter

Sui's staking model allows users to delegate to validators and earn proportional rewards [^85^]. 
For reputation oracles, delegators serve a critical function:

- **Capital efficiency**: Oracles don't need to self-stake everything
- **Quality signal**: Higher delegated stake = more trusted oracle
- **Skin in the game**: Delegators lose rewards if oracle is slashed, creating community oversight

**Example**: EF-Map as combat oracle
- Self-stake: 5,000 SUI
- Community delegation: 45,000 SUI  
- Total stake: 50,000 SUI
- If EF-Map issues a fraudulent kill attestation, delegators lose rewards → community pressure to maintain accuracy

---

## 2. COLD-START PROBLEM: THE ACADEMIC SOLUTION

### The Problem

Reputation systems suffer from a classic cold-start: young sellers need sales to build 
reputation, but buyers flock to reputable sellers [^90^]. In Frontier, this translates to:
- New players have zero reputation
- Tribes won't lend to zero-reputation players
- Zero-reputation players can't get loans to build reputation
- **Deadlock**

### The Academic Solution: Tiered Signals

Research from a field experiment on eBay (Rotman School of Management) proves that 
introducing a **less history-dependent quality signal** breaks the deadlock [^90^]:

> "A seller's certification status is evaluated monthly based on historical sales... 
> introducing a second quality signal that focuses on fast shipping (no historical sales 
> requirement) mitigates the cold-start problem: it increases demand for high-quality 
> young sellers, incentivizes their quality provision, and increases their chance of 
> obtaining the long-run quality signal."

### Frontier Application: The "Rookie" Badge System

| Badge | Requirements | History-Dependent? | Use Case |
|-------|-------------|-------------------|----------|
| **Rookie** | Complete tutorial + verify zkLogin identity | No | Basic gate access, small loans (<100 SUI) |
| **Vouched** | 2 tribe members with >500 reputation vouch | Minimal | Medium loans, gate toll discounts |
| **Established** | 10 successful contracts + 30 days tenure | Yes | Full lending, mercenary contracts |
| **Elite** | 100+ successful contracts + tribe leadership | Heavy | Undercollateralized loans, oracle candidacy |

### Bootstrap Mechanics

**Week 1-4: Genesis Phase**
- All players start with "Rookie" badge
- Rookie badge grants access to basic features (small storage, low-toll gates)
- Tribes can "vouch" for rookies at zero cost (but vouching affects voucher's reputation if rookie scams)

**Week 5-12: Accumulation Phase**  
- First successful courier contract → +10 credit score
- First kill mail indexed → +5 combat score
- First assembly deployed → +15 builder score
- Tribe participation (votes, contributions) → +2 governance score per event

**Month 3+: Maturity Phase**
- Scores compound based on consistency (daily activity bonus)
- Negative events (scams, friendly fire) decay over time (EVE Online's standings decay model) [^41^]
- Established players can become oracles themselves

### The "Vouching" Mechanism as Social Collateral

This is the critical innovation for cold-start:

```move
public struct Vouch has key, store {
    id: UID,
    voucher: address,      // established player
    vouchee: address,      // new player
    stake_amount: u64,     // SUI staked as collateral
    expires_at: u64,
}

public fun create_vouch(
    voucher_profile: &ReputationProfile,
    vouchee_address: address,
    stake: Balance<SUI>,
    ctx: &mut TxContext
) {
    // Voucher must have >500 reputation
    assert!(get_score(voucher_profile, b"CREDIT") > 500, ENotAuthorized);

    let vouch = Vouch {
        id: object::new(ctx),
        voucher: tx_context::sender(ctx),
        vouchee: vouchee_address,
        stake_amount: stake.value(),
        expires_at: tx_context::epoch(ctx) + 30,  // 30 epochs
    };

    // Stake is locked. If vouchee scams, voucher loses stake.
    transfer::public_transfer(vouch, vouchee_address);
}
```

**Why this works**: Established players have incentive to vouch for trustworthy rookies 
(because vouching earns them a small fee), but they risk losing stake if the rookie scams. 
This creates a **social filter** that doesn't require historical data.

---

## 3. TRIBE & SYNDICATE INTEGRATION

### Frontier's Organizational Structure

CCP's whitepaper defines Tribes and Syndicates as on-chain entities with:
- **Autonomy**: Self-governance via voting power [^47^]
- **Flexibility**: Third-party developers can extend their logic
- **Diversity**: Mandates range from trading to piracy to defense
- **Scalability**: Tribes (tens-hundreds) → Syndicates (hundreds-thousands of tribes) [^47^]

### How Reputation Plugs Into Tribe Governance

**Current State (CradleOS won hackathon for this)**:
- CradleOS provides governance, defense, logistics, economy management
- But it has no **trust layer** — how does a tribe know a new applicant isn't a spy?

**Reputation Integration Points**:

| Tribe Function | Reputation Input | Automated Action |
|---------------|-----------------|------------------|
| **Recruitment** | Credit score + combat history | Auto-approve >700 credit, flag <300 |
| **Resource Access** | Builder score | Higher score = access to better blueprints |
| **Fleet Roles** | Combat score + tribe tenure | High score = FC (fleet commander) privileges |
| **Diplomacy** | Syndicate standing score | Auto-NAP with syndicates >800 standing |
| **Treasury** | Governance participation score | Non-voters can't withdraw treasury funds |

### Syndicate-Level Reputation

Syndicates are alliances of tribes [^47^]. Reputation at this level enables:

```move
public struct SyndicateStanding has key, store {
    id: UID,
    syndicate_id: vector<u8>,
    tribe_id: vector<u8>,
    standing_score: i64,  // can be negative (war)
    treaty_type: u8,      // 0=war, 1=neutral, 2=NAP, 3=alliance
    last_updated: u64,
}
```

**Use Case**: A Smart Gate owned by Syndicate A automatically charges 10x toll to tribes 
from Syndicate B if standing is < -50 (war), but allows free passage if standing > 500 (alliance).

### Tribe Oracle: The Most Powerful Oracle

Tribe leaders can run their own oracle:
- **Attestation type**: "Member in good standing"
- **Issuance**: Tribe leader signs attestation for active members
- **Revocation**: Automatic if member is kicked
- **Weight**: Tribe oracle attestations count 2x generic oracles (because tribe leaders know their members)

This creates **recursive reputation**: a player's overall score is weighted by the reputation 
of the tribes that vouch for them. A member of a top-tier tribe gets a boost; a member of 
a known pirate tribe gets a penalty.

---

## 4. SMART ASSEMBLY INTEGRATION: END-TO-END EXAMPLE

### Scenario: Reputation-Gated Smart Gate

**Goal**: Build a gate that allows free passage to allies (standing >500), charges 2x toll 
to neutrals, and blocks enemies (pirate score >80).

**Current Implementation (Solidity/MUD)**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { CharactersTable } from "../codegen/index.sol";

interface IReputationOracle {
    function getScore(uint256 characterId, string memory scoreType) 
        external view returns (uint256);
}

contract ReputationGateSystem is System {
    address public reputationOracle;
    uint256 public myTribeId;
    uint256 public baseToll;

    constructor(address _oracle, uint256 _tribeId, uint256 _toll) {
        reputationOracle = _oracle;
        myTribeId = _tribeId;
        baseToll = _toll;
    }

    function canJump(
        uint256 characterId, 
        uint256 sourceGateId, 
        uint256 destinationGateId
    ) public view returns (bool) {
        // Get character's tribe
        uint256 characterTribeId = CharactersTable.getCorpId(characterId);

        // Tribe member? Always allow
        if (characterTribeId == myTribeId) return true;

        // Query reputation oracle
        uint256 pirateScore = IReputationOracle(reputationOracle)
            .getScore(characterId, "PIRATE_INDEX");
        uint256 standingScore = IReputationOracle(reputationOracle)
            .getScore(characterId, "TRIBE_STANDING");

        // Block known pirates
        if (pirateScore > 80) return false;

        // Allow if standing is good
        if (standingScore > 500) return true;

        // Neutral: allow but charge toll (handled by separate toll system)
        return true;
    }

    function calculateToll(uint256 characterId) public view returns (uint256) {
        uint256 standingScore = IReputationOracle(reputationOracle)
            .getScore(characterId, "TRIBE_STANDING");

        if (standingScore > 500) return 0;           // Ally: free
        if (standingScore > 0) return baseToll * 2;  // Neutral: 2x
        return baseToll * 10;                        // Enemy: 10x
    }
}
```

**Post-Migration (Move)**:

```move
module reputation_gate::gate {
    use sui::transfer;
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use reputation::protocol::{Self, ReputationRegistry, ReputationProfile};

    public struct SmartGate has key {
        id: UID,
        owner: address,
        tribe_id: vector<u8>,
        base_toll: u64,
        reputation_registry: address,
    }

    public struct GatePass has key, store {
        id: UID,
        character_id: address,
        expires_at: u64,
    }

    public fun can_jump(
        gate: &SmartGate,
        character_id: address,
        registry: &ReputationRegistry,
        tribe_registry: &TribeRegistry,
        payment: Balance<SUI>,
        ctx: &TxContext
    ): GatePass {
        let pirate_score = protocol::get_score(registry, character_id, b"PIRATE_INDEX");
        let standing_score = protocol::get_score(registry, character_id, b"TRIBE_STANDING");

        // Block pirates
        assert!(pirate_score <= 80, EBlocked);

        // Calculate toll
        let toll = if (standing_score > 500) {
            0
        } else if (standing_score > 0) {
            gate.base_toll * 2
        } else {
            gate.base_toll * 10
        };

        // Verify payment
        assert!(payment.value() >= toll, EInsufficientPayment);

        // Return change if overpaid
        if (payment.value() > toll) {
            let change = balance::split(&mut payment, payment.value() - toll);
            transfer::public_transfer(change, character_id);
        };

        // Send toll to gate owner
        transfer::public_transfer(payment, gate.owner);

        // Issue pass
        GatePass {
            id: object::new(ctx),
            character_id,
            expires_at: tx_context::epoch(ctx) + 1,
        }
    }
}
```

---

## 5. THE COMPLETE 12-WEEK BUILD PLAN (REVISED)

### Phase 0: Foundation (Weeks 1-3)

**Week 1: Schema Registry**
- Deploy SchemaRegistry shared object
- Implement schema registration (admin-gated)
- Write unit tests for schema CRUD

**Week 2: SBT Identity + Dynamic Fields**
- Deploy ReputationProfile contract
- Implement dynamic field pattern for scores [^83^]
- Add zkLogin compatibility for privacy-preserving proofs

**Week 3: Attestation Core**
- Deploy Attestation contract
- Implement issue/revoke flow
- Add OracleRegistry with staking requirements

### Phase 1: Oracle Network (Weeks 4-6)

**Week 4: EF-Map Partnership**
- Reach out to EF-Map team
- Define KILL_ATTESTATION_V1 schema
- Build oracle adapter (Postgres → Sui attestations)

**Week 5: Oracle Staking**
- Implement OraclePool with SUI staking
- Add delegator mechanics
- Build slash/challenge flow

**Week 6: Trade Oracle MVP**
- Index marketplace events from Frontier Periscope
- Build TRADE_ATTESTATION_V1 schema
- Deploy trade oracle on testnet

### Phase 2: Scoring Engine (Weeks 7-9)

**Week 7: Credit Score Algorithm**
- Weighted aggregation: 40% trade history, 30% contract fulfillment, 20% tribe standing, 10% account age
- Implement score decay (scores fade without continued activity)
- Build query API for Smart Assemblies

**Week 8: Pirate Index**
- Combat aggregation from EF-Map kill data
- K/D ratio weighting
- Friendly fire penalty

**Week 9: Governance Scores**
- Tribe participation tracking
- Voting history weighting
- Succession event logging (CradleOS integration)

### Phase 3: Integration (Weeks 10-12)

**Week 10: Solidity Bridge**
- Deploy ReputationOracle contract on Ethereum
- Build cross-chain message passing (Sui → Ethereum)
- Integrate with MUD Smart Gate example

**Week 11: Move Integration**
- Deploy reputation-gated Smart Gate on Sui testnet
- End-to-end test: attestation → score → gate access
- Performance optimization (PTB batching)

**Week 12: Launch Prep**
- Security audit (MoveBit or equivalent)
- Documentation for tribe developers
- Mainnet deployment checklist

---

## 6. SUCCESS METRICS & MILESTONES

| Milestone | Target Date | Metric |
|-----------|-------------|--------|
| Schema Registry live | Week 3 | 3+ schemas registered |
| EF-Map oracle live | Week 6 | 1,000+ combat attestations |
| First tribe integration | Week 8 | 1 tribe using reputation for recruitment |
| First lending contract | Week 10 | $1,000 SUI in undercollateralized loans |
| Mainnet launch | Week 12 | 5+ oracles, 3+ tribes, 100+ profiles |

---

## 7. WHY THIS BEATS THE ALTERNATIVES

| Approach | Problem | Our Solution |
|----------|---------|--------------|
| **Wait for CCP to build it** | CCP historically outsources tools (zKillboard, Pyfa were player-made) | Build the standard before CCP considers it |
| **Build a closed reputation app** | No network effects, tribes won't adopt | Open schema registry — anyone can issue/query |
| **Compete with EF-Map** | They have 4,390+ kills indexed; you have zero | Partner — they become your combat oracle |
| **Build on Ethereum only** | Sui migration is live; EVM is legacy | Dual-support: Solidity now, Move future |
| **Ignore cold-start** | Deadlock — no reputation = no adoption | Rookie badge + vouching mechanism breaks deadlock |

---

*This concludes the deep architectural analysis. The next step is a working prototype of the Schema Registry + SBT Identity on Sui testnet.*
