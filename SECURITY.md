# EVE Frontier Reputation System — Security Model

> **Audience**: Auditors, security researchers, and integrators.  
> **Status**: Pre-mainnet draft. Do not deploy to mainnet without full audit.  
> **Version**: 0.0.1-draft

---

## 1. Architecture Overview

The system is composed of multiple Move modules grouped into trust zones:

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
- **Critical invariant**: Only authorized addresses can register or deprecate schemas.
- **Key risk**: Admin key compromise before governance transfer.

### 2.2 Oracle Registry
- **Critical invariant**: Only registered oracles with sufficient stake can issue attestations.
- **Schema scoping**: Capabilities only authorize the schemas listed at issuance.

### 2.3 Profile (ReputationProfile + ScoreCache)
- **Soulbound**: Players cannot transfer their profiles.
- **Oracle-only writes**: Score writes require valid OracleCapability matching sender.

### 2.4 Vouch
- **Stake-backed**: Voucher must have sufficient score to back a borrower.
- **Slash trigger**: Slashes are only triggered by defaulted loans.

### 2.5 Lending
- **Collateralized**: Loans require vouch coverage.
- **State machine**: Repaid and defaulted states are mutually exclusive.

---

## 3. Governance and Lifecycle

### API Boundary

`EFREP_API_KEY` is intended as a partner access gate and rate-limit aid for the
Rust API; it is not user authentication, wallet authentication, or per-tenant
authorization.

Browser operators authenticate through short-lived wallet-signed sessions:

1. `POST /auth/nonce` returns a one-use FrontierWarden session message.
2. The connected wallet signs that message with Sui personal-message signing.
3. `POST /auth/session` verifies the signature and returns a bearer token.

Ed25519 signatures are verified natively in Rust. EVE Vault is a zkLogin wallet,
so non-Ed25519 wallet-standard signatures are verified through Mysten's official
JavaScript verifier in `scripts/verify-personal-message.mjs`. Production
deployments should pin dependency versions, set `SUI_GRAPHQL_URL`, and monitor
verifier failures.

`api_request` logs should be treated as operational telemetry. Do not log API
keys, wallet signatures, request bodies, or full client IPs in long-term logs;
prefer short retention and aggregated counters for public deployments.

### Mainnet Readiness Requirements
1. **Full Smart Contract Audit**: MUST be completed before mainnet deployment.
2. **Governance Transfer**: Admin rights must be transferred to a multisig or DAO.
3. **Disclosure Process**: Security researchers should follow the disclosure policy below.

---

## 4. Security Disclosure Policy

We welcome reports from security researchers and the community. If you find a potential vulnerability:

1. **Do not disclose publicly** until it is resolved.
2. **Submit details** to `Justin.DavisWE@icloud.com`.
3. **Include**: A clear description, reproduction steps, and potential impact.

We aim to acknowledge reports within 48 hours and provide regular updates on the resolution.

---

## 5. Known Limitations

FrontierWarden is currently in pre-mainnet development. Known pre-mainnet limitations and unresolved exploit scenarios are tracked privately. Do not use for high-value transactions until a full audit is performed and governance is decentralized.

*Last updated: April 2026.*
