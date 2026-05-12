# FrontierWarden — Trust Is Subjective

**Rule:** FrontierWarden never says "this player is trusted."
**It says:** "trusted by this policy domain" or "allowed by this operator's rule set."

---

## Why this matters

A global trust score implies an authoritative arbiter. FrontierWarden is not that.
FrontierWarden is infrastructure for operators to define and enforce their own
subjective access rules. Each GatePolicy is a sovereign domain. Two operators
can reach opposite conclusions about the same subject — both are correct within
their own domain.

This is also legally and ethically important: FrontierWarden makes no claim about
a player's real-world trustworthiness. It evaluates on-chain attestations against
operator-configured thresholds. Those attestations are themselves subjective oracle
outputs from operators who chose to issue them.

---

## Correct language in UI and API

| ❌ Never say | ✅ Say instead |
|---|---|
| "This player is trusted." | "Trusted by [GatePolicy domain]." |
| "This player is blocked." | "Denied by [operator]'s rule set." |
| "Trust score: 85" (no context) | "Score: 85 against [schema] in [domain]." |
| "High trust" | "Meets [operator]'s ally threshold." |
| "Unknown" | "Unknown to this trust domain." |
| "FrontierWarden verified." | "Allowed by [GatePolicy] — [operator] rule set." |
| "Reputation: Good" | "Attested TRIBE_STANDING ≥ threshold for this gate." |

---

## The evaluation chain

```
Subject wallet
  → attestation (issued by oracle, operator-chosen)
    → score value
      → compared to GatePolicy threshold (operator-configured)
        → ALLOW_FREE | ALLOW_TAXED | DENY
          → in the context of gate_id / gate_policy_id (operator-owned)
```

Every step has an owner. Trust is the product of that owner's choices.

---

## What FrontierWarden does not determine

- Whether a player is "good" or "bad" in any global sense
- Whether an attestation is truthful (only that it exists and is unrevoked)
- Whether an oracle is reliable (operator chose the oracle)
- Whether an operator's threshold is fair

FrontierWarden evaluates and enforces policy. It does not author policy.

---

## Proof bundle wording

The Trust API `proof` field exists precisely to make this chain auditable.
Every `TrustEvaluationResponse` includes:
- Which GatePolicy evaluated the request
- Which schema and threshold were applied
- Which attestation was observed
- Which oracle issued it
- Whether any warnings apply

The proof bundle is the evidence. The decision is the operator's, not the platform's.

---

## Implications for new UI panels

Before adding any panel that displays trust state:

1. Is the trust scoped to a specific GatePolicy or domain? If not, do not display it.
2. Does the UI make clear *whose* rule produced this result? If not, add that context.
3. Does the panel imply a global score? Remove the implication.
4. Is the panel showing a warning (advisory) or a block (enforcement)? Label it correctly.

---

## Implications for the Node Sentinel view

The Node Sentinel is advisory. It must never imply enforcement.
Every signal it surfaces (WARN_WORLD_GATE_OFFLINE, WARN_WORLD_GATE_NOT_LINKED,
WARN_IDENTITY_UNRESOLVED) is advisory to the operator, not a verdict on the subject.
Label all Sentinel outputs as "ADVISORY" and scope them to the operator's domain.
