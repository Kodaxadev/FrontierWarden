# FrontierWarden Operational Proof Log

This document tracks verified on-chain transactions that prove the operational integrity of the FrontierWarden protocol and its integration with the EVE Vault.

## Latest Gate Proofs (Testnet)

These transactions demonstrate the end-to-end lifecycle of gate administration, from policy updates to toll collection.

| Flow | Transaction Digest | Checkpoint / Version | Description |
|---|---|---|---|
| **Admin Handover** | `EjhkVCtU5JfdNZL6gasvudNPzcExLAswCPXigij1HUYy` | `349181621` | `GateAdminCap` transferred to EVE Vault address (`0xabff...430f`). |
| **SEAL & COMMIT** | `G4fGxvgpdhbjy4yRu474S9S4vTYpYJqAVcEbSzhrTvsC` | `331437414` | Gate policy updated via EVE Vault; indexed in `gate_config_updates`. |
| **WITHDRAW TOLLS** | `CAJWpnWSrqGLqtQqvKQ1NQ829C1QJ6qzcEHGf8U5voud` | `331437435` | Collected SUI tolls withdrawn from `GatePolicy`; indexed in `toll_withdrawals`. |

## Verification Details

- **Indexer Sync**: All transactions listed above have been successfully processed by the Rust indexer and are visible in the Supabase `gate_config_updates` and `toll_withdrawals` tables.
- **Source of Truth**: Object IDs and current configuration state are tracked in [scripts/testnet-addresses.json](./scripts/testnet-addresses.json).
- **Network**: Sui Testnet (`4c78adac`).

---
*Last Updated: 2026-04-29*
