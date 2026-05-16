# ADR: Data Aggregation and Derived Intelligence Risk

> Status: accepted  
> Date: 2026-05-16  
> Context: community trust critique — "anything in their databases can be weaponized"

## Decision

FrontierWarden indexes mostly public on-chain data, but aggregation, scoring,
correlation, search, and bulk access create new operational risk that does not
exist when querying raw Sui events directly.

**Public source data does not mean unrestricted derived access is safe.**

The system must treat derived intelligence as sensitive and scope API access
accordingly.

## Context

Sui blockchain events are technically public. Any actor can run their own
indexer. But FrontierWarden makes this data operationally useful: scores are
pre-computed, relationships are correlated, history is queryable, and decisions
are instant.

That operational convenience is the product — but it is also the threat surface.
A bulk export of aggregated reputation state is a targeting toolkit that raw
chain queries are not.

## API Access Classes

### Safe by default

These return scoped, single-entity decisions and do not enable bulk surveillance:

- Single gate trust check (`POST /v1/cradleos/gate/evaluate`)
- Single wallet trust check (`POST /v1/trust/evaluate`)
- Scoped proof bundle for a specific decision
- Tenant-owned gate status (operator sees their own gates)
- Tenant-owned policy status (operator sees their own policies)

### Restricted / rate-limited

These provide useful intelligence but enable pattern recognition at scale if
unrestricted:

- Leaderboards (reputation rankings)
- Bulk wallet lookups (many addresses in one call)
- Relationship graph queries (who vouched for whom)
- Route and gate-passage history queries
- Repeated character movement lookups
- Vouch-network traversal
- Raw attestation exports

Any endpoint in this class requires:

- Hard rate limits per caller
- Pagination with cursor caps
- Tenant scoping where applicable
- Abuse monitoring and logging

### High-risk / disabled unless explicitly approved

These combine aggregation and correlation in ways that produce targeting
intelligence:

- Full database export
- Tribe-wide targeting lists
- "Low reputation pilots near gate X" proximity queries
- Social graph extraction (full vouch/lending network)
- Financial and lending vulnerability maps
- Cross-tenant analytics without consent

Endpoints in this class must not ship without:

- Explicit security review
- Documented justification
- Consent model for affected entities
- Rate and scope constraints
- Abuse detection

## Tenant/Operator Scoping Principle

FrontierWarden is not a centralized public surveillance database. It is
tenant/operator infrastructure where each tribe controls its own gate policy
domain, and cross-tenant data exposure is intentionally constrained.

Access tiers:

| Tier | Sees | Example |
|---|---|---|
| Platform public | Health, docs, single trust checks | Any caller |
| Tenant/operator | Own gates, own policies, scoped proof bundles | Authenticated gate operator |
| Admin/internal | Indexer diagnostics, bulk data, cross-tenant analytics | Project maintainer only |

## Consequences

- New bulk, query, export, leaderboard, or graph-traversal endpoints require
  security review before merge.
- "Public on-chain" is not sufficient justification for unrestricted API access.
- Decision-scoped proof bundles are the preferred response shape — they answer a
  question without enabling surveillance.
- Future agents and contributors must not casually add features that convert
  scoped trust decisions into bulk targeting infrastructure.

## References

- Community critique: "Systems like bounties have a big advantage in that they
  don't suffer from lack of trust. Most apps will end up being closed utilities
  for tribes because it will be really difficult to get trust from the community.
  Anything in their databases can be weaponized by unscrupulous actors."
- FrontierWarden is not dangerous because the data is secret; it is dangerous
  because it makes public data operationally useful.
