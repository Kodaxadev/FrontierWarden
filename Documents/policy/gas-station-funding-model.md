# FrontierWarden — Gas Station Funding Model

**Rule:** The gas station is not a free faucet. It is operator infrastructure.
Gas sponsorship must be funded, scoped, and recoverable in production.

---

## Current state (testnet)

The gas station sponsors transactions from a server-controlled wallet funded
via the Sui testnet faucet. This works for development. It is not a production
model. The testnet faucet is not guaranteed, unlimited, or permanent.

Current sponsored flows:
- `check_passage` (traveler gate evaluation + toll payment)
- `authorize_extension` (operator PTB — borrow/authorize/return OwnerCap<Gate>)
- `create_gate` (GatePolicy + GateAdminCap provisioning)
- `bind_world_gate` (rebind GatePolicy to world gate)

---

## Production funding options

These are ordered from safest to most complex. Choose based on operator scale.

### Option A — Operator-funded sponsorship (recommended for Phase 1 production)

Each operator pre-funds a gas station wallet specific to their GatePolicy domain.
The FrontierWarden gas station routes sponsorship requests to the correct operator
wallet based on the `gate_policy_id` in the request.

```
Operator deposits SUI → gas_station_wallet[gate_policy_id]
Gas station sponsors transactions from that wallet only
Operator monitors balance via dashboard
Low balance → operator tops up
```

Properties:
- Platform bears zero gas cost
- Operator has full cost visibility
- Simple: one wallet per policy domain
- Requires operator onboarding step (initial SUI deposit)

### Option B — Cost-recovery per transaction

Gas station sponsors the transaction, then recovers cost from the toll collected
during `check_passage`. The toll must exceed the gas cost of the sponsored tx.

```
Traveler pays toll → toll forwarded to treasury
Gas cost deducted from treasury → gas station reimbursed
Net: operator earns (toll - gas cost)
```

Properties:
- Works for high-volume gates with tolls
- Requires toll ≥ gas cost guarantee (configurable minimum toll)
- Breaks down for ALLOW_FREE passages (no toll to recover from)
- More complex: requires treasury → gas station settlement path

### Option C — Per-transaction user funding

Traveler pays their own gas. No sponsorship.

```
Traveler wallet → gas for check_passage
No gas station involvement
```

Properties:
- Zero platform/operator cost
- Requires traveler to hold SUI
- Removes sponsored UX — not suitable for onboarding flows
- Appropriate for high-trust, high-volume, known-wallet flows

### Option D — Subscription / pre-paid credits

Operators buy gas credits from the platform. Platform maintains a shared pool.
Credits consumed per sponsored transaction.

```
Operator pays platform (off-chain or on-chain) → credit balance
Gas station draws from shared pool weighted by operator credit balance
Unused credits roll over or expire
```

Properties:
- Works at scale, amortizes gas volatility
- More complex billing model
- Requires credit accounting system
- Not appropriate until operator count justifies the overhead

---

## Current production risk

The gas station currently uses a single shared wallet (`gas_station_wallet`)
with no per-operator accounting. In production this means:

1. One operator's traffic can exhaust gas for all others
2. No operator has visibility into their gas consumption
3. Platform absorbs all gas cost
4. No recovery mechanism if the sponsoring wallet runs dry

This is acceptable for testnet development. It must not be carried into production
without at minimum an operator-funded model (Option A) or cost-recovery model (Option B).

---

## Minimum production gate

Before opening FrontierWarden to external operators in production:

- [ ] Gas station wallet per GatePolicy domain (Option A)
   OR cost-recovery settlement from toll treasury (Option B)
- [ ] Low-balance alert: warn operator at configurable threshold
- [ ] Gas station `/sponsor-transaction` endpoint remains public (no auth required on that route)
   but must validate `gate_policy_id` is in the funded set before sponsoring
- [ ] Hard daily cap per `gate_policy_id` to prevent runaway spending
- [ ] Gas station runbook: how to top up, monitor, and respond to exhaustion

---

## What does NOT change

- The `/sponsor-transaction` endpoint itself must remain unauthenticated
  (traveler wallets call it; they cannot be expected to hold API keys)
- The gas station must not know or store traveler wallet keys
- The gas station must not require the traveler to pre-register

---

## Sui gas economics

On Sui, gas is measured in MIST (1 SUI = 10^9 MIST).
A sponsored PTB for `check_passage` currently costs approximately 3–8M MIST
(0.003–0.008 SUI) at current testnet gas prices.
Production gas prices may differ. Do not hardcode gas budget assumptions.
Use `dryRunTransactionBlock` to estimate gas before signing in production.
