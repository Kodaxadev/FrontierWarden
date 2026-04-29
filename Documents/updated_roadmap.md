# FrontierWarden Updated Roadmap

## Current Baseline

The project has crossed from concept into a credible infrastructure prototype.
The Move protocol is the strongest part of the system: profiles, schema
registry, oracle registry, attestations, vouching, lending, fraud challenges,
system SDK helpers, singleton attestations, and reputation-gated passage are all
implemented. The current Move suite passes 36/36 tests with:

```bash
sui move test --build-env testnet
```

The frontend now builds, the indexer tracks all 10 protocol modules, and the
docs now state the current network posture:

- Active Sui client environment: `testnet`
- Move dependency build environment: `testnet`

The remaining work is product completion: broad live frontend data, operator
workflows, smart-gate demo paths, and production hardening.

Latest implementation pass:

- `reputation_gate` and `fraud_challenge` events now have typed indexer
  processors.
- Gate passage/config and fraud challenge projections now have database
  migrations.
- The API exposes gates, gate policy, gate passages, challenges, and
  oracle-specific challenges.
- The frontend has typed fetchers and a live-data adapter for the
  FrontierWarden gate view, with static design data kept as the empty-indexer
  fallback.
- The header now reports live indexed checkpoint freshness instead of a
  hardcoded block, and the frontend bundle is split into app, React, and dapp
  chunks.
- A first GUI/UX hardening pass added compact live-state badges, better
  responsive behavior, horizontal table safety, and clearer disabled-action
  affordances.
- The testnet package, schema registry, oracle registry, gate policy, live
  schema registration, oracle seed, and killboard singleton feed are wired.
- Indexer database credentials now load from `EFREP_DATABASE_URL`; checked-in
  config must not contain live database URLs.

---

## Phase 1: Truthful Live Backend

Goal: make the indexer and API represent the real protocol surface.

### Gate Projections

Add typed projections for `reputation_gate` events:

- [done] Gate threshold/policy updated
- [done] Passage granted
- [done] Passage denied
- [blocked by protocol events] Gate created
- [blocked by protocol events] Toll charged as a standalone event
- [blocked by protocol events] Gate paused/unpaused
- [blocked by protocol events] Toll withdrawal

### Fraud Challenge Projections

Add typed projections for `fraud_challenge` events:

- [done] Challenge created
- [done] Challenge resolved
- [done] Verdict, status, challenged oracle, challenged attestation, and slash amount
- [blocked by protocol events] Vote cast
- [blocked by protocol events] Challenge deleted

### API Endpoints

Add REST endpoints for the projected data:

```text
GET /gates
GET /gates/:id
GET /gates/:id/passages
GET /gates/:id/policy
GET /challenges
GET /challenges/:id
GET /oracles/:address/challenges
```

Current status:

- [done] `GET /gates`
- [done] `GET /gates/:id`
- [done] `GET /gates/:id/passages`
- [done] `GET /gates/:id/policy`
- [done] `GET /challenges`
- [done] `GET /challenges/:id`
- [done] `GET /oracles/:address/challenges`

### Completion Bar

The dashboard can ask the backend what happened at gates and in fraud disputes
without manually reading raw events.

---

## Phase 2: Replace Mock Frontend Data

Goal: turn the strong visual shell into a live product.

The current `frontend/src/components/features/frontierwarden/fw-data.ts` is
mock/static design data. Replace it tab by tab with live hooks.

### Gates Tab

- [in progress] Live gate intel
- [done] Live passage history drilldown
- [in progress] Gate policy status
- [in progress] Toll state
- [done] Last indexed checkpoint/freshness

### Reputation Tab

- [done] Live profile scores
- [done] Live attestations
- [done] Live vouches
- [done] Score freshness and issuer proof

### Killboard Tab

- [done] Start with `SHIP_KILL` attestations
- [done] Show verified/unverified status
- [done] Show oracle issuer and transaction proof

### Policy Tab

- [done] Display live gate policy first
- [pending] Add policy editing after read path is solid

### Contracts Tab

- [done] Keep polished demo fallback until bounty/mercenary contracts exist
- [done] Connect first live path to `PLAYER_BOUNTY` attestations
- [pending] Contract marketplace data beyond bounty attestations

### Completion Bar

A user can open the app and see live protocol state, not just the intended
product story.

---

## Phase 3: Operator Workflows

Goal: make FrontierWarden usable by protocol admins, tribes, and oracles without
hand-written CLI calls.

Build screens and actions for:

- Registering schemas
- Deprecating schemas
- Registering oracles
- Viewing oracle authorized schemas
- Submitting intel attestations
- Viewing and revoking attestations
- Creating profiles
- Viewing vouches
- Creating vouches
- Issuing loans
- Repaying loans
- Marking defaults
- Opening fraud challenges
- Voting on fraud challenges
- Resolving fraud challenges
- Viewing gate policies

### Completion Bar

A devnet operator can run normal protocol workflows from the UI.

---

## Phase 4: Smart Gate Product Demo

Goal: make the killer feature demonstrable end to end.

Build a real Smart Gate experience around `reputation_gate.move`:

- [done] Select pilot/profile
- [done] Select gate
- [done] Simulate passage result
- [done] Show allow/deny/toll outcome
- [done] Explain which score or attestation caused the result
- [done] Show transaction digest and attestation proof
- [done] Show live passage history
- [done] Add policy update transaction flow
- [pending] Add toll withdrawal flow

### Completion Bar

You can demo: "this pilot is denied or tolled because of live on-chain
reputation," with transaction proof.

---

## Phase 5: Killboard And Intelligence Layer

Goal: move from reputation protocol to tribal intel product.

Start with the data already available on-chain:

- Use `SHIP_KILL` attestations as the first killboard source
- Filter by system, tribe, attacker, victim, and verification state
- Add route planner risk weighting from live intel schemas
- Add tribe standing overlays
- Add scout accuracy scoring

Later integrations:

- EVM/MUD ingestion
- External bootstrap data
- Rich killmail parsing
- Historical EF-Map style data import if legally and technically acceptable

### Completion Bar

The app becomes useful as a live tactical tool, not only a protocol explorer.

---

## Phase 6: Economic Layer

Goal: implement the revenue-facing systems.

Build:

- Bounty placement flow from `PLAYER_BOUNTY`
- Contract board for bounty, escort, gate-hold, and intel tasks
- Fee accounting
- Oracle licensing/admin controls
- Gate toll analytics
- Tribe-level premium intel controls

### Completion Bar

There is a real path from protocol activity to monetizable product usage.

---

## Phase 7: Production Hardening

Goal: prepare for public use.

Required work:

- Governance transfer away from deployer admin
- Rate limits and API auth where needed
- Error observability
- Indexer replay tooling
- Database migrations for gate/challenge projections
- Frontend loading, error, and empty states
- Frontend bundle split and stale header checkpoint cleanup
- Devnet reset runbook
- Security review of Move entrypoints
- Decision on long-term devnet vs testnet deployment posture
- One-time formatting cleanup if the team wants `cargo fmt --check` enforced

### Completion Bar

A new contributor can deploy, index, operate, and demo the system from docs.

---

## Recommended Build Order

1. Gate/challenge indexer projections
2. Live frontend gates and reputation tabs
3. Gate policy and passage demo
4. Oracle/admin workflows
5. Killboard from `SHIP_KILL`
6. Bounty/contracts
7. Production hardening

The north star is simple: make the app prove the protocol. Every next task
should reduce the gap between the dashboard and live on-chain truth.
