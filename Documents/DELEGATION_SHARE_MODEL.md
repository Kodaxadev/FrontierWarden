# Delegation Share Model Specification

**Status:** Draft — Sprint 2
**Author:** FrontierWarden team
**Last updated:** 2026-04-29

## 1. Overview

The delegation share model replaces the current flat `Delegation` object in
`oracle_registry.move` with a proportional-share system modelled after
Sui's `staking_pool.move`. This enables fair value accrual for delegators
regardless of when they deposit or withdraw, and provides the foundation
for oracle reward distribution in Sprint 3.

## 2. Problem Statement

The current `Delegation` struct stores a raw `amount: u64`:

```move
public struct Delegation has key, store {
    id: UID,
    oracle: address,
    delegator: address,
    amount: u64,
    staked_at: u64,
}
```

This is a simple IOU — it records how many MIST the delegator deposited but
does not track how the underlying stake changes over time. When an oracle is
slashed, early delegators and late delegators are treated identically despite
having different risk exposure durations. Similarly, when oracle rewards are
distributed (Sprint 3), there is no proportional claim mechanism.

## 3. Design

### 3.1 Share-Based Accounting

Each oracle maintains a `total_shares: u64` counter that tracks the cumulative
shares outstanding. When a delegator deposits, they receive shares proportional
to their contribution relative to the oracle's current stake balance:

```
shares = (amount * total_shares) / balance_before   // subsequent deposits
shares = amount                                      // first deposit
```

This ensures that:
- The first depositor gets 1 share per 1 MIST
- Later depositors get proportionally fewer shares if the stake has grown
- All shares represent equal claims on the oracle's current stake balance

### 3.2 Rounding

Division truncates toward zero, matching Sui's `staking_pool.move` convention.
The rounding loss falls on the depositor (dust remains in the pool), which is
the standard approach and prevents inflation of total shares.

### 3.3 Withdrawal

When a delegator redeems their position:

```
withdraw_amount = (balance::value(&oracle.staked_sui) * position.shares) / oracle.total_shares
```

The delegator receives their proportional share of the *current* stake balance,
which includes any appreciation from rewards or depreciation from slashing.

## 4. Structural Changes

### 4.1 Replace `Delegation` with `DelegatorPosition`

```move
public struct DelegatorPosition has key, store {
    id: UID,
    oracle_id: address,
    delegator: address,
    shares: u64,          // proportional claim on oracle.staked_sui
    staked_at: u64,
}
```

### 4.2 Add `total_shares` to `OracleInfo`

```move
// Inside OracleInfo struct:
total_shares: u64,        // cumulative shares outstanding (starts at 0)
```

## 5. Updated `delegate()` Logic

```move
public fun delegate(
    registry: &mut OracleRegistry,
    oracle_address: address,
    stake: Balance<SUI>,
    ctx: &mut TxContext
) {
    assert!(table::contains(&registry.oracles, oracle_address), EOracleNotFound);

    let amount = balance::value(&stake);
    let oracle = table::borrow_mut(&mut registry.oracles, oracle_address);

    let balance_before = balance::value(&oracle.staked_sui);
    balance::join(&mut oracle.staked_sui, stake);
    oracle.total_stake = oracle.total_stake + amount;

    let shares = if (oracle.total_shares == 0) {
        amount                                   // first deposit: 1 share per MIST
    } else {
        (amount * oracle.total_shares) / balance_before
    };

    oracle.total_shares = oracle.total_shares + shares;

    transfer::transfer(
        DelegatorPosition {
            id: object::new(ctx),
            oracle_id: oracle_address,
            delegator: tx_context::sender(ctx),
            shares,
            staked_at: tx_context::epoch(ctx),
        },
        tx_context::sender(ctx)
    );
}
```

## 6. New `undelegate()` Entry Function

```move
public entry fun undelegate(
    registry: &mut OracleRegistry,
    position: DelegatorPosition,
    ctx: &mut TxContext
) {
    assert!(position.delegator == tx_context::sender(ctx), ENotAuthorized);
    assert!(table::contains(&registry.oracles, position.oracle_id), EOracleNotFound);

    let oracle = table::borrow_mut(&mut registry.oracles, position.oracle_id);

    // Safe from divide-by-zero: total_shares >= position.shares > 0
    let withdraw_amount =
        (balance::value(&oracle.staked_sui) * position.shares) / oracle.total_shares;

    oracle.total_shares = oracle.total_shares - position.shares;
    oracle.total_stake  = oracle.total_stake - withdraw_amount;

    let payout = balance::split(&mut oracle.staked_sui, withdraw_amount);

    let DelegatorPosition { id, oracle_id: _, delegator: _, shares: _, staked_at: _ }
        = position;
    object::delete(id);

    transfer::public_transfer(coin::from_balance(payout, ctx), tx_context::sender(ctx));
}
```

## 7. Migration Path

### 7.1 Module Upgrade Strategy

Because this changes the `Delegation` struct shape (field rename + new field)
and adds a field to `OracleInfo`, a **compatible module upgrade** is required.
Sui's Move VM supports adding fields to existing structs, but replacing a
struct type entirely requires a different approach.

**Option A (preferred):** Add `total_shares` to `OracleInfo` as a new field,
and add `shares: u64` to `Delegation`. Rename semantics are handled at the
application layer. Existing `Delegation` objects remain valid; their `amount`
field is treated as their `shares` value during the transition.

**Option B:** Burn all existing `Delegation` objects and reissue them as
`DelegatorPosition` objects in a single migration transaction. This is cleaner
but requires all delegators to cooperate.

### 7.2 Transition Logic

For Option A, the `undelegate()` function checks whether a position is a
legacy `Delegation` (has `amount` field) or new `DelegatorPosition` (has
`shares` field) and handles each accordingly.

## 8. Interaction with Slash Events

When an oracle is slashed via `slash_oracle_stake()`:

1. The `oracle.staked_sui` balance decreases
2. `oracle.total_stake` is updated to reflect the new balance
3. `oracle.total_shares` remains **unchanged** — the share count does not
   change, only the per-share value decreases

This means delegators automatically absorb slashing losses proportionally
through the reduced value of their shares. No per-delegator state mutation
is needed.

## 9. Interaction with Reward Distribution (Sprint 3)

Reward distribution uses the same `total_shares` field:

```
reward_per_share = total_reward / oracle.total_shares
delegator_reward = reward_per_share * position.shares
```

Rewards increase `oracle.staked_sui` without changing `total_shares`,
so the per-share value appreciates — identical to the slashing mechanism
in reverse.

## 10. Security Considerations

### 10.1 First-Depositor Advantage

The first depositor sets the initial share price at 1:1. If they deposit a
tiny amount before a large oracle self-stake, they capture disproportionate
share of future rewards. Mitigation: oracle operators should self-stake
before accepting delegations, or the protocol should enforce a minimum
initial stake.

### 10.2 Rounding Dust

Truncated division leaves dust in the pool. Over many deposit/withdraw cycles
this dust accumulates but always benefits remaining share holders. This is
acceptable and matches the Sui staking pool behavior.

### 10.3 Share Inflation Attack

A malicious actor could try to manipulate the share price by depositing and
immediately withdrawing. The rounding loss makes this economically
unprofitable for small amounts. For large amounts, the attacker captures
no net value because they receive their proportional share of the same
pool they contributed to.

## 11. Indexer Impact

The indexer must track:

- `DelegatorPosition` creation events (new object type)
- `DelegatorPosition` destruction events (on undelegate)
- `oracle.total_shares` field changes (on each delegate/undelegate)

The existing `fraud_challenges` table already references `oracle` addresses,
so slashed oracle impact on delegators can be computed via the share model
without additional schema changes.
