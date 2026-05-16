# FrontierWarden Integration Guide for EVE Tool Builders

Last updated: 2026-05-16

This guide is for developers building EVE Frontier tools (tribe consoles, gate
control, route planners, bounty boards, cargo/counterparty tools) who want to
use FrontierWarden as a trust decision backend.

## Quick Start

Live API endpoint:

```
https://ef-indexer-production.up.railway.app
```

Health check:

```bash
curl https://ef-indexer-production.up.railway.app/health
```

Your first trust decision (no auth required for testnet demo):

```bash
curl -s https://ef-indexer-production.up.railway.app/v1/trust/evaluate \
  -H "content-type: application/json" \
  -d '{
    "entity": "0xYOUR_PILOT_WALLET",
    "action": "counterparty_risk",
    "context": {
      "schemaId": "TRIBE_STANDING",
      "minimumScore": 500
    }
  }'
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/trust/evaluate` | Primary trust decision endpoint |
| POST | `/v1/trust/explain` | Same evaluator (alias for evaluate) |
| POST | `/v1/cradleos/gate/evaluate` | Stable alias for gate-access decisions |
| GET | `/v1/trust/config` | Show default schema configuration |
| GET | `/health` | Uptime check (always unauthenticated) |

## Authentication

**Testnet demo:** Trust evaluation endpoints are currently unauthenticated with
rate limiting. You can call them directly.

**Server-to-server:** For production integrations, use an API key:

```bash
curl -s https://ef-indexer-production.up.railway.app/v1/trust/evaluate \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{ ... }'
```

Accepted auth headers:

```
x-api-key: <key>
Authorization: Bearer <key>
```

Do not put API keys in browser code. Use them from server-side services only.
Contact Justin.DavisWE@icloud.com for API key access.

## Actions

### gate_access

Evaluate whether a pilot should pass a specific gate.

```json
{
  "entity": "0xpilot_wallet",
  "action": "gate_access",
  "context": {
    "gateId": "0xGATE_POLICY_OBJECT_ID",
    "schemaId": "TRIBE_STANDING"
  }
}
```

`context.gateId` is **required** for this action.

Possible decisions: `ALLOW_FREE`, `ALLOW_TAXED`, `DENY`, `INSUFFICIENT_DATA`.

### counterparty_risk

Evaluate whether a pilot meets a trust threshold for a transaction.

```json
{
  "entity": "0xseller_wallet",
  "action": "counterparty_risk",
  "context": {
    "schemaId": "TRIBE_STANDING",
    "minimumScore": 600
  }
}
```

### bounty_trust

Evaluate whether a pilot is trustworthy enough for bounty work.

```json
{
  "entity": "0xhunter_wallet",
  "action": "bounty_trust",
  "context": {
    "schemaId": "TRIBE_STANDING",
    "minimumScore": 500
  }
}
```

## Response Format

Every successful evaluation returns this shape:

```json
{
  "apiVersion": "trust.v1",
  "action": "gate_access",
  "decision": "ALLOW_FREE",
  "allow": true,
  "confidence": 1.0,
  "reason": "ALLOW_FREE",
  "explanation": "TRIBE_STANDING score meets or exceeds this gate's ally threshold.",
  "subject": "0xpilot",
  "score": 750,
  "threshold": 500,
  "requirements": { "schema": "TRIBE_STANDING", "threshold": 500, "minimumPassScore": 1 },
  "observed": { "score": 750, "attestationId": "0x..." },
  "proof": {
    "subject": "0xpilot",
    "checkpoint": 331103766,
    "source": "indexed_protocol_state",
    "schemas": ["TRIBE_STANDING"],
    "attestationIds": ["0x..."],
    "txDigests": ["..."],
    "warnings": []
  }
}
```

Key fields for integrators:

| Field | Use |
|---|---|
| `allow` | Machine-readable boolean: pass or fail |
| `decision` | Stable decision code for UI display |
| `reason` | Stable reason code for programmatic logic |
| `proof` | Evidence bundle — display this instead of asking users to trust a score |
| `proof.warnings` | Data quality signals (see below) |

## Error Responses

### Validation errors (400)

```json
{
  "error": "VALIDATION_ERROR",
  "message": "context.gateId is required for gate_access",
  "field": "context.gateId"
}
```

### Internal errors (500)

```json
{
  "error": "INTERNAL_ERROR",
  "message": "An internal error occurred."
}
```

### Rate limited (429)

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. See Retry-After header."
}
```

Response headers on 429:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
Retry-After: 45
```

All successful responses also include `X-RateLimit-Limit` and
`X-RateLimit-Remaining` headers.

## Freshness Warnings

`proof.warnings` is an array of strings. On testnet, you may see:

| Warning | Meaning |
|---|---|
| `INDEXER_LAST_EVENT_STALE_SECONDS:<N>` | No new protocol event has been indexed for N seconds |
| `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:<N>` | The proof references an older checkpoint than the latest indexed |
| `PROOF_CHECKPOINT_UNKNOWN` | No checkpoint was associated with this decision |
| `INDEXER_CHECKPOINT_UNKNOWN` | Could not determine the indexer's latest checkpoint |

**Important:** On testnet, `INDEXER_LAST_EVENT_STALE_SECONDS` with a large
value (hours or days) typically means low protocol activity, not an outage. If
`/health` returns `200`, the indexer is running — it simply has no new events to
process. This is normal for testnet periods with low activity.

Freshness warnings do not flip `allow` to `false`. They are defensive metadata
for operators and integrators.

## CORS

The API supports cross-origin requests from configured origins. If you are
building a browser-based tool and need CORS access, contact us to add your
domain to the allowlist.

Server-side callers (Node.js, Rust, Python, etc.) are not affected by CORS.

## TypeScript SDK (trustkit)

A zero-dependency TypeScript client is available at `sdk/trustkit/` in the
repository. It is not yet published to npm but can be vendored:

```ts
import { createTrustkit } from '@frontierwarden/trustkit';

const trust = createTrustkit({
  endpoint: 'https://ef-indexer-production.up.railway.app',
  apiKey: process.env.EFREP_API_KEY, // optional for testnet
});

// Gate access check
const gate = await trust.evaluateGateAccess({
  entity: '0xpilot',
  gateId: '0xgate_policy_id',
});
if (gate.allow) {
  // pilot can pass
}

// Counterparty risk check
const seller = await trust.evaluateCounterpartyRisk({
  entity: '0xseller',
  minimumScore: 600,
});

// Bounty trust check
const hunter = await trust.evaluateBountyTrust({
  entity: '0xhunter',
  minimumScore: 500,
});
```

## Integration Pattern

FrontierWarden is a trust decision backend, not a UI framework. The recommended
integration pattern:

1. Your tool makes a trust decision request before a high-consequence action.
2. FrontierWarden returns a decision with a proof bundle.
3. Your tool displays the proof to the user (not just a score).
4. Your tool acts on `allow` / `decision` / `reason` programmatically.

This gives your users verifiable trust decisions without asking them to blindly
trust your app's database.

## What FrontierWarden Does NOT Provide

- User authentication (use your own wallet auth)
- Bulk wallet lookups or leaderboards (restricted by design)
- Social graph / relationship queries (restricted by design)
- Movement history or route tracking (restricted by design)

These restrictions are intentional. See `Documents/ADR_DATA_AGGREGATION_RISK.md`
for the security rationale.

## Support

- API issues: Justin.DavisWE@icloud.com
- Repository: contact maintainer for access
- Network: Sui testnet (Stillness)
