# ADR: Private Tenant Data Encryption via Keyspace

> Status: deferred / watch  
> Decision: Do not integrate Keyspace until license, adoption, Seal stability, and tribe/group-role support mature.  
> Date: 2026-05-16  
> Context: data aggregation risk ADR identified need for encrypted tenant-private layer

## Summary

Evaluate whether [loash-industries/keyspace](https://github.com/loash-industries/keyspace)
can provide an encrypted tenant-private data layer for FrontierWarden, protecting
operator notes, political reasoning, and tribe-specific context from exposure
through Supabase or public APIs.

## Background: Three-Layer Data Model

FrontierWarden data separates into three classes:

| Layer | Examples | Visibility |
|---|---|---|
| 1. Public proof | On-chain events, GatePolicy state, binding evidence, extension evidence, trust decision proof bundles | Fully public, must remain verifiable |
| 2. Derived advisory | Trust scores, topology warnings, indexed traffic, recent jumps | Sensitive due to aggregation risk (see ADR_DATA_AGGREGATION_RISK.md) |
| 3. Tenant-private | Operator notes, political reasoning, tribe-specific trust annotations, private labels, route intel | Must not be exposed outside the tenant |

This ADR concerns layer 3 only.

## What Keyspace Provides

**Repository:** github.com/loash-industries/keyspace  
**Created:** 2026-05-02 (14 days old at time of evaluation)  
**Community:** 0 stars, 0 forks, no license declared  
**Version:** 1.0.2  
**Upstream dependency:** [MystenLabs/seal](https://github.com/MystenLabs/seal)
(v0.6.7, 406 stars, 2.1k forks, official Mysten Labs project)

### Architecture

```
Client App (TypeScript SDK)
  → Sui blockchain (ACL membership objects, epoch tracking)
  → Seal key servers (threshold decryption policy enforcement)
  → IPFS/Walrus (encrypted blob storage)
```

### Core Capabilities

| Capability | Mechanism |
|---|---|
| ACL creation | `createAcl()` → on-chain ACL object + AdminCap NFT |
| Role grants | `addRole({ type: 'address', address })` → epoch increment |
| Role revokes | `removeRole()` → epoch increment → entries become stale |
| Encrypted write | Plaintext → local encryption → blob upload → on-chain entry metadata |
| Encrypted read | Seal session key request → ACL policy check → threshold key → download → local decrypt |
| Stale-entry rotation | `rotateAllStaleEntries()` — re-encrypts under new epoch; revoked members lose access only after rotation |
| AdminCap transfer | `transferAdminCap()` — original owner loses write access |
| Storage adapters | Pinata (IPFS) built-in; Walrus or custom via `StorageAdapter` interface |

### Limitations Observed

- Role types: only `address` is implemented. Tribe/group roles noted as "requires
  contract upgrade" — not yet available.
- Seal session keys cached 10 minutes; wallet prompt per TTL window.
- Revocation is not instant — requires explicit rotation of all stale entries.
- No indexer built-in for discovery (optional `indexerUrl` for `getAccessibleAcls`).
- Storage requires either Pinata JWT or custom Walrus adapter.

## Mapping to FrontierWarden

### Candidate Encrypted Objects (Layer 3)

These contain subjective, political, or operationally sensitive tenant context:

| Object | Why encrypted |
|---|---|
| Tenant political notes | "We trust Tribe A but not their logistics wing" |
| Private trust annotations | Allow/deny rationale beyond public threshold |
| Private gate operating notes | "Restricted due to recent betrayal" |
| Private route/gate procedures | "Only allow during joint ops" |
| Private incident reports | Tribe-internal security events |
| Operator-only exports | Filtered views of derived data |
| Encrypted runbooks | Operational playbooks for gate management |

### Must NOT Be Encrypted (Needs Public Proof)

These lose their value if they cannot be independently verified:

| Object | Why public |
|---|---|
| GatePolicy object state | Other tools verify gate rules exist on-chain |
| Binding events | Proves GatePolicy → world gate linkage |
| Extension authorization evidence | Proves world gate → extension TypeName |
| Trust decision proof bundle | Third parties verify decision was grounded in protocol state |
| On-chain attestation events | Public audit trail for reputation claims |

### AdminCap → Operator Authority Mapping

| Keyspace concept | FrontierWarden equivalent |
|---|---|
| ACL AdminCap | Gate operator wallet (session-authenticated) |
| ACL roles (address-based) | Tribe members authorized to view private notes |
| ACL epoch | Membership version; rotation required on member removal |
| Entry write | Operator creates private annotation |
| Entry read | Tribe member accesses shared private context |

## Risk Assessment

### High Risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Keyspace immaturity** | 14 days old, zero community, no license, single maintainer | Do not adopt until: license declared, 6+ months stability, or fork and vendor |
| **Seal pre-1.0** | MystenLabs/seal at v0.6.7; API may break | Pin version; monitor releases; accept testnet-only until 1.0 |
| **Key server availability** | Seal aggregator downtime = cannot decrypt | Degrade gracefully; private notes are non-critical path for gate decisions |
| **Revocation lag** | Removed members retain read access until rotation completes | Acceptable for notes/annotations; unacceptable for time-sensitive secrets |

### Medium Risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Role drift vs tribe membership** | In-game tribe changes don't auto-sync to on-chain ACL | Build sync hook or manual operator rotation |
| **Admin-cap custody** | Single wallet controls ACL; loss = permanent lockout | Transfer to multisig when governance matures |
| **Storage backend trust** | Pinata is centralized; blobs could be deleted | Mirror to Walrus; keep entry metadata on-chain as recovery index |
| **No group roles** | Only address-based roles; tribe-level roles not implemented | Acceptable for small operator groups; revisit when Keyspace ships group roles |

### Low Risks

| Risk | Detail |
|---|---|
| Seal session key TTL (10 min) | Acceptable UX for operator console |
| Wallet prompt per session | Already present in FrontierWarden operator flow |
| IPFS content addressing | CIDs are deterministic; encrypted blobs are safe to store publicly |

## Decision Criteria for Adoption

Do NOT adopt Keyspace until:

1. **License declared** — currently unlicensed; cannot ship in production.
2. **Seal reaches 1.0** or Mysten Labs declares mainnet-ready.
3. **Keyspace has 6+ months of release history** or is forked/vendored with
   security review.
4. **Group/tribe roles ship** — or FrontierWarden accepts address-only ACLs.
5. **Walrus adapter exists** — reduces dependency on centralized Pinata.

## Recommended Path

```
Now (2026-05):
  - Document the three-layer data model (done: this ADR + ADR_DATA_AGGREGATION_RISK.md)
  - Do not store tenant-private notes in plain Supabase rows
  - If tenant notes are needed before Keyspace matures, use application-level
    encryption with operator-held keys (simpler, no Seal dependency)

When Keyspace matures (estimate 2026 Q3/Q4):
  - Re-evaluate: license, Seal stability, community adoption
  - Prototype: single ACL per gate operator, encrypted annotations
  - Validate: revocation flow works for tribe membership changes
  - Ship: behind feature flag, tenant opt-in

Long-term:
  - Migrate tenant-private layer to Keyspace or equivalent
  - AdminCap transfer to multisig aligns with governance roadmap
  - Walrus storage aligns with Sui ecosystem direction
```

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Plain Supabase RLS | Already deployed; simple | Not encrypted at rest; DB admin can read; weaponization risk |
| Application-level AES | No external dependency; operator holds key | No on-chain ACL; no threshold decryption; key management burden |
| Keyspace (this ADR) | On-chain ACL; threshold encryption; revocation | Immature; Seal pre-1.0; no license; address-only roles |
| Custom Seal integration | Skip Keyspace; use Seal directly | More engineering; same Seal maturity risk; re-inventing ACL layer |
| Lit Protocol | Established; cross-chain | Not Sui-native; adds bridge dependency; different trust model |

## Conclusion

Keyspace is architecturally the right shape for FrontierWarden's encrypted
tenant-private layer. The mapping from ACL AdminCap to gate operator authority is
clean. The three-layer data model it enables (public proof / derived advisory /
tenant-private encrypted) directly addresses the community trust critique.

However, **adoption is premature**. The library is 14 days old with no license,
no community, and depends on a pre-1.0 Seal release. The correct action is to
document the target architecture, avoid storing sensitive tenant notes in plain
Supabase rows, and re-evaluate when Keyspace or an equivalent matures.

## References

- [ADR_DATA_AGGREGATION_RISK.md](./ADR_DATA_AGGREGATION_RISK.md) — aggregation
  risk policy (prerequisite context)
- [SECURITY.md](../SECURITY.md) — trust boundaries and governance state
- [loash-industries/keyspace](https://github.com/loash-industries/keyspace) — SDK
  evaluated
- [MystenLabs/seal](https://github.com/MystenLabs/seal) — upstream threshold
  encryption (v0.6.7, official Mysten Labs)
