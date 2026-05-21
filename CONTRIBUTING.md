# Contributing to FrontierWarden

FrontierWarden is a tribal intelligence and trust infrastructure protocol for EVE Frontier, built on the Sui blockchain. Contributions are welcome from protocol engineers, tool builders, EVE Frontier operators, and community members who understand the trust model.

Before contributing, understand what FrontierWarden is and is not:

- It is **not** a generic killboard or social score.
- It is a **trust decision backend** — the integrity of attestations, schemas, and gate policy is the product.
- Contributions that compromise the explainability, tenant authority, or proof-bundle integrity of trust decisions will not be accepted.

## Ways to Contribute

### Bug Reports
Use the Bug Report issue template. Include:
- Which layer is affected (protocol/Move, indexer/Rust, API, frontend, SDK)
- Reproduction steps with specific data (schema IDs, transaction digests, endpoint payloads)
- Expected vs actual behavior
- Live testnet context if relevant (Stillness binding state, gate ID, etc.)

### Feature Requests
Use the Feature Request issue template. Frame requests around:
- The trust decision or tenant policy use case being served
- Which layer(s) of the architecture the change touches
- Whether the feature requires an ADR (Architecture Decision Record)

### Integration Support
If you're building an EVE Frontier tool on top of FrontierWarden, open an Integration Request issue. Read `Documents/INTEGRATION_GUIDE.md` and `Documents/TRUST_API.md` first.

### Code Contributions
See the development setup section below.

## Architecture Layers

Understand which layer your contribution touches before submitting:

| Layer | Path | Language | Notes |
|---|---|---|---|
| Protocol (Move modules) | `sources/` | Move (Sui) | ADR required for schema/attestation changes |
| Indexer + API | `indexer/` | Rust | Axum REST, Supabase/Postgres |
| Frontend | `frontend/` | TypeScript / React / Vite | Operator console |
| SDK (TrustKit) | `sdk/trustkit/` | TypeScript | Client SDK for tool integrations |
| Tests | `tests/` | Mixed | Protocol and integration tests |
| Scripts | `scripts/` | TypeScript/Shell | Gate management and deploy tooling |

## Development Setup

### Prerequisites

- **Sui CLI** — for Move module development and deployment
- **Node.js 18+** — for frontend and SDK
- **Rust toolchain** — for indexer/API
- **Postgres / Supabase** — for local indexer database
- Access to **Sui testnet (Stillness)** for protocol interaction

### Getting Started

```bash
# Clone the repo
git clone https://github.com/Kodaxadev/FrontierWarden.git
cd FrontierWarden

# Frontend
cd frontend && npm install

# SDK
cd sdk/trustkit && npm install

# Indexer (Rust)
cd indexer && cargo build
```

See `Documents/INTEGRATION_GUIDE.md` and `Documents/OPERATOR_FLOW_RUNBOOK.md` for full environment setup.

## Architecture Decision Records (ADRs)

Changes that affect attestation schemas, oracle registry, trust scoring logic, gate policy semantics, or the killmail evidence model require an ADR.

ADRs live in `Documents/`. Follow the naming convention: `ADR_SHORT_DESCRIPTION.md`.

ADR format:
- **Status**: Proposed / Accepted / Superseded / Deferred
- **Context**: What problem or question prompted this decision
- **Decision**: What was decided and why
- **Consequences**: What changes, what is ruled out, what is accepted

Do not submit a PR modifying core trust logic without a corresponding ADR.

## Pull Request Guidelines

1. **Branch from `main`** using a descriptive branch name: `feat/gate-policy-v2`, `fix/indexer-freshness`, `docs/trust-api-update`
2. **Reference the issue** your PR addresses in the description.
3. **Keep scope tight.** Do not bundle unrelated changes. Protocol changes and frontend changes should be separate PRs unless they are tightly coupled.
4. **Use conventional commit messages**:
   - `feat(indexer): add freshness endpoint`
   - `fix(protocol): correct vouch expiry logic`
   - `docs(api): update trust evaluate contract`
   - `chore: pin npm dependencies`
5. **Include tests** for protocol changes and API endpoint changes.
6. **Do not include testnet credentials**, wallet addresses, or private tenant data in commits.
7. For protocol changes, ensure the PR description explains the on-chain impact and references the relevant ADR.

See the Pull Request template for the full checklist.

## Security Issues

Do **not** open a public issue for security vulnerabilities. Use the private disclosure process described in [SECURITY.md](SECURITY.md).

This applies to:
- Smart contract vulnerabilities in Move modules
- Trust score manipulation vectors
- Unauthorized gate policy control paths
- API authentication or authorization weaknesses
- Data aggregation risks involving private tenant data

## License

FrontierWarden is licensed under the **Business Source License 1.1**. Non-commercial contributions are welcome. By submitting a pull request, you agree that your contributions are licensed under the same terms as the project. Commercial use requires a separate license from Kodaxadev.

See [LICENSE](LICENSE) for full terms.

## Questions

For integration support or commercial licensing, contact: **Justin.DavisWE@icloud.com**

For general questions about the trust model, open a Discussion.
