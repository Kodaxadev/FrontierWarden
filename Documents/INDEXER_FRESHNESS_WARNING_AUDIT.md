# Indexer Freshness Warning Audit

**Date:** 2026-05-20
**Branch:** `codex/indexer-freshness-warning-audit`
**Scope:** Trust API proof freshness warnings only. No ALLOW/DENY logic change.

## Trigger

Live Trust API smoke returned:

```text
decision: ALLOW_FREE
proof.checkpoint: 333478591
proof.warnings:
  PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:5782432
  INDEXER_LAST_EVENT_STALE_SECONDS:10680
```

Railway health at the same checkpoint was healthy:

```text
GET /health -> 200 OK
```

## Current Implementation

Freshness warnings are produced by `indexer/src/trust_freshness.rs`.

Current query:

```sql
SELECT MAX(checkpoint_seq)::BIGINT AS latest_checkpoint,
       EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::BIGINT AS latest_event_age_secs
FROM raw_events
```

Then:

- `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:<N>` is emitted when
  `MAX(raw_events.checkpoint_seq) > proof.checkpoint`.
- `INDEXER_LAST_EVENT_STALE_SECONDS:<N>` is emitted when no row has been added
  to `raw_events` for more than 300 seconds.

## Live Evidence

The proof checkpoint was:

```text
333478591
```

The warning implies latest indexed checkpoint:

```text
333478591 + 5782432 = 339261023
```

Live Sui testnet checkpoint query:

```powershell
sui_getLatestCheckpointSequenceNumber -> 339307858
```

Therefore, the indexed raw-event checkpoint was approximately:

```text
339307858 - 339261023 = 46835 checkpoints behind Sui testnet latest
```

That is not the same as the much larger proof delta. The large proof delta is
mostly because the proof references the policy and attestation events used to
make this specific decision, while `raw_events` has later unrelated indexed
events.

## Findings

### 1. Railway/API Is Not Down

`/health` returned `200 OK`, and `/v1/trust/evaluate` returned a valid
`ALLOW_FREE` response with MVR provenance.

### 2. `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX` Is Easy To Misread

This warning does **not** mean the indexer is millions of checkpoints behind the
chain. It means the proof inputs for this decision are older than the newest
event currently present in `raw_events`.

That can be normal when:

- the subject's latest attestation is old but still active,
- the gate policy has not changed recently,
- newer events are unrelated passage, topology, kill-mail, or other tracked
  events.

### 3. `INDEXER_LAST_EVENT_STALE_SECONDS` Measures Ingest Activity, Not Chain Health

This warning is based on `raw_events.created_at`, so it measures when the
FrontierWarden indexer last inserted a tracked event. It does not prove the Sui
fullnode is stale, Railway is unhealthy, or the Trust API decision is wrong.

On Stillness/testnet, long quiet periods can be normal because no tracked
FrontierWarden/world event may have occurred recently.

### 4. Confidence Is Currently Penalized By Ingest Quietness

`trust_response::compute_confidence` reduces confidence when
`INDEXER_LAST_EVENT_STALE_SECONDS` is present. The live `ALLOW_FREE` response
therefore returned:

```text
confidence: 0.7
```

This is defensible if the warning indicates an actual ingest stall, but it is
too blunt when the root cause is simply low tracked-event activity.

## Recommended Interpretation Today

For operators:

- Treat `ALLOW_FREE` as the current Trust API decision.
- Treat MVR provenance as the package/version proof of where the decision came
  from.
- Treat freshness warnings as data-quality context, not proof that Railway is
  down.
- Investigate freshness only when warnings grow unexpectedly while known new
  package/world events are being emitted.

## Recommended Follow-Up

### P1: Add a Read-Only Freshness Diagnostic Endpoint

Add a protected or low-risk read-only endpoint such as:

```http
GET /health/freshness
```

Suggested response:

```json
{
  "latestRawEventCheckpoint": 339261023,
  "latestRawEventAgeSeconds": 10680,
  "latestSuiCheckpoint": 339307858,
  "chainCheckpointLag": 46835,
  "latestEventType": "0x...::reputation_gate::PassageGranted",
  "latestEventTxDigest": "0x...",
  "meaning": "No tracked raw event has been inserted recently; API health is separate."
}
```

This would let operators distinguish:

- healthy API but quiet event stream,
- indexer cursor stall,
- Sui fullnode lag,
- proof-input age.

### P1: Split Warning Semantics

Keep existing warning strings for compatibility, but consider adding more
specific warnings later:

```text
PROOF_INPUT_OLDER_THAN_INDEX_HEAD:<N>
INDEXER_TRACKED_EVENT_QUIET_SECONDS:<N>
INDEXER_CHAIN_CHECKPOINT_LAG:<N>
```

### P2: Revisit Confidence Penalty

Do not remove confidence reduction blindly. First distinguish:

- **quiet but healthy:** no known tracked events are pending,
- **stalled:** new on-chain events exist for tracked filters but the DB did not
  advance,
- **unknown:** chain/latest checkpoint cannot be queried.

Only the stalled or unknown cases should strongly reduce confidence.

## Decision

No immediate ALLOW/DENY or proof schema change is recommended from this audit.
The current warnings are technically accurate but overloaded. The next safe code
slice is a read-only freshness diagnostic endpoint or internal health detail,
not a Trust API decision change.
