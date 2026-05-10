# FrontierWarden Tenant Authority Model

## 1. Overview
FrontierWarden (by Kodaxa) is designed as **platform and operator infrastructure**, rather than a monolithic gate controlled by a single entity. The site/system owner (e.g., Kivik/Kodaxa) is not expected to own or control every world Gate. Instead, the architecture uses a multi-tenant/operator model where each connecting tribe or operator maintains full sovereign control over their own gates.

In this model, **each tribe/operator:**
- Controls its own `GatePolicy` domain.
- Owns its own `GateAdminCap`.
- Must independently prove its own world Gate authority via an `OwnerCap<Gate>`.
- Configures trust settings, schemas, tolls, and political rules subjectively according to their own goals.

## 2. Capability Separation
The architecture enforces strict separation between policy authority and physical world authority:

- **GateAdminCap (FrontierWarden Policy Authority):** Allows an operator to define tolls, trust thresholds, schemas, and update the `GatePolicy` binding to a target `world_gate_id`.
- **OwnerCap<world::gate::Gate> (World Gate Extension Authority):** Allows an operator to authorize the `FrontierWardenAuth` extension on the actual EVE Frontier world Gate, enabling the gate to physically utilize the policy.

*Crucially, the site/system owner does not automatically possess either of these capabilities for tenant gates. The tenant retains full ownership.*

## 3. BOUND vs. BINDING VERIFIED Invariant
Under the multi-tenant logic, the distinction between a configured policy and an active physical integration is paramount:

- **BOUND:** The state where a tenant's `GatePolicy` holds a reference to a specific `world_gate_id`. This simply means the policy "points" to a Gate. It does not prove the tenant controls that Gate, nor does it affect the Gate's physical behavior.
- **BINDING VERIFIED (VERIFIED):** The state achieved only after the tenant operator successfully executes `gate::authorize_extension<FrontierWardenAuth>` using their `OwnerCap<Gate>`. This verifies that the physical world Gate has installed the extension and is strictly governed by the FrontierWarden policy.

The separation ensures that operators can prepare their policies (`BOUND`) before executing the physical on-chain authorization (`VERIFIED`).

## 4. Tenant State Fields
To fully track and serve an operator within the FrontierWarden dashboard, the following tenant state fields are defined:

- **`tenant_id`:** Unique identifier for the tenant/tribe domain.
- **`operator_wallet`:** The primary wallet address used by the operator.
- **`character_id` / `PlayerProfile`:** The EVE identity executing the operations (if known).
- **`gate_policy_id`:** The on-chain `GatePolicy` object ID owned by the tenant.
- **`gate_admin_cap_id`:** The capability object granting policy administration rights.
- **`bound_world_gate_id`:** The world Gate ID the policy currently targets.
- **`owner_cap_id`:** The `OwnerCap<Gate>` object ID, discovered via the connected wallet/Character (if available).
- **`binding_status`:** The progression state (`unbound`, `bound`, or `verified`).
- **`trust_configuration`:** Subjective trust thresholds configured by the operator.
- **`toll_configuration`:** Dynamic fee/toll settings configured by the operator.
- **`enabled_schemas`:** Verification schemas active for the policy.
- **`political_notes`:** Any operator-specific trust or diplomatic metadata.

## 5. OwnerCap Discovery in a Multi-Tenant Context
In previous discoveries, we found that the currently bound Gate was owned by "mumuyu" rather than the site owner ("Kivik"). 
**This is the intended tenant authority model working as designed, not a universal blocker.**
Because each tenant operates their own Gate, OwnerCap discovery must run client-side against **that specific tenant's connected wallet and Character**, rather than relying on the central site owner's credentials.

## 6. Recommended Future Branch Sequence
To implement this operator-driven flow, the following sequence of branches is recommended:

1. **`codex/frontierwarden-tenant-authority-model`** (Current branch: Documenting the architectural shift)
2. **`codex/operator-owned-gate-discovery-hook`** (React hooks for tenants to discover their own `OwnerCap<Gate>` and Character objects)
3. **`codex/operator-gatepolicy-provisioning-flow`** (Frontend flow enabling a tenant to deploy/update their own `GatePolicy`)
4. **`codex/world-gate-extension-authorization-flow`** (PTB implementation for the tenant to authorize the extension using their own `OwnerCap<Gate>`)
