# FrontierWarden Updated Roadmap

Last updated: 2026-04-29

## Current Baseline

FrontierWarden is now a working trust-protocol prototype on Sui testnet.
The strongest surface is the protocol plus indexer/API spine:

- Move test suite passes `38/38` with `sui move test --build-env testnet`.
- Current upgraded package: `0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2`.
- Original package/type origin: `0xfd1b1315f9002b65ac2a214d2b7d312db75836c8e67f8f00a747206b5a61876c`.
- Active address manifest: `scripts/testnet-addresses.json`.
- Active operations note: `Documents/TESTNET_NOTES.md`.
- Upgrade proof tx: `5818FL8UHSiUvMYsWycLFDEudRtEAQNpm4eQuKoGGpaa`.
- The frontend build passes and all current operator tabs compile.
- The release indexer is running against Supabase through `EFREP_DATABASE_URL`.
- Supabase public `anon` and `authenticated` table/function grants are revoked; the Rust API is the controlled read surface.
- `raw_events` is replay-safe through `raw_event_dedup`, while projections can still be replayed to repair handler bugs.

Live proven flows:

- Sponsored `SEAL & COMMIT` gate policy update.
- Sponsored `check_passage`, indexed into `gate_passages`.
- Sponsored `withdraw_tolls`, indexed into `toll_withdrawals`.
- Schema/oracle/profile/attestation/vouch seed data.
- API-backed schema, oracle, profile, vouch, gate, passage, withdrawal, attestation, leaderboard, and challenge routes.
- Trust decision API v0:
  - `POST /v1/trust/evaluate`
  - `POST /v1/trust/explain`
  - `POST /v1/cradleos/gate/evaluate`
  - Live smoke proof: Slush `TRIBE_STANDING` returns `ALLOW_FREE`; the EVE wallet currently returns `DENY` with `NO_STANDING_ATTESTATION`.
- Trust API integration docs now live at `Documents/TRUST_API.md`.
- Local TypeScript client now lives at `sdk/trustkit`.
- Frontend has a `TRUST` tab for direct API demos.

## Wallet And Currency Note

Primary game wallet for EVE Frontier work:

```text
0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f
```

This EVE Wallet should become the default game-context wallet for future
in-game/browser integration tests. Current test flows still use SUI because no
EVT balance is available. Later toll/payment work must abstract the payment
coin instead of assuming SUI-only economics.

Evidence and caution:

- EVE Frontier's roadmap states Sui migration/testnet first, then `$EVE` on Sui mainnet later. Source: [EVE Frontier Roadmap](https://whitepaper.evefrontier.com/development-update-and-roadmap/eve-frontier-roadmap).
- The wallet currently showing EVT is a useful runtime signal, but token symbol, coin type, and production payment semantics should be verified against live wallet metadata or official EVE Frontier contracts before hardcoding.

## Verified Competitive Context

### CradleOS

CradleOS is broad tribe/civilization infrastructure, not just a gate tool.
Its README claims:

- 24 Move modules and 6,533 lines of Move code.
- Live Sui testnet v5 deployment.
- Full dApp for web and EVE Frontier in-game browser.
- 34 panels.
- EVE Vault wallet integration.
- Economy, defense, infrastructure, social, Keeper AI, and data/model assets.
- CradleOS took first place in the EVE Frontier x Sui 2026 hackathon.

Sources:

- [CradleOS GitHub](https://github.com/r4wf0d0g23/CradleOS)
- [EVE Frontier hackathon winners announcement](https://evefrontier.com/en/news/eve-frontier-sui-2026-hackathon-winners-announcement)

Decision:

Do not compete with CradleOS on breadth. Their lane is the operating console.
FrontierWarden's lane should be trust decisions with proof.

### CivilizationControl

CivilizationControl is closer to infrastructure/gate-control territory. Its
README shows:

- Sui Move extension package on Stillness/testnet.
- React 19 + TypeScript + Vite frontend.
- `@evefrontier/dapp-kit` / EveVault wallet stack.
- Browser-side Sui JSON-RPC reads.
- Optional Cloudflare Worker sponsor signer.
- Owner-capability model for structure administration.
- Gate owner-cap borrowing/returning inside a single PTB.

Source:

- [CivilizationControl GitHub](https://github.com/Diabolacal/CivilizationControl)

Decision:

Do not race CivilizationControl on structure management breadth. Integrate with
that category by exposing reputation-backed evaluation endpoints.

Local research copies:

- `research/CradleOS`
- `research/CivilizationControl`
- CivilizationControl patterns to reuse: EVE coin discovery/selection in `src/lib/currency.ts`, sponsor-with-wallet-fallback in `src/hooks/useSponsoredExecution.ts`, and runtime-package vs original-type-origin separation in `config/chain/stillness.ts`.

## Strategic Repositioning

Old risk:

```text
FrontierWarden becomes a smaller, less complete tribe dashboard.
```

New position:

```text
CradleOS runs the tribe. FrontierWarden tells the tribe who to trust.
```

Product thesis:

```text
FrontierWarden is the trust engine other EVE Frontier tools call when a
decision has consequences.
```

The high-leverage wedge is a narrow API and SDK that answers:

- Should this pilot pass a gate?
- Should this pilot be taxed?
- Should this bounty poster be trusted?
- Should this cargo counterparty be trusted?
- Should this scout report be believed?
- Which on-chain evidence supports the decision?

## Seven-Day Wedge

Goal:

```text
Any EVE Frontier tool can call one endpoint and receive a
reputation-backed trust decision with proof.
```

### Day 1: Trust Evaluation API

Status: shipped v0 on 2026-04-29.

Add:

```text
POST /v1/trust/evaluate
POST /v1/cradleos/gate/evaluate
```

Minimum request:

```json
{
  "entity": "0xplayer",
  "action": "gate_access",
  "context": {
    "gateId": "0xgate",
    "tribeId": "optional",
    "systemId": "optional"
  }
}
```

Minimum response:

```json
{
  "decision": "ALLOW_FREE",
  "allow": true,
  "tollMultiplier": 0,
  "confidence": 0.82,
  "reason": "ALLY_SCORE_MET",
  "explanation": "TRIBE_STANDING score meets this gate policy.",
  "proof": {
    "checkpoint": 331269067,
    "schemas": ["TRIBE_STANDING"],
    "attestationIds": ["0x..."],
    "txDigests": ["..."]
  }
}
```

Implemented v0 response fields:

- `decision`: `ALLOW_FREE`, `ALLOW_TAXED`, `DENY`, or `INSUFFICIENT_DATA`.
- `allow`: boolean gate result.
- `tollMultiplier`: `0` for ally/free, `1` for neutral/taxed, `null` when denied or insufficient.
- `tollMist`: actual base toll in MIST for neutral passage.
- `confidence`: deterministic `1.0` when policy plus active attestation prove the result, `0.0` when required data is missing.
- `reason`: machine-readable reason code.
- `explanation`: concise human explanation.
- `subject`, `gateId`, `score`, `threshold`.
- `proof`: checkpoint, schemas, attestation IDs, tx digests, warnings.

### Day 2: Real Score Inputs

Status: partially shipped in v0.

Use:

- `score_cache`
- subject attestations
- gate policy
- latest gate config

No mock trust decisions in API responses.

Current implementation uses live subject attestations and latest indexed gate
config. It does not yet use `score_cache` for profile-level credit decisions;
that remains part of the counterparty/bounty expansion.

### Day 3: Gate Intel Inputs

Fold in active operational schemas:

- `GATE_HOSTILE`
- `GATE_CAMPED`
- `GATE_CLEAR`
- `GATE_TOLL`
- `HEAT_TRAP`
- `ROUTE_VERIFIED`
- `SYSTEM_CONTESTED`

### Day 4: Proof Object

Every decision must include:

- schemas consulted
- attestation IDs
- tx digests
- checkpoint
- stale-data warnings when applicable

### Day 5: TypeScript SDK

Add:

```text
packages/trust-sdk
```

Initial API:

```ts
trust.evaluateGateAccess(...)
trust.evaluateCounterparty(...)
trust.explainDecision(...)
```

### Day 6: Demo Page

Build a narrow public demo:

- paste pilot address
- paste gate ID
- click evaluate
- show allow/deny/toll
- show proof and explanation

### Day 7: Integration README

Publish:

```text
FrontierWarden Trust Decision API
For CradleOS, CivilizationControl, Blood Contract, and tribe tools.
```

Tone:

```text
FrontierWarden complements tribe operating consoles; it does not replace them.
```

## Phase 1: Keep The Backend Truthful

Status: mostly complete.

Done:

- Track all protocol modules.
- Project `reputation_gate` config/passages/withdrawals.
- Project fraud challenge create/resolve paths.
- Add API route modules under the 400-line cap.
- Lock Supabase public browser roles.
- Add raw event replay dedup.
- Enrich missing Sui event checkpoints through transaction block lookup.

Next:

- Add indexer replay CLI for a module or tx digest.
- Add projection repair commands.
- Add `cargo clippy --all-targets --all-features` to acceptance.

## Phase 2: Trust Decision API

Status: v0 shipped; expand next.

Done:

- `trust_evaluator` Rust module.
- `/v1/trust/evaluate`.
- `/v1/trust/explain`.
- `/v1/cradleos/gate/evaluate`.
- `Decision`, `ReasonCode`, and proof bundle response shape.
- `requirements`, `observed`, and `proof.source` explanation fields.
- `Documents/TRUST_API.md`.
- `sdk/trustkit` TypeScript client.
- Frontend `TRUST` demo tab.
- Seeded HTTP route tests for:
  - `ALLOW_FREE`
  - `ALLOW_TAXED`
  - `DENY_NO_STANDING_ATTESTATION`
  - `DENY_SCORE_BELOW_THRESHOLD`
  - `ERROR_GATE_NOT_FOUND`
  - `ERROR_UNSUPPORTED_ACTION`
- Proof freshness warnings:
  - `PROOF_CHECKPOINT_BEHIND_LATEST_INDEX:<delta>`
  - `INDEXER_LAST_EVENT_STALE_SECONDS:<seconds>`
  - `PROOF_CHECKPOINT_UNKNOWN`
  - `INDEXER_CHECKPOINT_UNKNOWN`
- Smoke tested against live Supabase/indexer data:
  - Slush `0x9cc0...20e1` against gate `0xb63c...3e36` returns `ALLOW_FREE`, score `750`, threshold `500`.
  - EVE wallet `0xabff...430f` currently returns `DENY`, reason `NO_STANDING_ATTESTATION`.
- Rust tests cover reason classification, proof checkpoint selection, tx digest dedupe, and the real Axum HTTP route surface.

Still build:

- Counterparty/bounty evaluation using `score_cache`.
- Route-level docs/examples for warning interpretation in partner tools.

Completion bar:

An external app can call FrontierWarden and receive a deterministic trust
decision with enough proof to audit it. Gate-access v0 now clears this bar;
non-gate trust actions still need implementation.

## Phase 3: Frontend As Proof Console

Status: functional, but no longer the main strategic race.

Keep:

- Gate Intel
- Reputation
- Policy
- Oracle
- Social
- Disputes

Add:

- Trust API demo tab.
- EVE Wallet detection as first-class path.
- SUI now, EVT/payment-coin abstraction later.
- Wallet-authenticated frontend access after API auth design.

Do not add broad CradleOS-like panels unless they directly prove trust logic.

## Phase 4: Operator And Protocol Workflows

Status: mostly functional.

Keep hardening:

- Schema register/deprecate.
- Oracle register/authorize.
- Attestation issue/revoke.
- Profile create.
- Vouch create/redeem.
- Challenge open/vote/resolve.
- Gate policy update.
- Toll withdrawal.

Deferred:

- Full loan origination UX, because current protocol shape needs a multi-party flow.

## Phase 5: SDK And Integrations

Build:

- TypeScript SDK.
- CradleOS-shaped adapter endpoint.
- Keeper-compatible tool schema:

```text
frontierwarden_assess_trust(entity, action, context)
```

Return:

- decision
- confidence
- explanation
- recommended policy
- proof bundle

## Phase 6: Production Hardening

Required:

- API authentication.
- Wallet-signed session model.
- Rate limits.
- Observability.
- Query budgets and pagination review.
- Supabase backups/migration runbook.
- Move entrypoint security review.
- Payment coin abstraction for SUI vs EVT/EVE-token flows.
- Public docs with source-of-truth package IDs.

## Deprioritized For Now

Do not spend the next sprint on:

- broad bounty marketplace
- cargo board
- SRP clone
- general tribe OS dashboard
- DEX
- large route planner
- large AI assistant surface
- lore/wiki/recruiting

Those are breadth plays. They favor teams already building operating consoles.

## Recommended Build Order

1. Add wallet-authenticated API/frontend access.
2. Add EVT/payment-coin abstraction.
3. Expand evaluation beyond gates into bounty/counterparty/scout-report decisions.
4. Publish integration examples for CradleOS/CivilizationControl maintainers.

North star:

```text
Make FrontierWarden the proof-backed trust backend other EVE Frontier tools
would rather call than rebuild.
```
