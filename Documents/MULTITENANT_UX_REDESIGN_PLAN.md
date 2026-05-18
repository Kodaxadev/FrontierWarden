# FrontierWarden Multitenant UX Redesign Plan

Status: design plan only
Branch: `codex/multitenant-ux-redesign-plan`
Scope: frontend information architecture and user-facing workflow model

## Goal

Move FrontierWarden from a protocol-feature dashboard to a tenant/operator
command center for EVE Frontier trust, reputation, and credit-risk operations.
The interface should help non-developer operators understand what authority they
hold, which trust domain they are acting for, what evidence backs a decision,
and what to do next.

This plan does not change backend schema, Move code, tenant policy persistence,
production behavior, dependencies, or existing panels.

## Product Principle

FrontierWarden is not a universal gate owner or a generic reputation screen. It
is operator-controlled trust infrastructure. Every screen should answer:

- Who am I acting as?
- Which tenant trust domain am I operating?
- What authority do I have?
- What decision am I making?
- What proof backs that decision?
- What should I do next?

## Proposed Navigation

| New section | Operator question | Primary current surface |
|---|---|---|
| Dashboard | What needs attention now? | `NodeSentinelView`, `FwHeader`, `SystemStatus` |
| Onboarding | How do I become ready to operate? | `OperatorSessionGate`, `SocialView`, authority panels |
| Trust Dossiers | Can I trust this pilot/counterparty? | `ReputationView`, `CombatEvidencePanel`, `SocialProfilePanel` |
| Gate Operations | Can this pilot pass this gate? | `GateIntelView`, `OperatorBindingPanel`, `WorldGateTrafficPanel` |
| Credit Risk | Should this counterparty receive credit? | `ContractsView`, `SocialLoanPanel`, trust action `counterparty_risk` |
| Policy | What does trust mean for this tenant? | `PolicyView`, `TenantCombatPolicyPanel`, `DispositionMatrix` |
| Evidence | What proof supports the answer? | `TrustConsoleView`, `TrustResultPanel`, `KillboardView`, `DisputesView` |
| Developers | How do tools integrate? | `OracleView`, Trust API docs, SDK docs |
| Advanced | What diagnostics are available? | `NodeSentinelView`, telemetry, raw IDs, debug surfaces |

The first pass can keep tab routing internal and only rename/reorder the shell.
Panels should move later, not be deleted.

## Current Component Mapping

| Existing component/view | New home | Notes |
|---|---|---|
| `FrontierWardenDashboard` | App shell | Owns top-level section routing. |
| `FwNav` | App shell navigation | Replace protocol tabs with operator-job labels. |
| `FwHeader` | Dashboard plus context bar | Header should not be the only identity signal. |
| `OperatorSessionGate` | Onboarding / context guard | Keep as guard, but expose state in context bar. |
| `NodeSentinelView` | Dashboard / Advanced | Advisory network health, warnings, recommendations. |
| `GateIntelView` | Gate Operations | Primary operational gate screen. |
| `OperatorBindingPanel` | Gate Operations / Onboarding | Authority discovery and binding status. |
| `OperatorGateAuthorityPanel` | Onboarding / Gate Operations | Discover operator-held gate authority. |
| `OperatorWorldGateBindingPanel` | Gate Operations | Explain BOUND vs BINDING VERIFIED. |
| `OperatorExtensionAuthPanel` | Gate Operations / Advanced | Explain extension authorization. |
| `GatePolicyProvisionPanel` | Onboarding / Policy | Initial policy setup flow, not main dashboard noise. |
| `PolicyView` | Policy | Tenant policy, thresholds, tolls, combat interpretation. |
| `TenantCombatPolicyPanel` | Policy | Policy draft shell until persistence exists. |
| `TrustConsoleView` | Evidence / Dashboard preview | Evaluate decisions and show proof bundles. |
| `TrustInputPanel` | Evidence / Decision preview | Should be guided by use case, not raw fields first. |
| `TrustResultPanel` | Evidence / Dossiers | Proof-first result display. |
| `ReputationView` | Trust Dossiers | Rename mental model from reputation score to dossier. |
| `CombatEvidencePanel` | Trust Dossiers / Evidence | Killmails are evidence, never automatic reputation. |
| `KillboardView` | Evidence | Native killmail feed and related attestations. |
| `DisputesView` | Evidence / Advanced | FraudChallenge lifecycle and appeal evidence. |
| `ContractsView` | Credit Risk | Credit, obligations, open/closed contracts. |
| `SocialView` | Onboarding / Trust Dossiers / Credit Risk | Split later into profile, vouch, lending, oracle jobs. |
| `SocialProfilePanel` | Onboarding / Dossier | Create or discover operator profile. |
| `SocialVouchPanel` | Onboarding / Dossier | Seed first trust list / vouch workflow. |
| `SocialLoanPanel` | Credit Risk | Counterparty credit actions. |
| `SocialOraclePanel` | Developers / Advanced | Oracle registration and operational role. |
| `WalletStandingIssuerPanel` | Policy / Evidence | Trust claim issuance. |
| `OracleView` | Developers | Integration and oracle/operator setup. |
| `LiveStatus` | Shared status primitive | Must always explain next action on warnings. |
| `SigningFailureGuide` | Onboarding / Advanced | Wallet and zkLogin recovery guidance. |

## First-Time Onboarding Flow

1. Connect wallet
   - Show EVE Vault as expected wallet.
   - If no wallet is connected, show only "Connect wallet" and why it matters.

2. Resolve EVE character
   - Resolve wallet to EVE identity through the existing identity endpoint.
   - If no character is found, explain that profile data may not exist yet.

3. Sign operator session
   - Explain that the session proves the wallet is acting now.
   - Do not describe it as universal authority.

4. Create or select tenant trust domain
   - Phase 1 shell only: local UI selection or placeholder domain.
   - Persistence waits until Phase 5.

5. Discover authority
   - Check policy authority (`GateAdminCap`).
   - Check world gate ownership (`OwnerCap<Gate>`).
   - Check extension authorization (`FrontierWardenAuth`).

6. Seed first trust list
   - Guide the operator to add first trust claims/vouches.
   - Show which claims are local tenant interpretation versus protocol evidence.

7. Preview first trust decision
   - Run a guided trust decision with proof bundle visible.
   - Use plain-language result first, raw object IDs second.

## Active Operator Context Bar

Place below global nav and above every section.

| Field | Meaning | Empty/problem state |
|---|---|---|
| Wallet | Connected Sui/EVE Vault address | "No wallet connected" plus connect action. |
| Character | Resolved EVE identity | "Character not resolved" plus retry/explain link. |
| Tenant | Active trust domain | "No trust domain selected" plus onboarding action. |
| Environment | Stillness/testnet/mainnet label | Warn if frontend and API disagree. |
| Session status | Signed operator session state | Show expired/missing and renewal action. |
| Authority status | Policy/gate/extension capabilities | Show split status; never collapse to one green check. |

Authority status should separate:

- Policy authority: can manage FrontierWarden policy.
- World gate ownership: can authorize the actual world gate.
- Extension authorization: proves the world gate recognizes FrontierWarden.

## User-Facing Terminology

| Protocol term | Operator label | UI explanation |
|---|---|---|
| `GateAdminCap` | Policy authority | Permission to manage FrontierWarden gate policy. |
| `OwnerCap<Gate>` | World gate ownership | Permission to authorize extensions on the actual world gate. |
| `FrontierWardenAuth` | Extension authorization | Proof the world gate has authorized FrontierWarden. |
| Attestation | Trust claim | A signed claim used as evidence, not truth by itself. |
| `FraudChallenge` | Dispute | A formal challenge to a trust claim or outcome. |
| Native killmail | Combat evidence | What happened in combat; tenant policy decides meaning. |
| `BOUND` | Bound to gate | Policy points at a world gate. Not fully verified. |
| `BINDING VERIFIED` | Verified gate binding | Policy is bound and the world gate authorized FrontierWarden. |

## UX Rules

- Hide protocol object IDs by default. Provide "show technical details" for IDs.
- Every warning must say what to do next.
- Every trust decision must show proof, not just a score.
- Killmails are evidence, not reputation.
- Tenant policy decides what evidence means.
- `BOUND` is not `BINDING VERIFIED`.
- Site owner is not universal gate owner.
- Do not turn missing data into failure language unless the operator can fix it.
- Prefer "you can/cannot do X because Y" over raw protocol state.
- Keep advanced diagnostics available without making them the primary workflow.

## Wireframe-Level Layouts

### Dashboard

```text
Context bar
------------------------------------------------------------
Attention queue        Trust-domain summary      Recent proof
- Authority gaps       - Active tenant           - Decisions
- API/indexer status   - Policy mode             - Disputes
- Wallet/session       - Gate binding state      - Killmail evidence

Primary actions: Continue onboarding | Evaluate trust | Review gate ops
```

### Onboarding Wizard

```text
Step rail: Wallet -> Character -> Session -> Tenant -> Authority -> Trust list -> Preview

Main panel: current step explanation, action, expected outcome
Side panel: why this step matters, recovery help, technical details collapsed
Footer: Back | Save progress locally | Continue
```

### Trust Dossier

```text
Subject header: character, wallet, tenant interpretation, environment

Decision cards: gate access | counterparty risk | bounty trust
Evidence timeline: trust claims, disputes, killmails, contracts
Proof drawer: transaction digests, schemas, checkpoints, raw IDs collapsed
```

### Gate Operations

```text
Gate selector + binding status

Left: passage decision preview and recent passages
Right: authority checklist
- Policy authority
- World gate ownership
- Extension authorization

Bottom: topology, jump/activity feed, diagnostics collapsed
```

### Policy Page

```text
Tenant trust domain selector
Policy summary: thresholds, tolls, combat interpretation
Draft policy shell: local-only until persistence phase
Impact preview: sample decisions before/after policy changes
```

### Credit Risk Page

```text
Counterparty search
Risk decision result with proof
Open obligations and lending context
Vouches/trust claims relevant to credit
Dispute and default history
```

## Implementation Sequence

### Phase 0: Design doc

Add this plan and use it as the IA contract. No runtime behavior changes.

### Phase 1: App shell/context bar

Introduce renamed navigation and an `OperatorContextBar` shell using existing
wallet, identity, environment, session, and authority signals. Keep current
tabs available behind the new grouping.

### Phase 2: Onboarding wizard shell

Add a wizard shell with non-persistent tenant selection. Reuse existing connect,
identity, session, authority, vouch, and trust-preview capabilities.

### Phase 3: Dossier-first redesign

Reframe `ReputationView` as Trust Dossiers. Put proof, tenant interpretation,
combat evidence, vouches, and disputes around the subject.

### Phase 4: Gate operations restructure

Move gate passage, binding state, authority discovery, topology, and extension
authorization into one operational flow. Preserve existing panels.

### Phase 5: Tenant policy persistence

Add durable tenant trust domains and policy persistence only after backend/schema
design is approved.

### Phase 6: Advanced diagnostics consolidation

Move raw telemetry, protocol IDs, GraphQL/JSON-RPC diagnostics, and deep system
state behind Advanced. Keep it reachable for operators and developers.

## Risks and Open Questions

- Tenant trust domains need a persistence model; Phase 1/2 must not fake durable
  policy ownership.
- Authority checks are split across policy authority, world gate ownership, and
  extension authorization. Collapsing them would recreate current confusion.
- `getCoins` and tx-builder JSON-RPC replacement remain separate from UI IA.
- Discovery listing requirements are still unverified; avoid designing around
  unconfirmed listing schema.
- Credit-risk workflows need clearer operator language before adding new flows.
- Large existing panels exceed ideal module size; implementation phases should
  split files only when touching those areas.
- The dashboard must not imply FrontierWarden controls gates it only observes.

## Validation Contract

- Docs only for Phase 0.
- Run `git diff --check`.
- Run Code-Warden line and secret checks on this document.
- No source changes unless a later phase only adds doc links.
