# ADR: zkLogin Operator Session Authentication

**Date:** 2026-05-16  
**Status:** Implemented — `codex/zklogin-session-auth-graphql`  
**Files:** `indexer/src/zklogin_verifier.rs`, `indexer/src/api_sessions.rs`

---

## Context

FrontierWarden's operator console issues short-lived session tokens via
`POST /auth/nonce` → `POST /auth/session`. The Rust backend verifies a personal-message
signature from the operator's wallet and issues a bearer token.

EVE Vault uses zkLogin (Sui flag byte `0x05`), not Ed25519 (`0x00`). The previous
`verify_personal_message` only accepted Ed25519 — EVE Vault operators could not log in.

---

## Decision

**Delegate zkLogin signature verification to the Sui GraphQL `verifySignature` query
rather than verifying Groth16 proofs locally.**

The backend remains the session authority. Only the signature validity check is
delegated. Nonce issuance, nonce consumption, address binding, and token issuance all
remain backend-owned.

### Why not native Rust verification?

`fastcrypto-zkp` (MystenLabs' Groth16 crate) is not published to crates.io with stable
semver, requires pulling Mysten's internal dependency graph, and has no independent
security audit. The dependency cost and supply-chain risk are not justified for an
operator-console session flow with low authentication volume. The GraphQL path is
audited by Mysten and requires zero new Cargo dependencies.

**Criteria for revisiting native path:**
- `fastcrypto-zkp` published to crates.io with stable semver
- A clean `verify_personal_message_zklogin(message, sig, address)` API available
- The Groth16 verification key bundled or retrievable in a verifiable way
- Independent security audit of the Rust path completed

The code boundary — `verify_personal_message_zklogin` is isolated behind scheme
dispatch — makes this a one-function swap when the criteria are met.

### Why not transaction-based proof?

Requiring an on-chain transaction costs gas, has 1–3 second confirmation latency, and
requires a new indexer watch path. Not warranted for operator login.

---

## Issuer Confirmation

EVE Vault uses FusionAuth at `test.auth.evefrontier.com` as its OAuth2/OIDC issuer.
The Sui testnet fullnode maintains a configurable allowlist of trusted zkLogin issuers.

**Confirmed 2026-05-16:** Transaction `DnqRwm9MmVm9ZsVXNaptFJX5M6w8QrSiPreATmAxCZRR`
was accepted by the Sui testnet with a zkLogin signature (flag `0x05`) from wallet
`0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f`. The testnet
node validates the JWT `iss` claim as part of transaction verification — the claim
passing proves `test.auth.evefrontier.com` is in the allowlist.

Personal-message `verifySignature` uses the same proof verification pipeline. Confirmed
issuer acceptance applies equally to that path.

---

## GraphQL Request Shape

```
POST https://graphql.testnet.sui.io/
Content-Type: application/json

query VerifySignature(
  $message:     Base64!       # raw UTF-8 session message bytes — NOT BCS-wrapped
  $signature:   Base64!       # [0x05] || ZkLoginSignature BCS bytes
  $intentScope: IntentScope!  # PERSONAL_MESSAGE
  $author:      SuiAddress!   # 0x-prefixed 64-hex-char address
) {
  verifySignature(
    message:     $message
    signature:   $signature
    intentScope: $intentScope
    author:      $author
  ) {
    success     # Boolean; rejection surfaces as top-level GraphQL errors array
  }
}
```

**Critical encoding fact:** `message` is raw UTF-8 bytes of the session challenge
string, Base64-encoded. The fullnode applies BCS-vector wrapping and intent prefix
(`[0x03, 0x00, 0x00]`) internally. Do not pre-wrap. The `bcs_vector` helper in
`api_sessions.rs` is used for the local Ed25519 digest only.

Note: `verifyZkLoginSignature` is deprecated in the current schema. `verifySignature`
supports all Sui signature types and is the correct field to use.

---

## Scheme Dispatch

```
flag byte 0x00  →  Ed25519 local verification (unchanged, synchronous)
flag byte 0x05  →  Sui GraphQL verifySignature delegation (async)
any other byte  →  opaque 401 (same response text as bad signature)
```

Rejected schemes: `0x01` secp256k1, `0x02` secp256r1, `0x03` multisig, `0x06` passkey.

---

## Error Mapping

| Condition | HTTP | Notes |
|---|---|---|
| Ed25519 bad signature | 401 | local verification failed |
| zkLogin `success: false` | 401 | proof invalid, address mismatch, or epoch expired |
| zkLogin GraphQL errors (issuer rejected etc.) | 401 | fullnode returned errors array |
| Unsupported scheme byte | 401 | |
| GraphQL timeout (>10s) | 503 | operator must request new nonce |
| GraphQL connection refused / DNS | 503 | operator must request new nonce |
| Malformed GraphQL JSON | 503 | |

**Invariant:** Nothing scheme-specific, issuer-specific, or proof-specific appears in
any 401 or 503 response body. Log full detail server-side at WARN/ERROR; surface nothing
externally.

---

## Nonce Timing — v1 Tradeoff

The nonce is consumed *before* the GraphQL verifier call:

```
1. consume_nonce(req)        ← nonce removed here
2. detect scheme byte
3. call verifySignature      ← async network call
4. issue session token
```

**Why:** Prevents replay unconditionally. Even if the verifier never responds, an
attacker who observed the nonce cannot reuse it — it is already spent.

**UX cost:** On 503 (verifier timeout/unavailable), the operator must request a new
nonce. Document this as: *"Wallet verification timed out. Please request a new
challenge and try again."*

**v2 path (not yet implemented):** Mark nonce `verification_in_progress` rather than
consuming it; restore to `pending` on verifier timeout; rate-limit nonces per address
to prevent farming. Requires a more complex nonce state machine. Do not implement until
v1 verifier uptime is understood.

---

## Security Risks

| Risk | Severity | Mitigation |
|---|---|---|
| GraphQL endpoint unavailable | Operational | Configurable URL, 503 vs 401, fallback to Ed25519 wallet |
| Trusting the fullnode's `success: true` | Medium | Use Mysten's official nodes; nonce still prevents replay |
| SSRF via `EFREP_SUI_GRAPHQL_URL` | Medium | `https://` required at startup; local addresses for dev/test only |
| Epoch expiry | Low | Expected zkLogin behavior; operators re-auth after epoch rollover |
| Rate limiting at fullnode | Low | Sessions are low-volume (individual human logins) |

---

## Config

| Env var | Default | Notes |
|---|---|---|
| `EFREP_SUI_GRAPHQL_URL` | `https://graphql.testnet.sui.io/` | Must use `https://`; rejected at startup otherwise |

---

## Follow-up: v2 Nonce Hardening

`codex/session-nonce-retry-hardening` — avoid permanently burning the nonce on verifier
outage while preserving replay protection. Not urgent; current v1 is secure and
conservative.

---

## References

- Research doc (full 8-question analysis): branch `codex/zklogin-session-auth-verify-signature-spike`,
  `Documents/ZKLOGIN_SESSION_AUTH_RESEARCH.md`
- Spike harness (verifySignature test binary): `indexer/src/bin/verify_signature_spike.rs`
- Sui GraphQL schema (canonical): `crates/sui-indexer-alt-graphql/schema.graphql`, MystenLabs/sui main
- Mysten fastcrypto: https://github.com/MystenLabs/fastcrypto
- Sui zkLogin spec: https://docs.sui.io/concepts/cryptography/zklogin
