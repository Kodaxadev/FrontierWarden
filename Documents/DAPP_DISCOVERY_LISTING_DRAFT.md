# FrontierWarden dApp Discovery Listing Draft

**Status:** Draft only
**Last updated:** 2026-05-07
**Environment:** Stillness/testnet

This document prepares FrontierWarden for a future EVE Frontier dApp Discovery
listing. The exact registry/listing schema and approval workflow are unverified
until source-confirmed. Current docs/audit output suggests `slug` and approval
concepts exist, but this draft must not be treated as the final schema.

## Metadata JSON Draft

```json
{
  "name": "FrontierWarden",
  "slug": "frontierwarden",
  "description": "Trust and reputation layer for EVE Frontier with Gate Intel, Trust API decisions, Node Sentinel, and sponsored gate passage diagnostics.",
  "categories": ["trust", "reputation", "gate-intel", "operator-tools"],
  "smartAssemblyFacets": ["gate"],
  "liveUrl": "https://frontierwarden.kodaxa.dev",
  "repositoryUrl": "https://github.com/Kodaxadev/FrontierWarden",
  "tenant": "stillness",
  "network": "testnet",
  "packageIds": {
    "frontierWarden": "0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa",
    "worldOriginalId": "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c",
    "worldPublishedAt": "0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780"
  },
  "docs": {
    "trustApi": "Documents/TRUST_API.md",
    "security": "SECURITY.md",
    "deployment": "Documents/DEPLOYMENT_RAILWAY_VERCEL.md"
  },
  "wallets": ["EVE Vault"],
  "walrusUri": "TODO_UNVERIFIED",
  "metadataHash": "TODO_UNVERIFIED",
  "registryObjectId": "TODO_UNVERIFIED",
  "listingObjectId": "TODO_UNVERIFIED"
}
```

## Proof And Status Copy

Short copy:

```text
FrontierWarden is a live Stillness/testnet trust and reputation layer for EVE
Frontier. It exposes Trust API decisions, Gate Intel, Node Sentinel, Social
profile/vouch surfaces, and sponsored gate-passage diagnostics.
```

Current binding status for listing review:

```text
Active GatePolicy: 0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807
Bound world Gate: 0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c
State: BOUND, not BINDING VERIFIED
FrontierWarden world Gate extension evidence: absent
```

Long copy:

```text
FrontierWarden helps EVE Frontier operators evaluate trust-sensitive decisions:
gate access, counterparty risk, and bounty trust. The live app includes Gate
Intel, Node Sentinel, Trust Console, Social/profile flows, and EVE Vault
transaction signing support on Stillness/testnet.
```

## Live Capabilities

- Trust API v1 actions: `gate_access`, `counterparty_risk`, `bounty_trust`.
- Gate Intel with live testnet gate data and passage feed.
- Node Sentinel console for advisory topology/identity signals.
- Social/profile surfaces for reputation and vouch workflows.
- Sponsored gate passage path with diagnostics for wallet/session failures.
- EVE Vault support.

## Caveats

- FrontierWarden is not currently installed as a verified world Gate extension.
- The active GatePolicy is bound to a world Gate, but this is not `BINDING
  VERIFIED` because FrontierWarden extension authorization evidence is absent.
- Binding proves `GatePolicy -> world_gate_id`; extension authorization proves
  `world_gate_id -> extension TypeName`; verified requires both.
- `slug` and approval concepts appear in current docs/audit, but exact dApp
  Discovery schema and approval workflow are unverified.
- Walrus URI, metadata hash, registry object ID, and listing object ID remain
  placeholders until source-confirmed.

## Listing Readiness Checklist

- Confirm final Discovery metadata schema.
- Confirm approval authority and process.
- Confirm whether `slug` is required and globally unique.
- Confirm whether Walrus-hosted metadata is required.
- Confirm whether package IDs, live URL, repo URL, or screenshots are mandatory.
- Confirm how smart-assembly facets are represented.
- Confirm whether Stillness/testnet dApps can be listed before mainnet.
