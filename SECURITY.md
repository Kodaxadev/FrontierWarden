# FrontierWarden Security Model

> Audience: auditors, security researchers, and integrators.  
> Status: pre-mainnet testnet software. Do not deploy to mainnet without audit.  
> Version: 0.0.2-testnet

## Scope

FrontierWarden currently runs as a Stillness/testnet demo:

- Sui Move protocol package on testnet.
- Rust indexer/API on Railway.
- Gas station service on Railway.
- Supabase/Postgres as the indexed state store.
- Vercel-hosted React/Vite frontend.

No mainnet deployment has occurred.

## Trust Boundaries

| Boundary | Trust assumption |
|---|---|
| Move protocol | Enforces object ownership, capabilities, and shared object rules. |
| Rust API/indexer | Reads Sui events, projects state, and serves Trust API decisions. |
| Supabase/Postgres | Stores indexed state; public table access should remain locked down. |
| Vercel frontend | Public client. It must not contain secrets. |
| Railway gas station | Server-side sponsor and oracle service. It holds private secrets. |
| Browser wallet | Signs operator session messages and transactions. |

## API Boundary

`EFREP_API_KEY` is a server-only partner access gate and rate-limit aid for the
Rust API. It is not user authentication, wallet authentication, or per-tenant
authorization.

Public GET/read routes and Trust API evaluation routes may be unauthenticated
for the demo, but they should be rate-limited. Public read access is not a
license to expose database credentials or service-role keys.

Protected operations remain protected by the appropriate server-side controls:

- Operator browser access uses short-lived wallet-signed session bearer tokens.
- API partner access can use server-only `EFREP_API_KEY`.
- Oracle issue routes require server-side authorization.
- Sponsored transaction routes must be constrained by origin controls,
  transaction validation, budget caps, and server-side sponsor keys.
- No protected route should rely on a browser-exposed static secret.

## Browser Secrets

No secret belongs in a `VITE_*` variable.

Vite exposes variables prefixed with `VITE_` to browser client code after
bundling. Only public configuration belongs there: API base URLs, network names,
package IDs, object IDs, and feature flags. See the official Vite documentation:
[vite.dev/guide/env-and-mode](https://vite.dev/guide/env-and-mode).

Never put these in frontend variables:

- `EFREP_API_KEY`
- Supabase database URLs
- Supabase service-role keys
- sponsor private keys
- oracle API keys
- wallet private keys
- partner tokens

If a secret was exposed in a frontend bundle, rotate it.

## Operator Sessions

Browser operators authenticate through short-lived wallet-signed sessions:

1. `POST /auth/nonce` returns a one-use FrontierWarden session message.
2. The connected wallet signs that message using Sui personal-message signing.
3. `POST /auth/session` verifies the signature and returns a bearer token.

Current backend verification is native Rust Ed25519 verification only:

- Sui signature flag byte `0x00`.
- Verification is implemented in Rust with `ed25519_dalek` and `Blake2bVar`.
- There is no JavaScript verifier process in the active backend session path.
- zkLogin, passkey, secp256k1, and secp256r1 session signatures are not accepted
  unless backend support is explicitly implemented later.

Some EVE-compatible wallets may use zkLogin for transaction signing. zkLogin
proof fetching can fail before a wallet signs a sponsored transaction. That is a
wallet/prover availability issue and should not be documented as proof of final
transaction execution.

## Data and Logging

`api_request` logs are operational telemetry.

Do not log:

- API keys
- wallet signatures
- private keys
- full request bodies for sensitive routes
- full client IPs in long-term logs

Prefer short retention, aggregated counters, and redacted request metadata for
public deployments.

## Module-Level Security Notes

### Schema Registry

- Critical invariant: only authorized addresses can register or deprecate
  schemas.
- Key risk: admin key compromise before governance transfer.

### Oracle Registry

- Critical invariant: only registered oracles with sufficient stake can issue
  attestations.
- Schema scoping: capabilities only authorize the schemas listed at issuance.

### Profile

- Player profiles are intended to represent player reputation state.
- Oracle-only score writes require a valid `OracleCapability`.

### Vouch

- Vouches are stake-backed social collateral.
- Callers must not be able to cite another wallet's profile to inflate their own
  credibility.

### Lending

- Loan state transitions must keep repaid and defaulted states mutually
  exclusive.
- Vouch-backed lending remains pre-mainnet and should not be used for high-value
  assets without audit.

### Reputation Gate

- Gate policy decisions depend on standing attestations and threshold/toll
  configuration.
- Sponsored gate-passage flow currently reaches wallet signing, but final
  execution can still depend on wallet signing and zkLogin proof availability.

## Mainnet Readiness Requirements

Before mainnet:

1. Complete a Move security audit.
2. Complete backend/API security review.
3. Transfer admin rights to a multisig, DAO, or other governance mechanism.
4. Verify EVE/EVT payment coin behavior before replacing SUI test flows.
5. Add deployment-level rate limits, monitoring, and alerting.
6. Re-review all public routes, RLS posture, and secret handling.

## Disclosure Policy

We welcome reports from security researchers and the community.

If you find a potential vulnerability:

1. Do not disclose publicly until it is resolved.
2. Submit details to `Justin.DavisWE@icloud.com`.
3. Include a clear description, reproduction steps, and potential impact.

We aim to acknowledge reports within 48 hours and provide regular updates on
resolution.

## Known Limitations

FrontierWarden is pre-mainnet software. Known pre-mainnet limitations and
unresolved exploit scenarios are tracked privately. Do not use for high-value
transactions until a full audit is completed and governance is decentralized.
