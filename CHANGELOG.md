# Changelog

This changelog records the main-branch evolution of FrontierWarden. It was
backfilled from `git log --first-parent origin/main` through commit `3a361dd`
on 2026-05-20.

## Maintenance Rule

- Add a new entry whenever `main` gains user-visible behavior, protocol
  behavior, API shape, deployment posture, security posture, governance, or
  major documentation changes.
- Keep source-of-truth wording strict: `BOUND` means GatePolicy points at a
  world Gate; `BINDING VERIFIED` additionally requires active FrontierWarden
  extension evidence on that world Gate.
- Keep the exact commit transcript in Git. This file is the human-readable
  release ledger plus a compact coverage ledger.

## Unreleased

- Pending: split temporary overlength files listed in `codewarden.json` and
  remove their allowlist entries as each file returns under the 400-line gate.
- Documented Trust API freshness warning semantics so operators can distinguish
  proof-input age, tracked-event quiet periods, and actual indexer health.

## 2026-05-20

### Governance and Security

- Added Code-Warden governance and npm audit CI jobs.
- Added `codewarden.json` with explicit temporary excludes for known
  overlength files and false-positive findings.
- Pinned frontend and test npm dependencies to exact versions.
- Upgraded Vite and Vitest/esbuild-related dependencies for the current
  advisory response.

### Provenance and Proof Bundles

- Added the verifiable provenance ADR and MVR preflight checklist.
- Added MVR provenance fields to Trust API proof bundles, gated by config.
- Surfaced provenance in frontend proof panels when available.

### Indexer and GraphQL Migration

- Added a GraphQL event source abstraction and shadow parity validation path.
- Added GraphQL parity smoke/runbook work, staging soak notes, and production
  canary documentation.
- Added shadow event-source parity support so JSON-RPC to GraphQL migration can
  be validated without changing production behavior.

### Frontend Operator Experience

- Added P2 UX polish: LUX currency display, dispute sorting, kill filters,
  lookup history, loading skeletons, and table refinements.
- Updated all gate, passage, and toll displays to use in-game LUX language.
- Added operator dead-end guidance for empty Gate Ops and world Gate candidate
  states.
- Continued visual polish while removing over-literal in-game HUD chrome from
  the web dashboard.

## 2026-05-19

### Operator Workflow and UX

- Replaced the flat 11-tab navigation with five operator workflow groups.
- Added a tribe network operator UX overhaul, corridor grouping, cross-workflow
  bounty surfacing, sortable tables, creditor workflow surfaces, and full-app
  P0/P1 audit fixes.
- Added warm visual identity updates, README-aligned visual polish, and UHD
  styling passes.
- Added an operator validation questionnaire.

### API Hardening

- Added API weaponization audit fixes: capped unbounded queries and clamped
  batch identity behavior.
- Added tiered per-endpoint rate limits for high-risk API surfaces.
- Split world-gate traffic API storage/query logic.

### GraphQL and RPC Migration

- Completed the indexer event GraphQL spike and client skeleton.
- Added event-source parity smoke and staging soak runbooks.
- Added Sui GraphQL migration completion reporting and tx-builder RPC
  replacement completion notes.

## 2026-05-18

### In-Game and Smart Assembly Surfaces

- Added the smart assembly object-mode UX addendum.
- Added the in-game object command router shell and SmartGate object command
  surface.
- Confirmed in-game SmartGate and CHECK PASSAGE smoke flows, including EVE
  Vault signing evidence and reference runbooks.
- Added a web command-center escape link from the in-game surface.

### Frontend Refactors and Accessibility

- Split `PolicyView` below the 400-line cap.
- Added form IDs, names, and labels for accessibility.
- Added the multitenant operator redesign plan, operator context bar,
  onboarding wizard shell, trust dossier framing, and gate operations
  restructuring.
- Added browser-local action-path telemetry and tx-builder telemetry.

### Production/API Hygiene

- Replaced wildcard CORS allow headers with explicit headers.
- Downgraded verbose identity GraphQL logs to debug/trace.
- Guarded dispute vote/resolve flows when `FraudChallenge` is not shared or is
  missing.
- Cleaned frontend dependency boundaries.

## 2026-05-17

### Sui GraphQL Object Fetching

- Added the Sui JSON-RPC deprecation spike and frontend adapter boundaries.
- Added GraphQL shadow paths for object fetching, semantic comparison,
  telemetry, smoke docs, owned-object query fixes, and an environment switch for
  fetcher mode.

### Kill Mail and Combat Evidence

- Added native kill-mail ingestion design, source verification, disabled-by-
  default poller, read-only kill-mail API endpoints, frontend killboard
  migration, identity enrichment, and production smoke notes.
- Added combat evidence to the trust dossier and advisory combat risk signals.

### Policy and Market Positioning

- Added tenant combat policy design, a policy config UI shell, and review
  polish.
- Refreshed README market positioning and media assets.
- Added Utopia dev-environment readiness docs and world package/cursor fixes.

## 2026-05-16

### Auth and Operator Sessions

- Added zkLogin session auth using Sui GraphQL `verifySignature`.
- Added ADR and live-test documentation for zkLogin session auth architecture.
- Added wallet/scheme mismatch guards and fixed verify-signature error handling.
- Documented `proof_rate_limited` and wallet zk proof fetch failure classes.

### Trust API and Security Planning

- Hardened third-party Trust API consumability.
- Added wallet-signing failure guidance for EVE Vault sponsored transactions.
- Added data aggregation risk and encrypted tenant-private data ADRs.

## 2026-05-10

### Gate Binding, Topology, and Traffic

- Integrated GitHub PRs #18-22 with local topology, jump, traffic API, gate
  authority, binding, and admin-cap work.
- Added world gate link topology indexing, JumpEvent indexing, and world gate
  traffic read APIs.
- Added advisory world gate intelligence and topology warning panels.
- Added operator-flow smoke docs, tenant onboarding empty state, and operator
  help tooltips.
- Fixed dispute shared-object refs and indexer clippy dead code.

## 2026-05-06

### GatePolicy to World Gate Binding

- Added GatePolicy binding preflight, Move patch, and indexer projection.
- Added binding status API/UI work, world-gates read API, operator binding UX
  preflight, readonly panel, transaction preflight, and deploy preflight.
- Preserved the core invariant: extension authorization proves world Gate to
  extension TypeName, not world Gate to GatePolicy.

### Upstream and Link Audit

- Added link-audit docs hardening and the reusable link-audit script.
- Recorded builders-call topology decisions and designed the GatePolicy world
  gate binding patch.

## 2026-05-05

### World Topology and Node Sentinel

- Added the World Topology Spike, world gates projection, and live migration
  tracking.
- Added world gate trust warnings and extension-state indexing.
- Added world gate binding guardrails and hybrid binding decision docs.
- Added the Node Sentinel console and batch identity enrichment consumption.
- Added identity enrichment backend foundation.

### Frontend and Production Polish

- Split Trust Console and Social panels.
- Improved Trust Console clarity, production gate/social UX, sponsored wallet
  signing diagnostics, address normalization, and CI.

## 2026-05-04

### Trust API and Security

- Added `bounty_trust` to Trust API v1.
- Replaced Node subprocess signature verification with native Rust.
- Clarified Trust API camelCase requirements and silent-drop behavior.

### Refactors

- Split `trust_evaluator.rs` and `eve_identity.rs` into sub-400-line modules.
- Trimmed `api_sessions.rs` under the line limit at the time.

### Transaction and Deployment Fixes

- Fixed admin transaction object-ref construction and dispute attestation args.
- Simplified gas station Docker build behavior and removed sponsor auth from
  that path.

## 2026-05-03

- Removed `VITE_API_KEY` from the browser bundle and opened public read routes.
- Continued gate passage diagnostics around transaction construction, sponsored
  transaction phases, and Valibot/protobuf failures.

## 2026-05-02

### Gate Passage Transaction Stabilization

- Iterated through sponsored gate passage transaction construction fixes:
  shared-object refs, object refs, local JSON-RPC client usage, payment coin
  selection, signing modes, validation, retry behavior, and diagnostics.
- Stripped debug logs after diagnosis and wired frontend API auth where still
  required.

### Trust, Demo, and Runtime Hardening

- Secured oracle and sponsor endpoints with API-key guards.
- Hard-labeled demo fallback data, added structured pipeline traces, fixed
  trust confidence semantics, and made `score_cache` primary for trust scores.
- Added migration idempotency tracking, inline TrustKit, Railway auto-migrations,
  max connection config, and freshness warning explanation.
- Standardized EVE Vault naming and removed unsupported wallet/provider paths.

## 2026-05-01

### Deployment Foundation

- Prepared the indexer for Railway deployment with `PORT`, CORS, env overrides,
  Docker multi-stage build, runtime binary fixes, production config, and
  required runtime libraries.
- Added `Cargo.lock`, Rust toolchain alignment, and Docker dependency-cache
  fixes.

### Frontend Foundation

- Initialized the frontend project, Vercel deployment settings, dAppKit network
  configuration, GateAdmin transfer panel, and EVE Frontier world integration.

## 2026-04-30

- Implemented oracle attestation registration and issuance workflow with UI and
  tests.
- Froze Trust API v1 and integrated TrustKit into the frontend.
- Implemented trust evaluation for gate access and counterparty risk.
- Implemented the reputation indexer, REST API, dashboard UI, view components,
  database schema, configuration, and documentation foundation.
- Recorded audit cleanup work.

## 2026-04-29

- Added Trust API docs, HTTP tests, freshness warnings, and testnet cleanup.
- Added wallet-signed operator sessions, API auth, gate admin transfer flow, and
  operator-session authentication.
- Added EVE tool-builder integration docs.
- Reorganized documentation and ignore patterns, strengthened secret masking,
  updated metadata, and moved the license to BSL 1.1.

## 2026-04-25 to 2026-04-28

- Added the v4 epoch-free protocol with 24 green tests.
- Added repo hygiene around logs and Blackbox artifacts.
- Released `v0.1.0-testnet` as the production-default/testnet baseline.
- Fixed schema list and helper SDK/keypair derivation behavior.
- Added Rust indexer scaffold, Supabase schema, Vite/React frontend, star map,
  intel feed, tribe dashboard, live gate indexing, and challenge indexing.
- Removed obsolete research and UI mockup directories as the product became
  implementation-first.

## Commit Coverage Ledger

Use this ledger to confirm that the changelog covers the main branch through
`3a361dd`. Run `git log --first-parent --oneline origin/main` for the exact
commit transcript.

- 2026-05-20: `3a361dd` through `8dff53c` - governance gate, dependency
  security updates, operator dead-end remediation, GraphQL event-source shadow
  mode, MVR provenance, LUX/toll wording, and P2 UX polish.
- 2026-05-19: `d8a676e` through `f3196c5` - full-app UX audit fixes, operator
  workflows, visual identity updates, GraphQL event migration preparation,
  rate limits, API weaponization hardening, and world-gate traffic split.
- 2026-05-18: `91f4515` through `28da94c` - tx-builder GraphQL object/payment
  migration, in-game SmartGate surfaces, accessibility, CORS/log hygiene,
  multitenant UX redesign, and Sui fetcher telemetry.
- 2026-05-17: `2f99097` through `a93a53f` - Sui object fetcher GraphQL work,
  kill-mail ingestion and UI, combat evidence, tenant combat policy, README
  refresh, and Utopia/world-event readiness.
- 2026-05-16: `816f42d` through `841ac5b` - zkLogin/session auth, wallet
  mismatch guards, Trust API consumability, and security ADRs.
- 2026-05-10: `926b5ef` through `4166c32` - topology, JumpEvent indexing,
  traffic API, gate authority/binding/admin-cap integration, and advisory UI.
- 2026-05-06: `c9ba9e8` through `3bbc245` - GatePolicy binding preflight,
  Move/indexer/API/UI binding slices, link audit hardening, and builders-call
  topology decisions.
- 2026-05-05: `7514dbb` through `040546e` - topology spike, world gates,
  extension state, Node Sentinel, identity enrichment, Trust Console/Social
  splits, production UX polish, and address normalization.
- 2026-05-04: `15c8094` through `237e15b` - evaluator/identity refactors,
  native Rust signature verification, `bounty_trust`, admin tx fixes, and gas
  station Docker fixes.
- 2026-05-03: `93a99d9` through `b9724f4` - Vite/API key/security fixes and
  transaction diagnostics.
- 2026-05-02: `93d9fe5` through `e0e29c2` - sponsored passage stabilization,
  pipeline/demo/trust patches, migration idempotency, Railway auto-migrations,
  EVE Vault cleanup, and runtime configuration.
- 2026-05-01: `fb73b18` through `7a22faa` - Railway deployment, Rust/toolchain
  alignment, frontend/Vercel setup, dAppKit, and EVE Frontier integration.
- 2026-04-30: `7cf3540` through `c6ebcfd` - Trust API v1, TrustKit,
  evaluation engine, indexer/API/dashboard, views, DB schema, and audit
  cleanup.
- 2026-04-29: `d6bd80a` through `a3eee27` - Trust API docs/tests, operator
  sessions, API auth, EVE builder guide, docs/security cleanup, metadata, and
  BSL license.
- 2026-04-25 to 2026-04-28: `de7aaec` through `90d71ea` - protocol baseline,
  repo hygiene, release `v0.1.0-testnet`, indexer/frontend scaffolds, and live
  gate/challenge indexing.
