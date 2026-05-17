# ADR: Kill Mails as Trust Evidence

**Status:** Accepted
**Date:** 2026-05-17
**Context:** Native EVE Frontier kill mail ingestion (PR #32–#34)

---

## Core Position

FrontierWarden is a **trust, reputation, and credit-risk system**.
The killboard is an evidence surface — not the product center.

Kill mails are raw combat telemetry that *may* inform trust decisions.
They do not *are* trust decisions.

---

## Layered Model

```
Layer 1 — Telemetry
  Native kill mail (world_kill_mails table)
  Source: alpha-strike community API
  Meaning: "this combat event occurred"
  Trust impact: none by itself

Layer 2 — Oracle Interpretation
  SHIP_KILL attestation (attestations table)
  Source: FrontierWarden oracle
  Meaning: "an oracle vouched this kill as trust-layer evidence"
  Trust impact: feeds score only when a tenant/operator acts on it

Layer 3 — Tenant Policy
  Operator gate policy / reputation rule
  Source: tenant configuration
  Meaning: "for my gate/context, this kill pattern means X"
  Trust impact: explicit, scoped, auditable
```

---

## Rules

**Kill mail ingestion**
- Native kill mails are combat telemetry. Store them. Index them. Serve them read-only.
- The kill mail poller is disabled by default. Enabling it is an operator/deployment decision.
- Kill mail data is derived combat intelligence — do not expose bulk exports or targeting-style filters.

**Reputation and scores**
- Reputation scores and credit scores must **never change automatically** from kill mail data alone.
- A kill appearing in `world_kill_mails` has zero effect on any score until an oracle attests it and a tenant policy consumes that attestation.
- Any future combat-derived score must be: explicit, tenant-scoped, backed by an attestation, and explainable to the subject.

**SHIP_KILL attestations**
- SHIP_KILL attestations remain a separate concept from native kill mails.
- An attestation says "an oracle interpreted this kill as trust evidence." A kill mail says "this happened."
- The two are linked by victim address when a matching attestation exists, shown as an ATTESTED badge in the UI. No score change results from this badge.

**UI discipline**
- The killboard header must always read: *"Native kill mails are combat telemetry, not reputation judgments."*
- Do not add filters for "vulnerable pilots", "low-score targets", or "high-value victims".
- Do not add kill/death ratio rankings or PvP leaderboards — these are EVE Online features, not FrontierWarden features.
- Do not auto-adjust standing, credit, or gate access based on killboard activity.

**Acceptable future work**
- Surfacing kill mails in a trust dossier as evidence supporting an attestation ("this SHIP_KILL attestation is backed by kill mail #4861").
- Tenant-configured rules that use kill frequency as *one input* to a gate policy — only through explicit operator configuration.
- Gate access confidence indicators that incorporate kill proximity *when the operator has opted in*.

**Not acceptable**
- Silent reputation changes triggered by kills.
- Cross-tenant combat intelligence aggregation.
- "Wanted" or "hostile" labels derived from kill history without operator attestation.
- Any feature that makes FrontierWarden a PvP leaderboard or targeting tool.

---

## Rationale

EVE Frontier is a game where combat is legitimate gameplay. A kill is not inherently a negative trust signal — context determines meaning. A hauler getting killed near a camped gate means something different from a griefer kill in a trade hub. Only operators with gate-level context can make that determination.

FrontierWarden's value is in enabling operators to configure that context, not in making the judgment for them. Automating reputation changes from raw kill data would:

1. Bypass the tenant authority model entirely
2. Create adverse incentive for false kill reporting
3. Turn FrontierWarden into a tool for harassment (kill someone to tank their rep)
4. Break the separation between telemetry and interpretation that makes the system auditable

---

## Decision

Native kill mails ship as read-only telemetry infrastructure.
Trust and reputation remain driven by attestations and explicit operator policy only.
