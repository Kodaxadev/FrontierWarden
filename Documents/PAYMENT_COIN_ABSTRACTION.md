# Payment Coin Abstraction Specification

**Status:** Draft — Sprint 2
**Author:** FrontierWarden team
**Last updated:** 2026-04-29

## 1. Overview

The payment coin abstraction generalizes the toll payment mechanism in
`reputation_gate.move` from SUI-only to support any Sui Coin type. This
enables gate operators to accept alternative tokens (e.g., stablecoins,
game tokens) as toll payment, and provides a foundation for multi-asset
treasury management.

## 2. Problem Statement

The current `check_passage` function in `reputation_gate.move` accepts only
`Coin<SUI>`:

```move
public fun check_passage(
    gate:        &mut GatePolicy,
    attestation: &Attestation,
    payment:     Coin<SUI>,
    ctx:         &mut TxContext,
)
```

The `GatePolicy` treasury also stores `Balance<SUI>`. This ties the gate
economy to SUI exclusively, which limits integration flexibility for EVE
Frontier deployments that may have their own token economies.

## 3. Design

### 3.1 Type Parameterization

Parameterize `GatePolicy` and `check_passage` with a generic Coin type `T`:

```move
public struct GatePolicy<phantom T> has key, store {
    id:             UID,
    owner:          address,
    schema_id:      vector<u8>,
    ally_threshold: u64,
    base_toll_mist: u64,
    treasury:       Balance<T>,
    paused:         bool,
}
```

The `phantom` keyword allows `GatePolicy` to be instantiated with any coin
type, including non-SUI types, without requiring `T` to appear in a non-phantom
field position (Balance<T> satisfies this since Balance is defined in the
`sui::balance` module).

### 3.2 Toll Denomination

The `base_toll_mist` field name is misleading when non-SUI coins are used.
Rename to `base_toll`:

```move
base_toll: u64,     // minimum toll per passage (in smallest coin unit)
```

For SUI gates, this remains MIST-denominated. For USDC gates, this would be
in the coin's base unit (e.g., 1/1,000,000 of a USDC). For custom game
tokens, the gate operator defines the unit.

### 3.3 Updated `check_passage` Signature

```move
public fun check_passage<T>(
    gate:        &mut GatePolicy<T>,
    attestation: &Attestation,
    payment:     Coin<T>,
    ctx:         &mut TxContext,
) {
    // ... same logic, generic over T
}
```

All balance operations (`coin::split`, `coin::into_balance`, `balance::join`,
`balance::split`, `coin::from_balance`, `coin::value`) are generic over the
coin type and require no changes.

## 4. Migration Path

### 4.1 Current State

Existing deployed `GatePolicy` objects are `GatePolicy` (non-generic, implicitly
`GatePolicy<SUI>`). Sui's module upgrade system handles adding type parameters
to existing structs.

### 4.2 Upgrade Strategy

1. Add `phantom T` type parameter to `GatePolicy`
2. Rename `base_toll_mist` to `base_toll`
3. Update all function signatures to include the `<T>` parameter
4. Deploy as a compatible module upgrade

Existing `GatePolicy<SUI>` objects continue to work without migration because
SUI is the default instantiation.

## 5. Treasury Withdrawal

The `withdraw_treasury` function must also be parameterized:

```move
public fun withdraw_treasury<T>(
    cap:  &GateAdminCap,
    gate: &mut GatePolicy<T>,
    amount: u64,
    ctx:  &mut TxContext,
): Coin<T> {
    assert_admin(cap, gate);
    let payout = coin::from_balance(balance::split(&mut gate.treasury, amount), ctx);
    payout
}
```

This returns a `Coin<T>` instead of `Coin<SUI>`, matching the gate's coin type.

## 6. Multi-Coin Gate Support

### 6.1 Single-Coin-Per-Gate Model (v1)

Each `GatePolicy` instance accepts exactly one coin type. A gate operator who
wants to accept both SUI and USDC must deploy two separate gate policies with
the same `schema_id` and `ally_threshold` but different coin types.

This keeps the on-chain logic simple and avoids exchange rate complexity.

### 6.2 Multi-Coin Gateway (Future)

A higher-level `GateGateway` shared object could route payments across
multiple `GatePolicy<T>` instances with configured exchange rates:

```move
public struct GateGateway has key, store {
    id:              UID,
    gate_policies:   Table<TypeTag, address>,   // coin type -> GatePolicy address
    rate_oracle:     Option<address>,
    // ...
}
```

This is out of scope for Sprint 2 but the single-coin-per-gate model composes
well with this future pattern.

## 7. Indexer Impact

### 7.1 Gate Policy Table

The `gate_config_updates` table stores `base_toll_mist` as `BIGINT`. This
remains compatible — the column stores the toll value regardless of coin
type. A new column `coin_type: VARCHAR` could be added to track which coin
type each gate accepts:

```sql
ALTER TABLE gate_config_updates
ADD COLUMN coin_type VARCHAR(255) DEFAULT '0x2::sui::SUI';
```

### 7.2 Trust API

The Trust API's `counterparty_risk` evaluation uses `minimum_score` thresholds
and does not depend on coin type. The `gate_access` action reads
`base_toll_mist` from the gate config — this value is coin-type-agnostic
from the indexer's perspective.

## 8. Security Considerations

### 8.1 Coin Type Verification

Sui's type system ensures that `Coin<T>` and `Balance<T>` are tied to the
same type `T` at compile time. A caller cannot pass a `Coin<USDC>` to a
`GatePolicy<SUI>` — the Move VM will reject the transaction before execution.

### 8.2 Dust Payments

Non-SUI coins may have different minimum units. A gate operator should set
`base_toll` to a value that is meaningful in the chosen coin's denomination.
For high-precision tokens (many decimal places), the toll value should be
scaled accordingly.

### 8.3 Treasury Concentration

A gate's treasury accumulates the coin type it accepts. If a gate accepts a
volatile token, the treasury value fluctuates. Gate operators should be aware
that treasury withdrawals return the same coin type that was deposited.

## 9. Error Codes

No new error codes are needed. The existing `EInsufficientPayment` check
works identically for all coin types since `coin::value<T>()` returns the
amount in the coin's native unit.

## 10. Implementation Checklist

- [ ] Add `phantom T` to `GatePolicy` struct
- [ ] Rename `base_toll_mist` to `base_toll`
- [ ] Update `create_gate`, `check_passage`, `update_thresholds`,
      `withdraw_treasury`, `collect_treasury` signatures with `<T>`
- [ ] Update all internal `coin::` and `balance::` calls to use `<T>`
- [ ] Add `coin_type` column to indexer schema (optional)
- [ ] Update indexer event processors for type-parameterized gate events
- [ ] Test with SUI, USDC, and custom token types
