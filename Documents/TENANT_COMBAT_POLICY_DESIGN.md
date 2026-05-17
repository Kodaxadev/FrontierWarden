# Tenant Combat Policy — Design Document

**Status:** Design / Pre-implementation
**Date:** 2026-05-17
**Branch:** `codex/tenant-combat-policy-design`
**Depends on:** `ADR_KILLMAILS_AS_TRUST_EVIDENCE.md`, PR #38 (advisory combat signals)

---

## Purpose

This document defines the shape, safety constraints, and implementation sequence for
tenant-scoped combat policy rules in FrontierWarden.

It answers the question: *once advisory combat signals exist in the dossier, how could
an operator configure rules that act on them* — without automating reputation mutations
or violating the ADR layered model.

This is a **design document, not an implementation**.
No active policy evaluation, score mutation, or backend enforcement exists yet.

---

## Core Principle

> Kill mails are telemetry. Attestations are interpretation. **Tenant policy decides meaning.**
>
> Active combat policy rules are allowed **only** when they are:
> - Tenant-scoped (not global reputation)
> - Explicit (operator-configured, not system-inferred)
> - Audited (every effect has a traceable cause)
> - Explainable (the subject can see why an action was taken)
> - Reversible/challengeable (the subject can dispute the outcome)

---

## What This Is Not

This design does **not** and will **not** support:

| Prohibited | Reason |
|---|---|
| Automatic reputation change from raw kill mail | Violates ADR layered model |
| Global moral scoring ("this pilot is hostile") | No cross-tenant context |
| Auto-deny gate access from kill data alone | Requires explicit operator policy |
| Loan-cap or credit impact without audit trail | Financial risk without accountability |
| Bulk export of kill targets or vulnerable-pilot filters | Targeting/harassment surface |
| Silent effects invisible to the subject | Breaks explainability requirement |
| Cross-tenant combat intelligence aggregation | Violates tenant isolation |

---

## Policy Rule Shape

A combat policy rule is a tenant-scoped configuration object. No schema exists yet —
this is the proposed structure for future implementation.

```typescript
interface CombatPolicyRule {
  /** Unique rule identifier within the tenant. */
  rule_id: string;

  /** Tenant or operator who owns this rule. */
  tenant_id: string;
  operator_id: string;

  /** Human-readable name shown in operator console. */
  name: string;

  /** Which advisory signal this rule watches. */
  signal: CombatSignalType;

  /** Threshold and observation window. */
  threshold: number;
  window_days: number;

  /**
   * Relationship context between subject and tenant's registered entities.
   * Rules should fire differently for allies vs enemies vs neutrals.
   */
  relationship_context: 'ally' | 'enemy' | 'neutral' | 'unknown' | 'any';

  /**
   * What the rule triggers. Advisory flag only in v1.
   * Score modifier and access modifier are future phases.
   */
  action: CombatPolicyAction;

  /** Text shown to the operator when rule fires. */
  explainability_text: string;

  /** Whether this rule is currently active. */
  enabled: boolean;

  /** ISO timestamp when this rule was last changed and by whom. */
  updated_at: string;
  updated_by: string;
}

type CombatSignalType =
  | 'recent_losses'          // losses in window > threshold
  | 'recent_kills'           // kills in window > threshold
  | 'kill_loss_ratio'        // ratio below/above threshold
  | 'combat_heavy_profile'   // kills >= 3, losses == 0
  | 'ship_kill_attested'     // Layer 2 attestation count >= threshold
  | 'no_combat_evidence';    // no indexed kills or losses

type CombatPolicyAction =
  | 'advisory_flag'          // show a flag in the dossier — no automated effect
  | 'manual_review'          // route to operator review queue — no automated effect
  | 'require_attestation'    // block trust action until oracle attests — gated, explicit
  | 'future_score_modifier'; // reserved — not implemented, requires separate ADR amendment
```

---

## Example Tenant Policy Rules

These are illustrative configurations. None are active. All would require
explicit operator setup via the operator console.

### Rule 1 — Flag high recent loss activity

```
signal:               recent_losses
threshold:            3
window_days:          7
relationship_context: any
action:               advisory_flag
explainability_text:  "This pilot had 3+ losses in the last 7 days.
                       This is context for collateral review, not a reputation change.
                       Tenant policy: Clonebank-86 lending desk."
```

**What it does:** Shows an amber flag in the trust dossier for the lending operator.
**What it does NOT do:** Change any score, deny any gate, modify any loan cap.

---

### Rule 2 — Flag kills against allied tribe

```
signal:               recent_kills
threshold:            1
window_days:          30
relationship_context: ally
action:               advisory_flag
explainability_text:  "This pilot has kills against registered ally tribe members
                       in the last 30 days. Review before extending credit or gate access.
                       Tenant policy: Silver Corporation diplomatic registry."
```

**What it does:** Flags in the dossier when the subject killed someone from a tribe
the operator has registered as an ally.
**What it does NOT do:** Auto-deny, auto-reduce score, affect any other tenant's view.
**Requires:** Operator has a registered ally tribe list. No list → rule doesn't fire.

---

### Rule 3 — Flag kills against tenant enemies as positive context

```
signal:               recent_kills
threshold:            1
window_days:          30
relationship_context: enemy
action:               advisory_flag
explainability_text:  "This pilot has confirmed kills against registered enemy entities.
                       This may be positive context for this tenant's trust evaluation.
                       Tenant policy: Frontier Defense Consortium."
```

**What it does:** Surfaces a positive-context flag. The operator reads it; nothing is automated.
**Important:** The same kill can be a positive signal for one tenant and a negative signal for another.
This is why rules are tenant-scoped — there is no global meaning to any kill.

---

### Rule 4 — Route to manual review before credit decision

```
signal:               recent_losses
threshold:            5
window_days:          14
relationship_context: any
action:               manual_review
explainability_text:  "High loss activity flagged for manual lending review.
                       Do not approve credit automatically. Route to desk review.
                       Tenant policy: Interstellar Contract Agency credit desk."
```

**What it does:** Routes to a review queue. A human decides, not the system.
**What it does NOT do:** Block credit automatically, change score.

---

### Rule 5 — Require SHIP_KILL attestation before score impact

```
signal:               ship_kill_attested
threshold:            0   (zero = "none present")
window_days:          n/a
relationship_context: any
action:               require_attestation
explainability_text:  "No SHIP_KILL oracle attestation found. Score impact from combat
                       evidence requires oracle verification before it can be applied.
                       Tenant policy: FrontierWarden standard kill evidence gate."
```

**What it does:** Prevents any future score modifier (Phase 3) from firing without
a Layer 2 oracle attestation. Enforces the ADR's "attestation before score impact" rule
at the policy layer rather than relying on convention.

---

### Rule 6 — Require manual operator confirmation for any credit impact

```
signal:               combat_heavy_profile
threshold:            n/a
window_days:          30
relationship_context: any
action:               manual_review
explainability_text:  "Combat-heavy profile detected. Any credit limit change requires
                       explicit operator approval — no automated adjustment will be made.
                       Tenant policy: required for all credit decisions."
```

**What it does:** Enforces a mandatory human confirmation step for credit decisions
involving combat-heavy profiles.

---

## Hard Safety Rules

These are non-negotiable constraints that apply regardless of tenant configuration:

| Rule | Enforcement point |
|---|---|
| **No global moral scoring.** Kill patterns cannot produce a system-wide reputation label. | Policy evaluator must scope all effects to tenant_id |
| **No automatic reputation mutation from raw kill mail.** Score changes require: oracle attestation (Layer 2) + tenant policy (Layer 3) + explicit operator enable. | Evaluator rejects `action: future_score_modifier` unless attestation is present |
| **No auto-deny without explicit tenant policy.** A pilot cannot be denied gate access from kill data unless the operator has written and enabled a rule. | Policy evaluator is opt-in per gate |
| **No credit/loan-cap impact without explicit policy and audit trail.** Every credit-affecting rule evaluation must write an audit row. | Future: `policy_audit_log` table |
| **All effects must be explainable.** Every rule must have `explainability_text`. Firing a rule with empty explainability_text is a validation error. | Schema validation at config save |
| **All effects must be reversible or challengeable.** Advisory flags can be dismissed. Manual review outcomes can be overridden. Future score modifiers must have a challenge path. | Challenge path required before Phase 3 |
| **Subject visibility.** A pilot must be able to see which policies affected their dossier view, in aggregate. Not operator-internal detail, but "a combat policy rule was applied by this operator." | Future: dossier transparency section |

---

## Future Implementation Sequence

### Phase 0 — Current state (done)
- Advisory signals displayed read-only in dossier (PR #38)
- Inactive policy placeholders shown in UI
- No active evaluation, no backend storage, no effects

### Phase 1 — Policy Config UI (design milestone)
- Operator console page: "Combat Policy Rules"
- Create / edit / enable / disable rules (tenant-scoped)
- Preview: "if this pilot were evaluated now, this rule would fire: [yes/no]"
- No live enforcement yet — UI writes to config, config is stored but not evaluated

### Phase 2 — Backend Policy Storage
- `tenant_combat_policies` table: `rule_id, tenant_id, operator_id, signal, threshold, window_days, relationship_context, action, explainability_text, enabled, updated_at, updated_by`
- API: `GET /operators/{id}/combat-policies`, `PUT /operators/{id}/combat-policies/{rule_id}`
- Validation: `explainability_text` required, `action: future_score_modifier` blocked at this phase
- No evaluator integration yet

### Phase 3 — Evaluator Integration
- Trust evaluator (`/trust/evaluate`) checks for active tenant combat policies
- If `action: advisory_flag` or `manual_review`: appends to `TrustEvaluateResponse.warnings`
- If `action: require_attestation`: blocks evaluation if no SHIP_KILL attestation present
- `action: future_score_modifier`: **requires a separate ADR amendment before implementation**
- Every evaluation that fires a rule writes to `policy_audit_log`

### Phase 4 — Audit Trail
- `policy_audit_log` table: `rule_id, tenant_id, subject, signal_value, action_taken, explainability_text, evaluated_at`
- Operator console: audit log view (read-only, filterable by rule / subject / date)
- Subject view: "a combat policy rule was applied to your dossier by [operator]"

### Phase 5 — Challenge / Dispute Path
- Subject can flag a policy evaluation as disputed
- Routes to `world_fraud_challenges`-style dispute (or a new `policy_dispute` table)
- Operator must respond or the flag auto-clears after N days
- Required before `action: future_score_modifier` is enabled

---

## Relationship Context Implementation Notes

Rules that reference `relationship_context: ally | enemy` require the operator to
maintain a registered entity list. This does not exist yet. Proposed structure:

```sql
-- future table
CREATE TABLE tenant_relationship_registry (
  tenant_id     TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('tribe', 'address', 'character')),
  entity_id     TEXT NOT NULL,
  relationship  TEXT NOT NULL CHECK (relationship IN ('ally', 'enemy', 'neutral')),
  registered_by TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity_type, entity_id)
);
```

Until this table exists, rules with `relationship_context: ally | enemy` always evaluate
against `unknown` and should not fire for those contexts.

---

## Open Questions

1. **Who can write combat policies?** Only verified operators? Any wallet with a gate policy?
   Proposed: same auth as gate policy (operator session + gate ownership).

2. **Should policies be per-gate or per-tenant?** Per-gate is more targeted; per-tenant is simpler.
   Proposed: per-tenant with optional gate_id scope. A policy can be "for all my gates" or "for gate X only."

3. **Should policy audit rows be on-chain?** On-chain creates a permanent, verifiable record.
   Off-chain (Supabase) is simpler but relies on the operator running FrontierWarden honestly.
   Proposed: off-chain for Phase 4, with a future Move-based audit commitment option.

4. **Subject opt-out?** Can a pilot opt out of being evaluated by a specific tenant's combat policies?
   Proposed: yes — opt-out is a profile-level flag, stored off-chain, honoured by the evaluator.

---

## References

- `Documents/ADR_KILLMAILS_AS_TRUST_EVIDENCE.md` — core layered model
- `Documents/KILLMAIL_API.md` — kill mail endpoint reference
- `Documents/KILLMAIL_PRODUCTION_SMOKE.md` — production smoke result
- PR #33 — kill mail API
- PR #34 — killboard native migration
- PR #35 — Combat Evidence panel (initial)
- PR #38 — advisory combat risk signals
- `indexer/src/api_kill_mails.rs` — kill mail API handlers
- `frontend/src/components/features/frontierwarden/CombatEvidencePanel.tsx` — current UI surface
