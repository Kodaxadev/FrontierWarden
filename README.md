# FrontierWarden

**Reputation & Vouching Protocol for EVE Frontier**

A Move-based smart contract suite enabling trust relationships, identity verification, and reputation tracking for the EVE Frontier ecosystem on Sui.

---

## Overview

FrontierWarden implements a decentralized vouching and reputation system where:
- **Vouchers** stake SUI to endorse other users
- **Oracles** provide external identity verification
- **Reputation scores** evolve based on vouching activity
- **Slashing** occurs on misbehavior (no epoch dependencies)

---

## Architecture

| Module | Purpose |
|---|---|
| `reputation` | Core scoring, slashing, epoch-free |
| `vouch` | Voucher registration, stakes, slashing |
| `lending` | Loan-default→vouch-slash integration |
| `schema_registry` | EVE schema definitions |
| `oracle_registry` | Off-chain oracle registration |
| `oracle_profile` | Oracle identity & profile management |
| `tests` | 24 Move unit tests (all passing) |

---

## Quick Start

### Prerequisites
- Sui CLI (`cargo install --locked sui`)
- Move compiler

### Build
```bash
sui move build
```

### Test
```bash
sui move test
```

### Deploy
```bash
./scripts/deploy.sh
```

---

## Security Model

See [SECURITY.md](./SECURITY.md) for trust assumptions, threat model, and key invariants.

---

## Docs

- [Executive Briefing](./DevDocs/eve_frontier_reputation_executive_briefing.md)
- [Architecture](./DevDocs/eve_frontier_indexer_architecture.md)
- [Schema Map](./DevDocs/eve_frontier_edge_out_efmap.md)
- [Cryptoeconomics](./DevDocs/eve_frontier_reputation_part2_cryptoeconomics.md)

---

## License

MIT