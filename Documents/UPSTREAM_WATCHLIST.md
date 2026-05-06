# FrontierWarden Upstream Watchlist

**Status:** Living docs/runbook note
**Last updated:** 2026-05-06
**Scope:** EVE Frontier upstream sources, docs, tooling, and community references
that can affect FrontierWarden assumptions.

## Authority Tiers

### Tier 1 - Authoritative Source

- `evefrontier/world-contracts`
  - `contracts/world/sources/assemblies/gate.move`
  - `contracts/world/sources/character/character.move`
  - `contracts/world/sources/access/*`
  - `contracts/world/Published.toml`
  - `Move.lock`

Use these for contract behavior, event shapes, TypeName behavior, package
lineage, and ownership-capability semantics.

### Tier 2 - Official Builder Documentation

- World Upgrades: `https://docs.evefrontier.com/tools/world-upgrades`
- Smart Gate build: `https://docs.evefrontier.com/smart-assemblies/gate/build`
- Storage Unit build: `https://docs.evefrontier.com/smart-assemblies/storage-unit/build`
- Turret build: `https://docs.evefrontier.com/smart-assemblies/turret/build`
- Move Patterns in Frontier:
  `https://docs.evefrontier.com/smart-contracts/move-patterns-in-frontier`
- Ownership Model:
  `https://docs.evefrontier.com/smart-contracts/ownership-model`
- dApps Quick Start:
  `https://docs.evefrontier.com/dapps/dapps-quick-start`

Use these for intended builder patterns and official explanations after source
changes land.

### Tier 3 - Official/Community Tooling

- `efctl` docs and source references.
- `evefrontier/builder-scaffold`, especially
  `move-contracts/smart_gate_extension`.
- `@evefrontier/dapp-kit` docs and package releases.

These are implementation aids. They can guide FrontierWarden build/deploy work,
but they do not override contract source.

### Tier 4 - Community References

- Ocky-Public/Frontier-Indexer.

Use only as a query/indexing pattern reference. Do not cite it as authoritative
for EVE Frontier contract semantics.

## Package Upgrade Watch

Monitor for:

- `Published.toml` `original-id` changes.
- `Published.toml` `published-at` changes.
- `Move.lock` dependency lineage changes.
- `UpgradeCap` ownership or upgrade process changes.
- MVR setup or package-resolution changes.
- Docs changes that alter package-ID guidance for event filters, object type
  lookups, or new function calls.

Current FrontierWarden rule:

```text
Event filters: world original/type-origin ID.
Object type lookups: the package ID in the object's type string.
New function calls: current published-at unless intentionally pinned.
```

## Discovery Watch

Current link audit signal:

- `slug` and approval concepts appear in current docs/audit output.
- Exact Discovery registry/listing schema is not source-confirmed as final.

Monitor for:

- Required listing fields.
- `slug` uniqueness rules.
- Approval workflow and authority.
- Walrus URI or metadata-hash requirements.
- Registry/listing object IDs.
- dApp category/facet fields.
- Smart assembly listing fields.

## Scaffold And Template Watch

Monitor for:

- `builder-scaffold/move-contracts/smart_gate_extension` renames.
- Broken references to `move-contracts/smart_gate`.
- Template updates to OwnerCap borrowing/return patterns.
- TypeName witness naming changes.
- `efctl` command changes in scaffold docs.

## Event Shape Watch

Monitor `gate.move` and generated builder docs for changes to:

- `ExtensionAuthorizedEvent`
- `ExtensionRevokedEvent`
- `GateCreatedEvent`
- `GateLinkedEvent`
- `GateUnlinkedEvent`
- `JumpEvent`
- OwnerCap-related access events

Any event-shape change should trigger an indexer parser review before deploy.
