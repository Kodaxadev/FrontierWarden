# FrontierWarden

**Reputation & Vouching Protocol for EVE Frontier**

A Move-based smart contract suite enabling trust relationships, identity
verification, reputation tracking, fraud challenges, and reputation-gated
passage for the EVE Frontier ecosystem on Sui.

---

## Deployed Contract

| Item | Value |
|---|---|
| **Operational Network** | Sui Devnet |
| **Move Build Environment** | `testnet` |
| **Package ID** | `0x11a3f8dd19c2e55c29a3bb3faa2db5451e2c55fc0e83bcff86ed4726adb47e37` |
| **SchemaRegistry** | `0x5d3bebd993bb471764621bcc736be6799d5ce979f53134e9046f185508b301aa` |
| **OracleRegistry** | `0x0be66c40d272f7e69aa0fe2076938e86905167cf95300c7e0c3ab83a77f393ab` |
| **Deploy Cost** | ~$0.13 |
| **Deployed** | 2026-04-25 |

> Note: the active Sui client environment is `devnet`, but this package
> currently resolves Move framework dependencies with `--build-env testnet`.
> Plain `sui move test` is expected to fail until dependency resolution is
> normalized.

---

## Modules

| Module | Purpose |
|---|---|
| `schema_registry.move` | Schema registration, deprecation, governance transfer |
| `oracle_registry.move` | Oracle capabilities, schema authorization, staking/slashing |
| `profile.move` | Player reputation profile, score cache, decay |
| `attestation.move` | Issued credentials against registered schemas |
| `vouch.move` | Social collateral and voucher exposure |
| `lending.move` | Reputation-gated loans, repayment, default handling |
| `fraud_challenge.move` | Attestation dispute/challenge lifecycle |
| `reputation_gate.move` | Reputation-gated passage and toll logic |
| `singleton.move` | System-level accessors |
| `system_sdk.move` | Capability helpers and SDK-facing functions |

---

## Quick Start

### Prerequisites
- Sui CLI
- Move compiler
- Active Sui client environment set to devnet

### Configure Network
```bash
sui client switch --env devnet
sui client active-env
```

Expected:
```text
devnet
```

### Build
```bash
sui move build --build-env testnet
```

### Test
```bash
sui move test --build-env testnet
```

### Deploy
```bash
sui client publish --build-env testnet --gas-budget 200000000
```

---

## Security Model

See [SECURITY.md](./SECURITY.md) for trust assumptions, threat model, and key invariants.

---

## Docs

- [Devnet Operations Notes](./Documents/DEVNET_NOTES.md)
- [Executive Briefing](./DevDocs/eve_frontier_reputation_executive_briefing.md)
- [Architecture](./DevDocs/eve_frontier_indexer_architecture.md)
- [Schema Map](./DevDocs/eve_frontier_edge_out_efmap.md)
- [Cryptoeconomics](./DevDocs/eve_frontier_reputation_part2_cryptoeconomics.md)

---

## License

MIT
