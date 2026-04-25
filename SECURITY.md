# EVE Frontier Reputation System — Security Model

> **Audience**: Auditors, security researchers, and integrators.  
> **Status**: Pre-mainnet draft. Do not deploy to mainnet without full audit.  
> **Version**: 0.0.1-draft

---

## 1. Architecture Overview

The system has 7 modules across 4 trust zones:

```
┌─────────────────────────────────────────────────────────┐
│  Zone A: Schema Registry (shared object)               │
│  Admin or DAO-gated schema registration + deprecation  │
├─────────────────────────────────────────────────────────┤
│  Zone B: Oracle Registry (shared object)                │
│  Oracle registration, stake, council voting             │
├───────────────────────────┬─────────────────────────────┤
│  Zone C: Profile          │  Zone C: Vouch              │
│  Per-player SBT +         │  Voucher stakes for         │
│  score cache (owned)      │  borrower loans (owned)      │
├───────────────────────────┼─────────────────────────────┤
│  Zone D: Attestation      │  Zone D: Lending             │
│  Oracle-issued player     │  Vouch-backed loans          │
│  attestations (owned)     │  (shared)                    │
├───────────────────────────┴─────────────────────────────┤
│  Zone E: System SDK (in-game contracts only)             │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Trust Model by Module

### 2.1 Schema Registry

| Property | Description |
|----------|-------------|
| **Object type** | Shared object (`transfer::share_object`) |
| **Admin** | Deployer address until governance transfer |
| **Post-governance** | Multisig or DAO contract |
| **Critical invariant** | Only authorized addresses can register or deprecate schemas |

**Authorization chain:**
```
is_authorized(registry, sender)
  ├── admin == sender  (bootstrap)
  └── governance == sender  (post-transfer)
```

**Key risks:**
- Admin key compromise → arbitrary schema injection
- Mitigation: Transfer to governance before mainnet
- Schema deprecation is irreversible (one-way link)

**Event log for detection:**
- `SchemaRegistered` — new schema added
- `SchemaDeprecated` — schema superseded
- `GovernanceTransferred` — admin removed

---

### 2.2 Oracle Registry

| Property | Description |
|----------|-------------|
| **Object type** | Shared object |
| **Authorization** | Caller must be registered oracle |
| **Stake requirement** | 1 SUI (system oracles: 0.1 SUI) |
| **Slashing** | Council vote required; epoch rewards only |

**Critical invariants:**

1. **Oracle identity**: Only addresses in `oracles` table can issue attestations
2. **Capability binding**: `OracleCapability` struct field `oracle_address` must match caller
3. **Schema scoping**: Capability only authorizes the schemas listed at issuance
4. **Capability rotation**: When schema list changes, old capability is destroyed, new one issued

**Authorization chain for score writes:**
```
profile::update_score(cap, profile, schema_id, ...)
  ├── cap.oracle_address == sender  ← oracle identity check
  └── vector::contains(cap.authorized_schemas, schema_id)  ← schema scope check
```

**Council voting:**
- Fraud challenge resolution requires `>2/3 council_size` votes
- Double voting prevented by `VecSet<address>` (stored in `FraudChallenge`)
- Resolved challenges can be deleted (`balance::destroy_zero` ensures empty stake)

**Event log for detection:**
- `OracleRegistered` — new oracle (watch for suspicious names)
- `FraudChallengeCreated` — challenge opened
- `FraudChallengeResolved` — verdict rendered

---

### 2.3 Profile (ReputationProfile + ScoreCache)

| Property | Description |
|----------|-------------|
| **Object type** | Owned object (`transfer::transfer`) |
| **Transferability** | None — `key` only, no `store` |
| **SBT property** | Player cannot transfer their profile |
| **Score storage** | Dynamic fields on profile UID |

**Critical invariants:**

1. **One profile per player**: No constraint in code — relies on player discipline. Duplicate profiles can be created but each is independently owned.
2. **Oracle-only writes**: Score writes require valid `OracleCapability` matching sender
3. **Decay is voluntary**: Oracle must actively call `apply_decay`; inactive scores persist
4. **No self-write**: Oracle cannot write to its own profile (capability address ≠ profile owner)

**Capability lifecycle:**
```
register_oracle → issue_oracle_capability → transfer to oracle
add_schema_to_oracle → destroy_oracle_capability + issue_oracle_capability(new_schemas)
```

**Event log for detection:**
- `ProfileCreated` — new player entry
- `ScoreUpdated` — score write (includes old_value for diff detection)

---

### 2.4 Vouch

| Property | Description |
|----------|-------------|
| **Object type** | Owned, transferred to vouchee |
| **Voucher qualification** | `CREDIT` score >= 500 via OracleCapability |
| **Stake** | SUI locked in vouch until expiry or slash |
| **Slash trigger** | Only `lending::slash_defaulted_vouch` calls `slash_for_default` |

**Critical invariants:**

1. **Voucher qualification**: Score must be ≥ 500 at vouch creation time (snapshot, not live)
2. **Stake destination on slash**: `slash_for_default` returns `Balance<SUI>` — caller (`lending`) sends to `loan.lender`, NOT to caller
3. **Stake destination on redeem**: `redeem_expired` sends to `voucher.voucher` (captured before destructure), not to transaction sender
4. **Single slash**: `vouch.active = false` is set atomically with balance drain; cannot be called twice

**Event log for detection:**
- `VouchCreated` — stake locked
- `VouchRedeemed` — stake returned (after expiry)
- No `VouchSlashed` event — watch for `LoanDefaulted` in `lending` module

---

### 2.5 Lending

| Property | Description |
|----------|-------------|
| **Object type** | Shared object (`public_share_object`) |
| **Access gate** | `LendingCapability` — minted to deployer at init |
| **Loan state machine** | `repaid` and `defaulted` are mutually exclusive flags |

**Critical invariants:**

1. **Self-loan prevention**: `borrower != lender` asserted in `issue_loan`
2. **Vouch coverage**: `verify_vouch_coverage` checks active + correct vouchee + stake >= 20% of loan
3. **Repay guard**: `!loan.defaulted` must be true
4. **Slash guard**: `!loan.repaid && epoch > due_epoch && !loan.defaulted`
5. **Default flag**: Set atomically before vouch slash — prevents double-slash or post-default repay

**LendingCapability scope:**
- Only one exists, minted at `init` to deployer
- Enters the system via `_cap: &LendingCapability` param in `slash_defaulted_vouch`
- Is NOT transferred — stays with deployer/admin

**Event log for detection:**
- `LoanIssued` — loan created
- `LoanRepaid` — successful repayment
- `LoanDefaulted` — vouch slashed (amount shown)

---

### 2.6 System SDK

| Property | Description |
|----------|-------------|
| **Purpose** | In-game contract integration (CradleOS, Blood Contract, Bazaar) |
| **Capability type** | `SystemCapability` (distinct from `OracleCapability`) |
| **Staking** | 0.1x normal stake (10% of MIN_STAKE) |

**Critical invariant:**
```
system_attest → checks profile::get_system_address(cap) == sender
              → calls profile::update_score_system
```

**Threat model:**
- Misbehaving in-game contract can write arbitrary scores to player profiles
- Mitigation: SystemCapability is issued only at oracle registration; governance controls registration
- Trust assumption: In-game contracts are either CCP-operated or DAO-governed

---

## 3. Attack Surface Analysis

### 3.1 Oracle Fraud

| Attack | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Oracle writes inflated scores | Medium | Credit markets polluted | Fraud challenge + council slash |
| Oracle writes zero scores (malicious) | Medium | Player locked out of loans | Appeals process via council |
| Oracle issues to non-registered schema | Low | Schema registry prevents | Schema check in `issue()` |
| Double-vote by council member | N/A | Prevents by VecSet | `vec_set::contains` before insert |

**Fraud challenge lifecycle:**
```
create_fraud_challenge (challenger stakes 0.5 SUI)
    → council votes (deadline: 7 epochs)
    → resolve_challenge (>2/3 quorum)
        → guilty: oracle slashed 10%, challenger rewarded 50%
        → innocent: challenger penalized 50% of stake
    → delete_resolved_challenge (cleanup)
```

### 3.2 Profile Manipulation

| Attack | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Player creates multiple profiles | Medium | Reputation fragmentation | Ecosystem norm — social pressure |
| Voucher writes fake high score to self | N/A | Impossible | OracleCapability required, oracle address ≠ profile owner |
| Low-score player vouching for high-risk borrower | Medium | Undercollateralized loans | Voucher score check (>= 500) at creation time |

### 3.3 Lending Attacks

| Attack | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Borrower takes loan without intent to repay | Medium | Vouch stake slashed, lender compensated | `defaulted` flag prevents double-claim |
| Self-loan to burn vouch stake | N/A | Prevented | `borrower != lender` check |
| Lender issues loan to self via borrower profile | N/A | Prevented | Same check |

---

## 4. Upgrade & Governance Path

### Bootstrap Phase (testnet → early mainnet)
```
Deployer = admin of SchemaRegistry + OracleRegistry
Deployer holds LendingCapability
```

### Transition to DAO
```move
schema_registry::transfer_to_governance(governance_dao_address)
// Admin becomes None — irreversible

oracle_registry::add_council_member(...)  // 9 seats
```

### Schema Evolution
- Register new schema → deprecate old → ecosystem migrates
- Old attestations remain valid until their own `expiration_epochs`
- No forced revocation of in-flight attestations

---

## 5. Key Constants (Audit Checklist)

| Constant | Value | Module | Rationale |
|----------|-------|--------|-----------|
| `MIN_STAKE` | 1_000_000_000 MIST (1 SUI) | oracle_registry | Skin in the game |
| `MIN_VOUCHER_SCORE` | 500 | vouch | Established player threshold |
| `MIN_CREDIT_FOR_LOAN` | 300 | lending | Minimum viability |
| `MIN_COLLATERAL_PCT` | 20% | lending | 5x leverage max |
| `MAX_LOAN_MULTIPLIER` | 5x | lending | Prevent unbounded loans |
| `VOUCH_DURATION_EPOCHS` | 30 | vouch | ~30 days |
| `LOAN_DURATION_EPOCHS` | 30 | lending | Synced to vouch |
| `CHALLENGE_WINDOW_EPOCHS` | 7 | oracle_registry | Time to gather votes |
| `SLASH_PERCENTAGE` | 10% | oracle_registry | Epoch rewards only, not principal |
| `CHALLENGER_REWARD_PERCENTAGE` | 50% | oracle_registry | Incentivize fraud detection |

---

## 6. Open Items Before Mainnet

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Full smart contract audit | Critical | Pending |
| 2 | Governance transfer (remove deployer admin) | Critical | Pending — MUST be done before mainnet |
| 3 | TEE verification integration (oracle attestation hash) | High | Design only — not implemented |
| 4 | Slashing oracle key compromise scenario | High | Design only |
| 5 | Emergency schema freeze mechanism | Medium | Not implemented |
| 6 | On-chain revocation for compromised capabilities | Medium | Only via deprecation + re-registration |

---

## 7. Event Index

All state transitions are logged via `event::emit`. Monitor these for security:

| Event | Module | Trigger |
|-------|--------|---------|
| `SchemaRegistered` | schema_registry | New schema added |
| `SchemaDeprecated` | schema_registry | Schema superseded |
| `GovernanceTransferred` | schema_registry | Admin removed |
| `OracleRegistered` | oracle_registry | Oracle joined |
| `FraudChallengeCreated` | oracle_registry | Challenge opened |
| `FraudChallengeResolved` | oracle_registry | Challenge decided |
| `ProfileCreated` | profile | New player profile |
| `ScoreUpdated` | profile | Any score write (includes old_value) |
| `VouchCreated` | vouch | Vouch stake locked |
| `VouchRedeemed` | vouch | Stake returned after expiry |
| `LoanIssued` | lending | Loan created |
| `LoanRepaid` | lending | Successful repayment |
| `LoanDefaulted` | lending | Vouch slashed |
| `AttestationIssued` | attestation | New attestation |
| `AttestationRevoked` | attestation | Attestation revoked |
| `SingletonAttestationIssued` | singleton | Item attestation |
| `SystemAttestationEvent` | system_sdk | In-game contract write |

---

*Last updated: April 2026. This document will be updated after audit completion.*