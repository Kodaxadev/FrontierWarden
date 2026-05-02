# FrontierWarden — Event → Reputation Pipeline

Defines the narrowest verified path from an on-chain EVE event to a trust decision.

---

## Pipeline overview

```
[1] On-chain event emitted
       (EVE SmartAssembly / FrontierWarden Move contract)
              ↓
[2] Indexer polls Sui RPC (attestation / profile / reputation_gate modules)
       indexer/src/ingester.rs  →  tracing::info!("pipeline:ingest")
              ↓
[3] Processor writes attestations table
       indexer/src/processor/attestation.rs  →  tracing::info!("pipeline:attestation_indexed")
              ↓
[4] Oracle script issues attestation on-chain  ← MANUAL / SCRIPTED STEP
       scripts/gas-station.ts  POST /oracle/issue-attestation
       scripts/lib/oracle-actions.ts  buildIssueAttestationTx()
              ↓
[5] ScoreUpdated event emitted on-chain
       sources/profile.move  profile::update_score()
              ↓
[6] Processor upserts score_cache
       indexer/src/processor/profile.rs  →  tracing::info!("pipeline:score_cache_updated")
              ↓
[7] Trust evaluator reads score_cache + attestations
       indexer/src/trust_evaluator.rs  evaluate_gate_access() / evaluate_counterparty_risk()
              ↓
[8] Trust API returns ALLOW / ALLOW_TAXED / DENY + proof bundle
       indexer/src/api_trust.rs  POST /v1/trust/evaluate
```

---

## Step status

| Step | Automated | Notes |
|------|-----------|-------|
| 1 — on-chain event | ✅ On-chain | Triggered by player or contract action |
| 2 — indexer ingest | ✅ Automated | Polls every `poll_interval_ms`, resumable cursor |
| 3 — attestation indexed | ✅ Automated | `AttestationIssued` event → `attestations` table |
| 4 — oracle issuance | ⚠️ **Manual** | Currently invoked via `gas-station.ts` HTTP call or seed script. No automated EVE event → oracle trigger exists yet. |
| 5 — ScoreUpdated emitted | ✅ On-chain | Emitted by `profile::update_score` when oracle calls it |
| 6 — score_cache updated | ✅ Automated | `ScoreUpdated` event → `score_cache` UPSERT |
| 7 — trust evaluation | ✅ On-demand | API call from frontend or external consumer |
| 8 — trust response | ✅ On-demand | Includes proof bundle with checkpoint, tx digests, warnings |

---

## Narrowest working path (steps that are end-to-end automated today)

```
AttestationIssued event  →  attestations table  →  trust_evaluator (raw attestation path)
ScoreUpdated event       →  score_cache table   →  trust_evaluator (score_cache path)
```

The gap is at **step 4**: the oracle issues attestations via an HTTP call that must be
triggered externally. There is no automated bridge from an EVE game event to an oracle
attestation call.

---

## Trace log markers

Enable structured pipeline tracing with `RUST_LOG=info`:

```
pipeline:ingest            — ingester.rs    — per-module event batch processed
pipeline:attestation_indexed — attestation.rs — AttestationIssued written to DB
pipeline:score_cache_updated — profile.rs     — ScoreUpdated written to score_cache
```

Search logs:
```bash
journalctl -u efrep-indexer | grep "pipeline:"
# or on Railway:
railway logs | grep "pipeline:"
```

---

## Key file references

| Concern | File |
|---------|------|
| Indexer poll loop | `indexer/src/ingester.rs` |
| Attestation processor | `indexer/src/processor/attestation.rs` |
| Score cache processor | `indexer/src/processor/profile.rs` |
| Oracle PTB builder | `scripts/lib/oracle-actions.ts` |
| Oracle HTTP endpoint | `scripts/gas-station.ts` |
| Trust evaluation | `indexer/src/trust_evaluator.rs` |
| Trust API routes | `indexer/src/api_trust.rs` |
| Profile Move contract | `sources/profile.move` |
| Attestation Move contract | `sources/attestation.move` |
