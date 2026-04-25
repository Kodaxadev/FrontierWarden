# FrontierWarden

**Reputation & Vouching Protocol for EVE Frontier**

A Move-based smart contract suite enabling trust relationships, identity verification, and reputation tracking for the EVE Frontier ecosystem on Sui.

---

## Deployed Contract

| Item | Value |
|---|---|
| **Network** | Sui Testnet |
| **Package ID** | `0x11a3f8dd19c2e55c29a3bb3faa2db5451e2c55fc0e83bcff86ed4726adb47e37` |
| **SchemaRegistry** | `0x5d3bebd993bb471764621bcc736be6799d5ce979f53134e9046f185508b301aa` |
| **OracleRegistry** | `0x0be66c40d272f7e69aa0fe2076938e86905167cf95300c7e0c3ab83a77f393ab` |
| **Deploy Cost** | ~$0.13 |
| **Deployed** | 2026-04-25 |

---

## Modules

| Module | Purpose |
|---|---|
| `attestation` | Cross-chain identity verification |
| `lending` | Loan-default → vouch-slash integration |
| `oracle_registry` | Off-chain oracle registration |
| `profile` | User reputation profiles |
| `schema_registry` | EVE schema definitions |
| `singleton` | Global configuration |
| `system_sdk` | Protocol-level utilities |
| `vouch` | Voucher stakes, registration, slashing |

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