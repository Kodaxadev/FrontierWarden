# zkLogin Session Auth Research

**Branch:** codex/zklogin-session-auth-research  
**Date:** 2026-05-16  
**Status:** Research only — no implementation changes in this document.

## Purpose

FrontierWarden's operator console requires a signed challenge to establish a browser
session (`POST /auth/nonce` → `POST /auth/session`). The Rust backend verifies the
signature natively using `ed25519_dalek` and issues a short-lived bearer token.

**Problem:** EVE Vault uses zkLogin, not Ed25519. EVE Vault operators cannot
authenticate to the operator console because flag byte `0x05` (zkLogin) is explicitly
rejected by the current `verify_personal_message` function.

This document answers eight questions and produces a design recommendation.

---

## Scope

**In scope:**
- How to add zkLogin as a second accepted scheme at `/auth/session`
- Verification paths: local/native vs. delegated to Sui RPC
- Security risks of each path
- Long-term architecture

**Out of scope:**
- Changes to `api_sessions.rs` — this is research only
- Any weakening of the existing Ed25519 path
- Any frontend changes
- Any cryptography dependency additions in this session

---

## Current State

`api_sessions.rs` verifies personal-message signatures at the Rust layer:

```rust
/// Only Ed25519 (Sui flag byte 0x00) is supported for operator sessions.
/// secp256k1, secp256r1, zkLogin, and passkey schemes are not accepted.
fn verify_personal_message(message: &str, signature: &str, address: &str) -> anyhow::Result<()> {
    verify_personal_message_ed25519(message, signature, address)
}
```

The nonce/message format is:
```
FrontierWarden operator session
Address: 0x<operator-address>
Nonce: <random-16-byte-hex>
Expires: <unix-seconds>
```

The nonce is single-use with a 300-second TTL. The session token TTL is 3600 seconds.
The `signature_scheme_label` helper already classifies flag byte `0x05` as `"zklogin"`.

---

## Research Questions

### Q1: What signature format does EVE Vault produce for personal-message signing?

**Confirmed format:**

Sui zkLogin signatures follow the standard Sui serialization envelope:
```
[flag_byte=0x05] || BCS(ZkLoginSignature)
```

`ZkLoginSignature` BCS struct:
```
ZkLoginSignature {
    inputs: ZkLoginSignatureInputs {
        proof_points: ZkProofPoints {
            pi_a: [String; 2]      // BN254 G1 point
            pi_b: [[String; 2]; 2] // BN254 G2 point
            pi_c: [String; 2]      // BN254 G1 point
        }
        iss_base64_details: {
            value: String
            index_mod_4: u8
        }
        header_base64: String      // JWT header
        address_seed: String       // Poseidon hash of claim + salt
    }
    max_epoch: u64
    user_signature: bytes          // ephemeral Ed25519 signature
    iss: String                    // issuer ("https://test.auth.evefrontier.com")
    address_seed: String
}
```

**Key points:**
- `user_signature` is an **Ed25519 signature made by the ephemeral key** over the
  personal message digest (same intent/BCS-vector/Blake2b pipeline as a regular
  Ed25519 personal-message signature).
- The Groth16 proof proves that the ephemeral key is bound to the JWT claim hash.
- Serialized size is roughly 400–700 bytes (dominated by BN254 point strings).
- The current `SessionRequest.signature` field (base64 `String`) can hold this without
  schema changes — it's already variable-length.

**EVE Vault specifically:** Uses FusionAuth at `test.auth.evefrontier.com` as the
OAuth2/OIDC provider. The `iss` field in the JWT will be this issuer string, which
propagates into `iss_base64_details` and ultimately into address derivation.

---

### Q2: Can Sui JSON-RPC verify zkLogin personal-message signatures?

**Short answer: No, not via JSON-RPC. Yes, via the Sui GraphQL API.**

The Sui fullnode JSON-RPC (`/`) does **not** expose a `sui_verifyPersonalMessageSignature`
endpoint. Signature verification in the JSON-RPC surface only happens implicitly as part
of transaction execution.

**Important context:** Mysten Labs is deprecating the Sui JSON-RPC API and migrating
the canonical interface to GraphQL by approximately July 2026. The JSON-RPC endpoints
will remain operational for the foreseeable future on testnet, but new protocol surface
is being added only to GraphQL.

The Sui GraphQL API exposes:

```graphql
query VerifyZkLogin(
  $bytes: Base64!
  $signature: Base64!
  $address: SuiAddress!
  $intentScope: ZkLoginIntentScope!
) {
  verifyZkLoginSignature(
    bytes: $bytes
    signature: $signature
    address: $address
    intentScope: $intentScope
  ) {
    success
    errors
  }
}
```

- `bytes` — the BCS-serialized personal message (not raw UTF-8)
- `signature` — base64-encoded `[0x05] || BCS(ZkLoginSignature)`
- `address` — the expected Sui address (hex with `0x`)
- `intentScope` — `PERSONAL_MESSAGE` for operator session signing

The fullnode verifies the Groth16 proof, the ephemeral signature, the epoch bounds,
and the address match. It returns `{ success: true, errors: [] }` or a list of
failure reasons.

**Edge case:** There can be two valid Sui addresses for a given zkLogin input set due
to a legacy derivation path. The backend should accept the session if the caller's
address matches *any* address the fullnode confirms as valid.

---

### Q3: What exact RPC method and request shape should the backend use?

The backend already uses `reqwest` for Sui JSON-RPC calls (`rpc.rs`). The Sui GraphQL
endpoint accepts plain `POST` with `Content-Type: application/json` — no special
client library is needed.

**Endpoint:**
```
POST https://sui-testnet.mystenlabs.com/graphql    (testnet)
POST https://sui-mainnet.mystenlabs.com/graphql    (mainnet)
```

These should be configurable via environment variable (e.g., `EFREP_SUI_GRAPHQL_URL`).

**Request shape (plain reqwest, no new dependencies):**
```rust
let query = r#"
  query($bytes: Base64!, $sig: Base64!, $addr: SuiAddress!, $intent: ZkLoginIntentScope!) {
    verifyZkLoginSignature(bytes: $bytes, signature: $sig, address: $addr, intentScope: $intent) {
      success
      errors
    }
  }
"#;

let body = serde_json::json!({
    "query": query,
    "variables": {
        "bytes": base64::encode(bcs_personal_message_bytes(&message)),
        "sig": signature_b64,
        "addr": address,
        "intent": "PERSONAL_MESSAGE"
    }
});

let resp: serde_json::Value = http_client
    .post(graphql_url)
    .json(&body)
    .send()
    .await?
    .json()
    .await?;

let success = resp["data"]["verifyZkLoginSignature"]["success"].as_bool().unwrap_or(false);
```

The `bcs_personal_message_bytes` would encode the message string as a BCS vector (the
same `bcs_vector` helper already exists in `api_sessions.rs`).

**No new Cargo dependencies required** — `reqwest` and `serde_json` are already present.

---

### Q4: Can the backend delegate verification to Sui RPC while still issuing sessions itself?

**Yes. This is the recommended near-term path.**

The split of responsibility:

```
Backend                              Sui Fullnode (GraphQL)
──────────────────────────           ──────────────────────────
1. Issue nonce + message             (not involved)
2. Receive { address, nonce,         (not involved)
   message, signature }
3. Consume nonce (single-use,        (not involved)
   TTL-checked, message-matched)
4. Detect scheme byte (0x00 / 0x05)  (not involved)
5. Route to verifier:
   - 0x00 → local Ed25519            (not involved)
   - 0x05 → POST GraphQL →           ← verifies Groth16 + ephemeral sig
                         ← { success, errors }
6. If success: issue session token   (not involved)
```

The backend remains the session authority. It issues the token, stores it, and
validates it on protected routes. The fullnode only answers "is this zkLogin signature
valid for this message and address?" — it never sees the token and has no session state.

**Critical invariant preserved:** Even in the delegated path, the nonce is consumed
and validated by the backend before the GraphQL call. If the RPC call fails or times
out, the nonce is already consumed (caller must request a new nonce). This prevents
replay even if the network is unreliable.

---

### Q5: What replay protection / challenge format is required?

The existing nonce format is adequate for zkLogin with no changes:

```
FrontierWarden operator session
Address: 0x<address>
Nonce: <16-byte random hex>
Expires: <unix-timestamp-secs>
```

Why it is sufficient:
- **Nonce binding:** The nonce is single-use and removed from the store at consumption.
  An attacker who intercepts the signature cannot reuse it — the nonce is already spent.
- **Message binding:** The backend checks `pending.message == req.message` in
  `consume_nonce`. The full message (including address + nonce + expiry) must match
  what was issued. A crafted message with a different address or timestamp fails.
- **Time binding:** The nonce TTL is 5 minutes. Signatures over expired nonces are
  rejected at the nonce-consumption step, before the GraphQL call.
- **Address binding:** The backend checks `pending.address == req.address`, and the
  GraphQL verifier checks that the signature is valid *for the given address*. A valid
  zkLogin signature from wallet A cannot be used to claim a session as wallet B.

No changes to the nonce mechanism are required when adding zkLogin.

---

### Q6: How should session auth distinguish Ed25519, zkLogin, and unsupported schemes?

The flag byte already encodes the scheme. The existing `signature_scheme_label` helper
already parses this correctly. The dispatch logic should be:

```rust
fn verify_personal_message(
    message: &str,
    signature: &str,
    address: &str,
    // + async context / HTTP client for delegated path
) -> anyhow::Result<()> {
    let bytes = base64::decode(signature)?;
    match bytes.first() {
        Some(0x00) => verify_personal_message_ed25519(message, signature, address),
        Some(0x05) => verify_zklogin_via_rpc(message, signature, address).await,
        Some(scheme) => Err(anyhow::anyhow!(
            "unsupported signature scheme 0x{scheme:02x}"
        )),
        None => Err(anyhow::anyhow!("empty signature")),
    }
}
```

The error paths for rejected schemes must return `401 Unauthorized` with the same
opaque message as today (`"wallet signature verification failed"`). Do not reveal
the scheme byte in the 401 response body — scheme info is diagnostic only and
belongs in server-side logs (already captured by `signature_scheme_label` tracing).

Schemes that are explicitly **not supported** and must remain rejected:
- `0x01` secp256k1
- `0x02` secp256r1
- `0x03` multisig
- `0x06` passkey

The current behavior (log the scheme, return 401) is correct for all of these.

---

### Q7: What are the security risks of trusting Sui RPC verification?

**Risk 1 — RPC availability (HIGH operational impact, LOW security impact)**

If the Sui fullnode GraphQL endpoint is down, zkLogin operators cannot log in. The
Ed25519 path is unaffected. Mitigations:
- Configurable RPC URL so a private/dedicated node can be used in production
- Circuit breaker: if RPC unavailable, return `503 Service Unavailable` (not `401`)
  so operators know the issue is infrastructure, not their wallet
- Fallback: allow the operator to temporarily use an Ed25519 wallet for emergencies

**Risk 2 — Trusting the fullnode (MEDIUM)**

The backend trusts the fullnode's `{ success: true }` response. This means:
- A malicious fullnode operator could accept invalid zkLogin proofs
- Mitigations: use Mysten's official public nodes, or validate TLS certificate pins
- In practice: for testnet, the risk is acceptable; for mainnet production, a
  dedicated or whitelisted node is preferred
- Note: the nonce mechanism still prevents replay even if a fullnode is dishonest
  about proof validity — the session is only as strong as the nonce binding

**Risk 3 — SSRF via configurable URL (MEDIUM, preventable)**

If `EFREP_SUI_GRAPHQL_URL` is configurable, an attacker who can set env vars could
redirect GraphQL calls to an internal service. Mitigation: validate the URL scheme
and hostname at startup; only accept `https://` with an allowlist of trusted domains,
or hard-code the testnet/mainnet URLs as defaults.

**Risk 4 — Epoch expiry (LOW, inherent to zkLogin)**

zkLogin proofs have a `max_epoch` field. A signature is only valid until the Sui
epoch in that field. The Sui fullnode's `verifyZkLoginSignature` checks this bound.
Sessions issued before epoch rollover remain valid (they use the bearer token, not
the zkLogin proof), but operators with expired proofs must re-auth with fresh proofs.
This is expected zkLogin behavior.

**Risk 5 — Two valid addresses per proof (LOW, known edge case)**

As noted in Q2, some zkLogin inputs map to two valid addresses. If this edge case
is encountered, the fullnode's response will indicate success for the address claimed
by the caller. The backend validates that the caller's claimed address is the one the
fullnode confirms — this is not exploitable if the address check is strict.

**Risk 6 — Rate limit at the fullnode (LOW operational impact)**

Public Sui fullnodes may rate-limit GraphQL queries. Operator sessions are low-volume
(individual humans logging in), so this is unlikely to be an issue in practice.

**Summary table:**

| Risk | Severity | Mitigation |
|---|---|---|
| RPC unavailability | Operational | Configurable URL, 503 vs 401 |
| Dishonest fullnode | Medium | Use official Mysten nodes, TLS |
| SSRF | Medium | Validate/allowlist RPC URLs at startup |
| Epoch expiry | Low | Expected; operators re-auth after epoch |
| Dual address edge case | Low | Strict address check in response |
| Rate limiting | Low | Sessions are low-volume |

---

### Q8: What is the long-term path for native Rust verification?

**The native path exists and is maintained by Mysten Labs.**

Mysten publishes `fastcrypto-zkp`, a Rust crate providing Groth16 verification over
BN254. This is the same library used inside `sui-core` for on-chain zkLogin
verification. The repository is `MystenLabs/fastcrypto`.

Mysten also published a standalone `zklogin-verifier` service (Rust) that wraps
`fastcrypto-zkp` and exposes an HTTP API for zkLogin proof verification. This could
be run as a sidecar service.

**What native verification would require in the indexer:**

```toml
# Cargo.toml additions
fastcrypto-zkp = { version = "0.x", git = "https://github.com/MystenLabs/fastcrypto" }
```

Dependency surface of `fastcrypto-zkp`:
- `ff` — finite field arithmetic
- `neptune` — Poseidon hash (used for address seed)
- `ark-groth16` / BN254 curve support
- Several other Mysten-internal crates

The build cost is significant (Groth16 is non-trivial Rust). The dependency tree is
not currently on `crates.io` in a stable form — `fastcrypto` is pinned to git and
does not follow semver in the same way as crates.io packages. This creates supply
chain risk and complicates Dockerfile caching.

**Adoption criteria for native path:**
1. `fastcrypto-zkp` is published to crates.io with stable semver
2. A clear API for `verify_personal_message_zklogin(message, sig, address)` is
   available without needing to pull in all of Mysten's internal infra
3. The Groth16 verification key for the current zkLogin circuit is bundled or
   retrievable in a verifiable way
4. An independent security audit of the Rust path has been completed

Until these criteria are met, the delegated GraphQL path is safer than an
unaudited native implementation.

**Path for replacing delegation with native later:**

Because the `verify_zklogin_via_rpc` function is isolated behind the scheme dispatch,
replacing it with `verify_zklogin_native` later requires changing one function without
touching nonce handling, session issuance, or the Ed25519 path. Design for this
replaceability now.

---

## Recommendation

### Option A — Delegated GraphQL Verification (Recommended near-term)

Add a zkLogin verification code path in `api_sessions.rs` that calls the Sui fullnode
GraphQL API for signature verification. The backend remains the session authority.

**Implementation sketch (not a plan — for design reference only):**

1. Add `zklogin_graphql_url: Option<String>` to `SessionState` or read from env at
   call time.
2. In `verify_personal_message`, dispatch on flag byte. If `0x05` and GraphQL URL is
   configured, call `verify_zklogin_via_graphql`; if not configured, return
   `unsupported scheme`.
3. `verify_zklogin_via_graphql` posts to the GraphQL endpoint, checks
   `data.verifyZkLoginSignature.success == true`, and validates the address in the
   response matches `req.address`.
4. Add `EFREP_SUI_GRAPHQL_URL` env var. Default to
   `https://sui-testnet.mystenlabs.com/graphql` for testnet deployments.
5. On GraphQL error or timeout: return `503 Service Unavailable` (not 401) with body
   `{"error":"ZKLOGIN_VERIFIER_UNAVAILABLE","message":"zkLogin verification service is temporarily unavailable."}`.
6. No new Cargo dependencies required — `reqwest` and `serde_json` already present.
7. Ed25519 path: no changes.
8. Tests: unit-test the dispatch logic; integration-test the GraphQL path against the
   real Sui testnet endpoint (or a mock).

**Env var surface added:**
```
EFREP_SUI_GRAPHQL_URL=https://sui-testnet.mystenlabs.com/graphql
```

### Option B — Transaction-based Identity Proof (Viable alternative)

Instead of personal-message signing, require the operator to sign and submit a
zero-value transaction that the indexer can observe as evidence of wallet control.
The backend watches for the transaction and issues a session upon confirmation.

Pros: No cryptographic verification in the backend at all.
Cons: Requires gas; confirmation latency (~1–3s); needs a new indexer watch path.
Not recommended for the first implementation.

### Option C — Native Rust zkLogin Verification (Long-term target)

Replace the GraphQL call with `fastcrypto-zkp` once adoption criteria in Q8 are met.
The code change is minimal (swap one function); the infrastructure change is large.
Tracked as a future spike.

---

## Design Invariants

These must hold in any implementation:

1. **Ed25519 path unchanged** — local, synchronous, no network calls. Zero regression
   risk.
2. **Nonce consumed before RPC call** — prevents replay regardless of RPC reliability.
3. **Address must match** — the GraphQL response must confirm the claimed address. The
   backend never issues a session for an address the fullnode did not verify.
4. **Scheme 401 is opaque** — unsupported schemes return the same error message as
   invalid signatures. No scheme leakage in 401 bodies.
5. **zkLogin verification is opt-in** — only enabled when `EFREP_SUI_GRAPHQL_URL` is
   set. Deployments without the env var continue to reject zkLogin with 401.
6. **No frontend trust** — the GraphQL call is always server-side. The backend never
   trusts a "verified" flag sent by the browser.

---

## Open Questions (Not blocking, but relevant for implementation planning)

1. **FusionAuth as OAuth provider:** The `iss` value in EVE Vault proofs will be
   `https://test.auth.evefrontier.com`. Does Mysten's fullnode trust this issuer for
   zkLogin verification? The testnet fullnode's allowed-issuer list needs to include
   it. **Requires verification against testnet node config.**

2. **Session message encoding for GraphQL:** The GraphQL `bytes` field expects the
   BCS-encoded personal message (not raw UTF-8). The `bcs_vector` helper in
   `api_sessions.rs` already produces this encoding — but the exact encoding expected
   by `verifyZkLoginSignature` needs to be confirmed against the Mysten SDK source.

3. **Epoch TTL vs session TTL:** If a user's zkLogin proof `max_epoch` is shorter than
   the session TTL (1 hour), should the session TTL be capped to the proof's epoch
   expiry? The current design would allow the session to outlive the proof, which is
   acceptable (the session token is independent). But it's worth a policy decision.

4. **JSON-RPC deprecation timeline:** Sui's JSON-RPC is being deprecated. The indexer's
   `rpc.rs` uses JSON-RPC for event fetching. A separate spike should assess migration
   to the GraphQL event subscription API before the July 2026 cutoff.

---

## References

- Sui zkLogin deep dive: https://blog.sui.io/zklogin-deep-dive/
- Sui zkLogin spec: https://docs.sui.io/concepts/cryptography/zklogin
- Mysten fastcrypto repo: https://github.com/MystenLabs/fastcrypto
- Mysten zklogin-verifier: https://github.com/MystenLabs/zklogin-verifier
- Sui GraphQL RPC: https://docs.sui.io/guides/developer/advanced/graphql-rpc
- EVE Vault GitHub: https://github.com/evefrontier/evevault
- EVE Frontier FusionAuth: https://test.auth.evefrontier.com
