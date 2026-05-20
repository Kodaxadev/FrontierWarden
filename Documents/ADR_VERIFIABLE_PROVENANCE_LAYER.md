# ADR: FrontierWarden Verifiable Provenance Layer

**Status:** Accepted  
**Date:** 2026-05-20  
**Authors:** Kodaxa  
**Catalyst:** FC 2FaceMonkey review — "Keep FrontierWarden EVE Frontier specific, but add Sui/Mysten primitives that make it more verifiable."

---

## Decision

FrontierWarden remains EVE Frontier-specific. Sui/Mysten primitives are adopted
only to make trust decisions **auditable**, not to outsource them.

Three primitives are introduced in order:

| Primitive      | Purpose                                     | Slice      |
|----------------|---------------------------------------------|------------|
| **MVR**        | Human-readable package/version provenance   | **First**  |
| **Walrus**     | Signed policy/proof snapshot storage        | Second     |
| **Sui GraphQL**| Independent read-path verification          | Third      |

Each primitive has a strict non-responsibility: it does not make trust decisions,
calculate scores, bind gates, or grant authorization.

---

## Context

Current proof bundles reference raw `0x` package IDs:

```rust
// indexer/src/trust_types.rs — TrustProof (current)
pub struct TrustProof {
    pub gate_id: Option<String>,
    pub subject: String,
    pub checkpoint: Option<i64>,
    pub source: &'static str,         // "indexed_protocol_state"
    pub schemas: Vec<String>,
    pub attestation_ids: Vec<String>,
    pub tx_digests: Vec<String>,
    pub warnings: Vec<String>,
}
```

This is technically useful but not human-verifiable. An operator reviewing a
contested gate decision cannot tell which package version produced the result,
whether the policy rules have changed since, or whether the proof is replayable.

---

## MVR (Move Version Registry)

### What MVR does

- Registers the FrontierWarden Move package under `@kodaxa/frontierwarden`.
- Pins a specific package version in every proof bundle.
- Allows operators and third parties to verify which exact code produced a decision.

### What MVR does not do

- No trust decisions. MVR does not decide who is trustworthy.
- No score calculation. Scores come from indexed attestation state.
- No gate binding. Binding is an on-chain OwnerCap operation.
- No authorization. Authorization comes from GateAdminCap and FrontierWardenAuth.

### Proof bundle evolution

Current `TrustProof` gains a `provenance` section:

```rust
pub struct MvrProvenance {
    pub mvr_name: String,           // "@kodaxa/frontierwarden"
    pub package_id: String,         // "0xabc..."
    pub package_version: String,    // "1.2.0"
    pub module_name: String,        // "reputation_gate"
    pub function_name: String,      // "check_passage"
    pub source_digest: Option<String>,
    pub registry_checked_at: String,
}
```

This is additive — existing proof fields remain unchanged.

### Where provenance appears

| Surface                | How                                              |
|------------------------|--------------------------------------------------|
| Trust API response     | `proof.provenance` object in JSON response       |
| Gate passage proof     | Same — embedded in check_passage result          |
| Policy snapshot meta   | Stored alongside policy hash (future Walrus ref) |
| Frontend proof display | TrustResultPanel, GatePassagePreviewPanel        |

---

## Walrus (deferred to second slice)

### What Walrus stores

| Artifact                   | Store? | Why                                      |
|----------------------------|--------|------------------------------------------|
| Full policy snapshot       | Yes    | Proves exact rules at decision time      |
| Batch policy apply report  | Yes    | Operator-grade audit trail               |
| Gate passage proof bundle  | Maybe  | Useful for contested decisions           |
| UI state                   | No     | Too ephemeral                            |
| Every raw event            | No     | Too noisy/expensive                      |

### What Walrus does not do

Walrus does not make trust decisions or store mutable application state.

### Integration shape (target)

```rust
pub struct WalrusProofSnapshot {
    pub blob_id: String,
    pub root_hash: String,
    pub stored_at: String,
    pub retention_epochs: Option<u64>,
}
```

The on-chain or DB record references the Walrus blob:
```
policyHash → walrusBlobId → mvrName + packageVersion
```

Walrus becomes more valuable **after** MVR provenance fields are defined,
because the snapshot needs to reference which package/version produced it.

---

## Sui GraphQL (deferred to third slice)

### Read-path hardening tiers

1. **Primary app DB** — fast UI reads, cached gate state, batch job status.
2. **Sui GraphQL verification** — cross-check package/version/object state,
   pull transaction/checkpoint proof data.
3. **Walrus proof retrieval** — verify snapshot hash matches recorded policy hash.

### What GraphQL does not do

GraphQL does not replace the primary indexer. It provides an independent
verification path for operators who want to cross-check proof validity.

---

## Sponsored Writes

Sponsored writes remain **disabled by default**. FC's feedback is correct:
expanding sponsored writes to mutations introduces griefing risk (spam writes,
fraud challenge abuse, gas drain) that requires rate-limiting infrastructure.

Current state (unchanged):
- `check_passage` — sponsored (read-only proof verification)
- `create_gate`, `update_policy`, `withdraw_tolls` — wallet-signed
- `create_fraud_challenge`, `vote`, `resolve` — wallet-signed

Future enablement criteria:
- Per-wallet rate limit
- Per-tenant daily limit
- Fraud review flag
- Gas station economics reviewed

---

## Revised Product Thesis

> FrontierWarden is an EVE Frontier trust and gate-policy layer that lets
> operators define, apply, and verify access policies across world infrastructure.
> Sui primitives provide verifiable provenance: MVR proves which package/version
> produced a decision, Walrus stores signed policy/proof snapshots, and Sui
> GraphQL hardens read-path verification. FrontierWarden does not outsource
> trust decisions to these primitives; it uses them to make decisions auditable.

---

## Implementation Order

1. `codex/mvr-provenance-preflight` — this ADR + preflight checklist (current)
2. `feat(api): add MVR provenance fields to proof bundles` — Rust + TS types
3. `feat(frontend): display MVR provenance in proof panels` — UI
4. `feat(api): Walrus snapshot storage for policy/proof` — when MVR is stable
5. `feat(indexer): Sui GraphQL verification path` — when Walrus is stable
