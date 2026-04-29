# FrontierWarden Trust Decision API
# FrontierWarden Trust Decision API

Last updated: 2026-04-29

FrontierWarden exposes a small REST surface for EVE Frontier tools that need a
defensible trust decision backed by indexed Sui protocol state.

## Positioning

FrontierWarden exposes a proof-backed trust decision API for EVE Frontier tools.

## Endpoints

```http
POST /v1/trust/evaluate
POST /v1/trust/explain
POST /v1/cradleos/gate/evaluate
```

All three endpoints currently run the same evaluator. The CradleOS route is a
stable integration alias for gate-access decisions.

## Request

```json
{
  "entity": "0xplayer",
  "action": "gate_access",
  "context": {
    "gateId": "0xgate",
    "schemaId": "TRIBE_STANDING"
  }
}
```

Fields:

| Field | Required | Meaning |
|---|---:|---|
| `entity` | yes | Pilot wallet address being evaluated. Alias: `subject`. |
| `action` | yes | Current v0 action: `gate_access`. |
| `context.gateId` | yes | Indexed `GatePolicy` object ID. Alias: `gate`. |
| `context.schemaId` | no | Standing schema to use. Defaults to `TRIBE_STANDING`. |

## Response

```json
{
  "decision": "ALLOW_FREE",
  "allow": true,
  "tollMultiplier": 0,
  "tollMist": 0,
  "confidence": 1.0,
  "reason": "ALLOW_FREE",
  "explanation": "TRIBE_STANDING score meets or exceeds this gate's ally threshold.",
  "subject": "0xplayer",
  "gateId": "0xgate",
  "score": 750,
  "threshold": 500,
  "requirements": {
    "schema": "TRIBE_STANDING",
    "threshold": 500,
    "minimumPassScore": 1
  },
  "observed": {
    "score": 750,
    "attestationId": "0xattestation"
  },
  "proof": {
    "gateId": "0xgate",
    "subject": "0xplayer",
    "checkpoint": 331103766,
    "source": "indexed_protocol_state",
    "schemas": ["TRIBE_STANDING"],
    "attestationIds": ["0xattestation"],
    "txDigests": ["policy_tx", "attestation_tx"],
    "warnings": []
  }
}
```

## Freshness Warnings

`proof.warnings` is intentionally an array of strings so integrations can show
operator-facing caution without changing the allow/deny contract.

Current warning codes:

| Warning | Meaning |
|---|---|
| `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:<delta>` | The proof bundle is based on a checkpoint older than the latest event currently indexed. |
| `INDEXER_LAST_EVENT_STALE_SECONDS:<seconds>` | No raw event has been indexed for more than five minutes. |
| `PROOF_CHECKPOINT_UNKNOWN` | The decision was produced without a concrete proof checkpoint. |
| `INDEXER_CHECKPOINT_UNKNOWN` | The API could not determine the indexer's latest checkpoint. |

Freshness warnings do not currently flip `allow` to `false`. They are defensive
metadata for operators and external tools.

## Decisions

| Decision | Meaning |
|---|---|
| `ALLOW_FREE` | Subject has an active standing attestation with score at or above the gate's ally threshold. |
| `ALLOW_TAXED` | Subject has positive standing below the ally threshold. Passage is allowed with the gate's base toll. |
| `DENY` | Subject cannot pass under current indexed state. |
| `INSUFFICIENT_DATA` | FrontierWarden cannot produce a protocol-backed decision for the request. |

## Reason Codes

These are the v0 public integration codes. Do not rename them casually; external
tools may key UI and policy behavior off these strings.

```ts
type TrustReason =
  | "ALLOW_FREE"
  | "ALLOW_TAXED"
  | "DENY_SCORE_BELOW_THRESHOLD"
  | "DENY_NO_STANDING_ATTESTATION"
  | "DENY_GATE_PAUSED"
  | "DENY_GATE_HOSTILE"
  | "DENY_ATTESTATION_REVOKED"
  | "DENY_ATTESTATION_EXPIRED"
  | "ERROR_GATE_NOT_FOUND"
  | "ERROR_UNSUPPORTED_ACTION";
```

Currently emitted in v0:

- `ALLOW_FREE`
- `ALLOW_TAXED`
- `DENY_SCORE_BELOW_THRESHOLD`
- `DENY_NO_STANDING_ATTESTATION`
- `ERROR_GATE_NOT_FOUND`
- `ERROR_UNSUPPORTED_ACTION`

Reserved for protocol/indexer expansion:

- `DENY_GATE_PAUSED`
- `DENY_GATE_HOSTILE`
- `DENY_ATTESTATION_REVOKED`
- `DENY_ATTESTATION_EXPIRED`

Important protocol detail:

Positive scores below `threshold` are not denied. The Move gate contract treats
them as neutral/taxed passage. `DENY_SCORE_BELOW_THRESHOLD` is used only when
the observed score is below the minimum pass score, currently `1`.

## Curl Examples

Local development assumes Vite proxies `/api` to the Rust API. Direct Rust API
examples use `http://localhost:3000`.

### Example: Allow-Free Decision

```bash
curl -s http://localhost:3000/v1/trust/evaluate \
  -H "content-type: application/json" \
  -d '{
    "entity": "0xALLOW_EXAMPLE",
    "action": "gate_access",
    "context": {
      "gateId": "0xGATE_EXAMPLE",
      "schemaId": "TRIBE_STANDING"
    }
  }'
```

Expected core result:

```json
{
  "decision": "ALLOW_FREE",
  "allow": true,
  "reason": "ALLOW_FREE",
  "score": 750,
  "threshold": 500
}
```

### Example: Denied Decision

```bash
curl -s http://localhost:3000/v1/cradleos/gate/evaluate \
  -H "content-type: application/json" \
  -d '{
    "entity": "0xDENY_EXAMPLE",
    "action": "gate_access",
    "context": {
      "gateId": "0xGATE_EXAMPLE"
    }
  }'
```

Expected core result until this wallet receives a `TRIBE_STANDING` attestation:

```json
{
  "decision": "DENY",
  "allow": false,
  "reason": "DENY_NO_STANDING_ATTESTATION",
  "score": null,
  "threshold": 500
}
```

## Integration

FrontierWarden is designed to complement existing EVE Frontier tools by providing a deterministic, proof-backed decision engine.

```text
FrontierWarden exposes POST /v1/cradleos/gate/evaluate, returning
allow/deny/toll decisions from live indexed reputation state with proof fields.
```

For more details on specific integrations, please contact the maintainers.
