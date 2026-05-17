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
will remain operational on testnet for the foreseeable future, but new API surface is
being added only to GraphQL. The indexer's existing `rpc.rs` event-fetching also uses
JSON-RPC and will need a separate migration before the cutoff.

The Sui GraphQL API (schema source: `crates/sui-indexer-alt-graphql/schema.graphql`,
`MystenLabs/sui` main branch) exposes **two** fields:

```graphql
# Current — use this. Supports ALL signature types.
verifySignature(
  message: Base64!       # raw message bytes, Base64-encoded (NOT BCS-wrapped)
  signature: Base64!     # [flag_byte] || sig || pubkey, Base64-encoded
  intentScope: IntentScope!   # PERSONAL_MESSAGE | TRANSACTION_DATA
  author: SuiAddress!    # the signer's Sui address (0x-prefixed hex)
): SignatureVerifyResult

type SignatureVerifyResult {
  success: Boolean
}

# Deprecated — do not use in new code.
verifyZkLoginSignature(
  bytes: Base64!         # note: argument is 'bytes', not 'message'
  signature: Base64!
  intentScope: ZkLoginIntentScope!
  author: SuiAddress!
): ZkLoginVerifyResult
  @deprecated(reason: "Use verifySignature instead, which supports all signature types.")
```

**Key confirmed facts (from schema introspection):**
- Use `verifySignature`, not `verifyZkLoginSignature`. The latter is deprecated.
- The argument for the message is `message` (not `bytes`) in `verifySignature`.
- The argument for the signer is `author` (not `address`).
- `IntentScope` (not `ZkLoginIntentScope`) is the enum for `verifySignature`.
- The return type has **only** `success: Boolean`. There is no `errors` array in
  the return type — verification failures surface as top-level GraphQL errors.
- `message` is the **raw message bytes**, Base64-encoded. The fullnode internally
  applies BCS-vector wrapping and intent prefix before computing the digest.

**Testnet endpoint:** `https://graphql.testnet.sui.io/` (canonical current URL).

---

### Q3: What exact RPC method and request shape should the backend use?

The backend already uses `reqwest` for Sui JSON-RPC calls (`rpc.rs`). The Sui GraphQL
endpoint accepts plain `POST` with `Content-Type: application/json` — no special
client library is needed.

**Endpoint (configurable via `EFREP_GRAPHQL_URL`):**
```
POST https://graphql.testnet.sui.io/    (testnet — canonical URL)
POST https://graphql.mainnet.sui.io/    (mainnet)
```

**Confirmed request shape** (verified against `crates/sui-indexer-alt-graphql/schema.graphql`):

```rust
const VERIFY_QUERY: &str = r#"
  query VerifySignature(
    $message: Base64!
    $signature: Base64!
    $intentScope: IntentScope!
    $author: SuiAddress!
  ) {
    verifySignature(
      message: $message
      signature: $signature
      intentScope: $intentScope
      author: $author
    ) {
      success
    }
  }
"#;

let body = serde_json::json!({
    "query": VERIFY_QUERY,
    "variables": {
        "message":     base64::encode(raw_message_utf8_bytes),  // raw bytes, NOT BCS-wrapped
        "signature":   signature_b64,                           // [flag] || sig || pubkey
        "intentScope": "PERSONAL_MESSAGE",
        "author":      address,                                 // 0x-prefixed hex
    }
});

let resp: serde_json::Value = http_client
    .post(graphql_url)
    .header("content-type", "application/json")
    .json(&body)
    .send()
    .await?
    .json()
    .await?;

// Successful: resp["data"]["verifySignature"]["success"] == true
// Failed:     resp["errors"] is non-null (GraphQL-level error, not a success:false field)
let success = resp["data"]["verifySignature"]["success"].as_bool().unwrap_or(false);
let gql_errors = &resp["errors"];
```

**Critical encoding note:** `message` is the **raw UTF-8 bytes** of the session message
string, Base64-encoded. Do NOT apply BCS-vector or intent-prefix before encoding —
the fullnode does this internally. The `bcs_vector` helper in `api_sessions.rs` is
used when computing the local Ed25519 digest, not when calling the GraphQL API.

**Errors:** The return type has only `success: Boolean`. There is no `errors` field
in `SignatureVerifyResult`. Rejection surfaces as a top-level GraphQL `errors` array
(e.g., `"errors": [{"message": "Issuer not supported", ...}]`).

**No new Cargo dependencies required** — `reqwest`, `serde_json`, and `base64`
are already present in the indexer's `Cargo.toml`.

**See also:** `indexer/src/bin/verify_signature_spike.rs` — a dev harness that
implements this exact request shape and includes an Ed25519 self-test fixture.

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
                         ← { success: true } or top-level GraphQL errors
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
epoch in that field. The Sui fullnode's `verifySignature` checks this bound.
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
3. `verify_zklogin_via_graphql` posts to the GraphQL endpoint using the confirmed
   `verifySignature` query (arguments: `message`, `signature`, `intentScope`,
   `author`). Checks `data.verifySignature.success == true`. GraphQL-level errors
   (`resp["errors"]` non-null) are treated as verification failure.
4. Add `EFREP_GRAPHQL_URL` env var. Default to
   `https://graphql.testnet.sui.io/` for testnet deployments.
5. On GraphQL error or timeout: return `503 Service Unavailable` (not 401) with body
   `{"error":"ZKLOGIN_VERIFIER_UNAVAILABLE","message":"zkLogin verification service is temporarily unavailable."}`.
6. No new Cargo dependencies required — `reqwest` and `serde_json` already present.
7. Ed25519 path: no changes.
8. Tests: unit-test the dispatch logic; integration-test the GraphQL path against the
   real Sui testnet endpoint (or a mock).

**Env var surface added:**
```
EFREP_GRAPHQL_URL=https://graphql.testnet.sui.io/
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

2. **Nonce timing — v1 tradeoff (explicit):**
   The v1 implementation consumes the nonce *before* calling the GraphQL verifier
   (current `consume_nonce` → `verify_personal_message` call order in `create_session`).
   This prevents replay unconditionally: even if the verifier call never completes, the
   nonce cannot be re-used by an attacker who observed it.

   **The UX cost:** if `verifySignature` times out or returns 503, the nonce is already
   spent. The operator must request a new nonce before retrying. This is acceptable for
   v1 — document it clearly in the operator console as "wallet verification timed out,
   please request a new challenge."

   **A future v2 improvement (not v1):**
   - Mark nonce as `verification_in_progress` rather than consuming it immediately
   - Call the verifier
   - Consume the nonce on success; restore to `pending` on verifier timeout/503
   - Rate-limit nonces per address to prevent farming: max N active nonces per address
   - On verifier outage, allow one retry per nonce within a short cooldown window

   This requires a more complex nonce state machine. Do not implement v2 until v1 is
   proven correct and the verifier uptime is understood.

3. **Address must match** — the GraphQL response must confirm the claimed address. The
   backend never issues a session for an address the fullnode did not verify.

4. **Scheme 401 is opaque** — all auth failures (invalid sig, unsupported scheme,
   issuer rejected) return the same body. No scheme, issuer, JWK, or proof details
   leak in 401 responses. Log internally with full context; surface nothing externally.

5. **zkLogin verification is opt-in** — only enabled when `EFREP_GRAPHQL_URL` is
   set. Deployments without the env var continue to reject zkLogin with 401.

6. **No frontend trust** — the GraphQL call is always server-side. The backend never
   accepts a "pre-verified" flag from the browser or any request body field.

---

## Gate: Live EVE Vault Test Required Before Implementation

**Production zkLogin session auth must not be implemented until a real EVE Vault
signature passes `verifySignature` on the testnet node.** The architecture is proven
viable; the only remaining blocker is the FusionAuth issuer question.

**Test procedure:**

```powershell
# 1. Get a challenge nonce from the live API
$nonce = (Invoke-RestMethod -Method POST `
  https://ef-indexer-production.up.railway.app/auth/nonce `
  -Body '{"address":"0x<eve-vault-addr>"}' `
  -ContentType application/json).nonce

# 2. In EVE Vault: sign the session message string with signPersonalMessage
#    Message: "FrontierWarden operator session\nAddress: 0x<addr>\nNonce: $nonce\nExpires: <ts>"
#    Copy the returned base64 signature.

# 3. Run the spike with the real signature
$env:SPIKE_ADDRESS    = "0x<eve-vault-addr>"
$env:SPIKE_MESSAGE_TEXT = "FrontierWarden operator session`nAddress: ..."
$env:SPIKE_SIGNATURE  = "<base64-zklogin-sig-from-eve-vault>"
cargo run --bin verify_signature_spike
```

**Expected success:**
```json
{ "data": { "verifySignature": { "success": true } } }
```

**Expected blocker (FusionAuth issuer not in testnet allowlist):**
```json
{ "errors": [{ "message": "...(issuer / JWK / unsupported provider)..." }] }
```

Record the exact error. If blocked: see Open Question 1 for fallback options.
Implementation may proceed only on confirmed `success: true` from an EVE Vault wallet.

---

## Implementation Contract for `codex/zklogin-session-auth-graphql`

_Do not open this branch until the live EVE Vault test confirms `success: true`._

### Scheme dispatch in `verify_personal_message`

```rust
fn verify_personal_message(
    message: &str,
    signature: &str,
    address: &str,
    graphql_url: Option<&str>,
) -> impl Future<Output = anyhow::Result<()>> {
    let bytes = base64::decode(signature)?;
    match bytes.first() {
        Some(0x00) => verify_personal_message_ed25519(message, signature, address),
        Some(0x05) => match graphql_url {
            Some(url) => verify_personal_message_zklogin_graphql(message, signature, address, url),
            None => Err(anyhow::anyhow!("zkLogin session auth not configured")),
        },
        Some(_) | None => Err(anyhow::anyhow!("unsupported signature scheme")),
    }
}
```

Schemes `0x01` (secp256k1), `0x02` (secp256r1), `0x03` (multisig), `0x06` (passkey)
remain rejected. The error message for all rejected paths is the same string:
`"unsupported signature scheme"` — caller receives an opaque 401.

### Error classification and HTTP status

| Condition | HTTP status | Response body |
|---|---|---|
| Invalid signature (Ed25519 or zkLogin) | 401 | `AUTH_FAILED` |
| Unsupported scheme byte | 401 | `AUTH_FAILED` |
| zkLogin issuer rejected by fullnode | 401 | `AUTH_FAILED` |
| zkLogin epoch expired | 401 | `AUTH_FAILED` |
| `verifySignature` returns GraphQL error (any) | 401 | `AUTH_FAILED` |
| GraphQL timeout (> 10s) | 503 | `ZKLOGIN_VERIFIER_UNAVAILABLE` |
| GraphQL connection refused / DNS failure | 503 | `ZKLOGIN_VERIFIER_UNAVAILABLE` |
| `EFREP_GRAPHQL_URL` not set and scheme is 0x05 | 401 | `AUTH_FAILED` |

**503 body:**
```json
{
  "error": "ZKLOGIN_VERIFIER_UNAVAILABLE",
  "message": "zkLogin verification service is temporarily unavailable. Try again shortly."
}
```

**401 body (all auth failure variants, including issuer rejection and bad signature):**
```json
{
  "error": "AUTH_FAILED",
  "message": "Invalid wallet signature"
}
```

Nothing scheme-specific, issuer-specific, or proof-specific appears in any 401 or
503 response body. Log full internal detail (scheme byte, GraphQL error message,
address, request traceId) at `WARN` level. Do not log the signature bytes.

### What NOT to expose externally

These must never appear in response bodies:

- Signature scheme (`ed25519`, `zkLogin`, `0x05`)
- Issuer URL (`test.auth.evefrontier.com`)
- JWK or prover details
- Proof parsing errors (`"Failed to parse BCS"`, etc.)
- GraphQL error messages from the fullnode
- Nonce state information

### `create_session` call order (v1)

```
1. normalize address
2. consume_nonce(req)          ← nonce spent here; 401 if expired/unknown
3. detect scheme byte
4. if 0x05: call verifySignature(graphql_url)
               ├─ success:true  → proceed to issue token
               ├─ success:false → 401 AUTH_FAILED
               ├─ GraphQL error → 401 AUTH_FAILED (log exact error internally)
               └─ network error → 503 ZKLOGIN_VERIFIER_UNAVAILABLE
5. issue session token
```

The nonce is consumed at step 2 regardless of what happens in step 4. On 503,
the operator must request a new nonce. Document this in the operator console:
_"Your wallet could not be verified. The verification service may be temporarily
unavailable. Wait a moment and try again — you will need a new challenge."_

---

## Open Questions (Not blocking, but relevant for implementation planning)

1. **FusionAuth issuer compatibility — HIGHEST PRIORITY:** The `iss` value in EVE
   Vault proofs will be `https://test.auth.evefrontier.com`. The Mysten testnet
   fullnode maintains a configurable allow-list of trusted zkLogin issuers. Whether
   FusionAuth/EVE Frontier is on that list is unknown. If `verifySignature` returns
   a GraphQL error like "Issuer not supported" or "Unknown issuer", the delegated
   path cannot be used against the public testnet node.
   **Action:** Run `verify_signature_spike` with a real EVE Vault signature and record
   the exact response. If the issuer is rejected, evaluate running a custom node that
   trusts the EVE Frontier FusionAuth issuer.

2. **Message encoding confirmed:** The GraphQL `message` argument is confirmed to be
   the **raw UTF-8 bytes** of the session message string, Base64-encoded. The fullnode
   applies BCS-vector and intent-prefix internally. The `bcs_vector` helper in
   `api_sessions.rs` is used for the local Ed25519 digest only, not for the GraphQL
   call.

3. **Epoch TTL vs session TTL:** If a user's zkLogin proof `max_epoch` is shorter than
   the session TTL (1 hour), the session may outlive the proof. This is acceptable
   (the bearer token is independent of the proof), but worth documenting in the
   operator console as expected behavior.

4. **JSON-RPC deprecation — WATCH ITEM:** Sui's JSON-RPC is being deprecated in favor
   of GraphQL, with a ~July 2026 target date. The indexer's `rpc.rs` uses JSON-RPC for
   all event fetching (checkpoints, FW protocol events, world gate events). A separate
   spike is needed to assess the GraphQL event subscription API as a replacement. This
   is independent of the session auth work but should be tracked on the roadmap.

---

## Spike Harness

`indexer/src/bin/verify_signature_spike.rs` implements the confirmed request shape.
Run modes:

```bash
# Mode 1 — self-test with generated Ed25519 key (no wallet required)
# Confirms endpoint reachability and request format
cargo run --bin verify_signature_spike

# Mode 2 — verify a real EVE Vault signature (requires wallet fixture)
SPIKE_ADDRESS=0x<addr> \
SPIKE_MESSAGE_TEXT="FrontierWarden operator session\nAddress: ..." \
SPIKE_SIGNATURE=<base64-sig> \
cargo run --bin verify_signature_spike

# Mode 3 — schema introspection (confirm field names on live node)
SPIKE_INTROSPECT=1 cargo run --bin verify_signature_spike
```

**Pending live results (requires EVE Vault wallet fixture):**
- Ed25519 self-test: _not yet run — outbound HTTP blocked on dev machine_
- zkLogin (EVE Vault) signature: _not yet run — no wallet fixture available_
- FusionAuth issuer: _unknown — see Open Question 1_

---

## References

- Sui zkLogin deep dive: https://blog.sui.io/zklogin-deep-dive/
- Sui zkLogin spec: https://docs.sui.io/concepts/cryptography/zklogin
- Sui GraphQL schema (canonical): `crates/sui-indexer-alt-graphql/schema.graphql` in MystenLabs/sui main
- Mysten fastcrypto repo: https://github.com/MystenLabs/fastcrypto
- Mysten zklogin-verifier: https://github.com/MystenLabs/zklogin-verifier
- Sui GraphQL RPC guide: https://docs.sui.io/guides/developer/advanced/graphql-rpc
- Sui testnet GraphQL endpoint: https://graphql.testnet.sui.io/
- EVE Vault GitHub: https://github.com/evefrontier/evevault
- EVE Frontier FusionAuth: https://test.auth.evefrontier.com
