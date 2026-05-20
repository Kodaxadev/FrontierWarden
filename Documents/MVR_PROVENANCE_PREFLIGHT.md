# MVR Provenance Preflight

**Branch:** `codex/mvr-provenance-preflight`  
**Date:** 2026-05-20  
**Prerequisite for:** `feat(api): add MVR provenance fields to proof bundles`

---

## 1. MVR Name Target

```
@kodaxa/frontierwarden
```

Registration via the Mysten MVR CLI or dashboard. The name must be claimed
before any proof bundle can reference it.

### Registration checklist

- [ ] Verify `@kodaxa` namespace is available on MVR testnet
- [ ] Register `@kodaxa/frontierwarden` pointing to current testnet package ID
- [ ] Confirm resolution: `mvr resolve @kodaxa/frontierwarden` returns correct `0x` address
- [ ] Document the registration tx digest

---

## 2. Provenance Fields

Fields added to `TrustProof` (Rust) and `TrustProof` (TypeScript):

| Field                  | Type              | Required | Source                          |
|------------------------|-------------------|----------|---------------------------------|
| `mvrName`              | `String`          | Yes      | Config: `EFREP_MVR_NAME`       |
| `mvrVersion`           | `String`          | Yes      | Config: `EFREP_MVR_VERSION`    |
| `packageId`            | `String`          | Yes      | Config: `EFREP_PACKAGE_ID` (existing) |
| `moduleName`           | `String`          | Yes      | Hardcoded per evaluator path    |
| `functionName`         | `String`          | Yes      | Hardcoded per evaluator path    |
| `sourceDigest`         | `Option<String>`  | No       | Build-time embed or config      |
| `registryCheckedAt`    | `Option<String>`  | No       | Timestamp of last MVR resolution|

### Rust struct

```rust
// indexer/src/trust_types.rs — new struct

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MvrProvenance {
    pub mvr_name: String,
    pub mvr_version: String,
    pub package_id: String,
    pub module_name: String,
    pub function_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry_checked_at: Option<String>,
}
```

### TypeScript interface

```typescript
// frontend/src/types/api.types.ts — new interface

export interface MvrProvenance {
  mvrName: string;
  mvrVersion: string;
  packageId: string;
  moduleName: string;
  functionName: string;
  sourceDigest?: string;
  registryCheckedAt?: string;
}
```

### TrustProof extension

```rust
// Additive — existing fields unchanged

pub struct TrustProof {
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provenance: Option<MvrProvenance>,
}
```

---

## 3. Where Provenance Appears

### Backend (indexer)

| Evaluator path            | `moduleName`        | `functionName`       |
|---------------------------|---------------------|----------------------|
| `trust_eval_gate.rs`      | `reputation_gate`   | `check_passage`      |
| `trust_eval_score.rs`     | `attestation`       | `evaluate_score`     |
| `trust_response.rs`       | (set by caller)     | (set by caller)      |

Provenance is constructed once per evaluation from config and passed into
`proof()` and `proof_counterparty()` builders.

### Frontend

| Component                 | Display                                         |
|---------------------------|-------------------------------------------------|
| `TrustResultPanel`        | Show `mvrName@mvrVersion` in proof section      |
| `GatePassagePreviewPanel` | Show package provenance below decision           |
| `PolicyView`              | Show policy source provenance in snapshot strip  |

### API response example

```json
{
  "proof": {
    "gateId": "0xgate...",
    "subject": "0xsubject...",
    "checkpoint": 308300000,
    "source": "indexed_protocol_state",
    "schemas": ["TRIBE_STANDING"],
    "attestationIds": ["0xatt..."],
    "txDigests": ["0xtx..."],
    "warnings": [],
    "provenance": {
      "mvrName": "@kodaxa/frontierwarden",
      "mvrVersion": "1.0.0",
      "packageId": "0xabc...",
      "moduleName": "reputation_gate",
      "functionName": "check_passage"
    }
  }
}
```

---

## 4. What MVR Does Not Do

| Responsibility               | Owner                    | NOT MVR |
|------------------------------|--------------------------|---------|
| Trust decisions              | `trust_eval_gate.rs`     | x       |
| Score calculation            | Indexed attestation state| x       |
| Gate binding                 | OwnerCap on-chain op     | x       |
| Authorization                | GateAdminCap / FWAuth    | x       |
| Policy rule definition       | Operator via PolicyView  | x       |
| Attestation issuance         | Oracle registry          | x       |

MVR proves **which code** produced the decision. It does not influence **what**
the decision is.

---

## 5. Implementation Blockers

### Registration process

- **Blocker:** MVR namespace `@kodaxa` must be claimed on testnet.
- **Action:** Register via MVR CLI. If namespace is taken, fall back to
  `@frontierwarden` or `@kodaxadev`.
- **Dependency:** MVR testnet availability and registration tooling.

### Versioning convention

- **Decision needed:** Semantic versioning (`1.0.0`) or Sui package version
  (integer upgrade counter)?
- **Recommendation:** Use semver for the MVR name, store Sui package upgrade
  version separately. The `mvrVersion` field is the human-readable semver.
  The `packageId` is the on-chain canonical reference.
- **First version:** `1.0.0` (current testnet deploy).

### SDK resolver support

- **Question:** Does the frontend need to resolve MVR names at runtime?
- **Answer:** No. The backend resolves at startup and embeds provenance in
  proof bundles. Frontend reads the `provenance` object from the API response.
- **Future:** Frontend could optionally verify MVR resolution against the
  registry as a trust-but-verify step.

### Backend config names

New environment variables:

| Variable              | Example                       | Required |
|-----------------------|-------------------------------|----------|
| `EFREP_MVR_NAME`     | `@kodaxa/frontierwarden`      | Yes      |
| `EFREP_MVR_VERSION`  | `1.0.0`                       | Yes      |
| `EFREP_PACKAGE_ID`   | `0xabc...` (already exists)   | Yes      |

These are **not** VITE_ vars. They live in the indexer config, not the frontend
bundle. The frontend receives provenance through the Trust API response.

### Frontend display

- `TrustResultPanel`: Add a "Provenance" row showing `mvrName@mvrVersion`.
- `GatePassagePreviewPanel`: Add provenance line below decision.
- No new env vars needed — provenance comes from the API response.

### Config file changes

```toml
# indexer/config.example.toml — new section

[provenance]
mvr_name = "@kodaxa/frontierwarden"
mvr_version = "1.0.0"
# source_digest is optional — set from build pipeline if available.
# source_digest = "sha256:abc..."
```

---

## 6. Next Branch

After this preflight lands:

```
feat(api): add MVR provenance fields to proof bundles
```

Scope:
1. Add `MvrProvenance` struct to `trust_types.rs`
2. Add `provenance: Option<MvrProvenance>` to `TrustProof`
3. Load provenance config in indexer startup
4. Pass provenance into `proof()` and `proof_counterparty()` builders
5. Add `MvrProvenance` interface to `api.types.ts`
6. Display provenance in `TrustResultPanel` and `GatePassagePreviewPanel`

No Walrus. No GraphQL rewrite. No sponsored-write changes.
MVR is the spine; everything else hangs off it.
