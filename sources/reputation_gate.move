// reputation_gate.move -- Smart Gate policy engine for EVE Frontier.
//
// Architectural context:
//   The EVE Frontier game runs on EVM (MUD). Sui is the oracle/reputation layer.
//   This module is the POLICY ENGINE: it evaluates whether a traveler's on-chain
//   TRIBE_STANDING attestation meets the gate owner's threshold, collects a toll
//   if applicable, and emits a PassageGranted event. An off-chain EVM bridge
//   reads these events and relays the decision to the MUD Smart Gate contract.
//
//   The in-game gate enforcement requires the MUD side (out of scope here).
//   This contract is the canonical reputation decision record on Sui.
//
// Flow:
//   1. Gate owner deploys: create_gate(...)     GatePolicy (shared) + GateAdminCap (owned)
//   2. Traveler calls:     check_passage(gate, attestation, payment, ctx)
//                              toll deducted from payment, remainder returned
//                              PassageGranted | PassageDenied event emitted
//   3. EVM bridge watches events     relays allow/deny to MUD Smart Gate
//
// Score tiers (configurable per gate):
//   score >= ally_threshold      ALLY  -- free passage
//   score > 0                   NEUTRAL -- base_toll_mist charged
//   score == 0                  ENEMY  -- blocked (no passage)

module reputation::reputation_gate {

    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};
    use sui::event;
    use reputation::attestation::{Self, Attestation};

    // === Errors ===
    const EGatePaused:            u64 = 1;
    const EPassageDenied:         u64 = 2;
    const EWrongSubject:          u64 = 3;
    const EExpiredAttestation:    u64 = 4;
    const ERevokedAttestation:    u64 = 5;
    const EWrongSchema:           u64 = 6;
    const EInsufficientPayment:   u64 = 7;
    const ENotAdmin:              u64 = 8;
    const EZeroAllyThreshold:     u64 = 9;
    const EAlreadyBound:          u64 = 10;
    const ENotBound:              u64 = 11;

    // === Events ===
    public struct PassageGranted has copy, drop {
        gate_id:      ID,
        traveler:     address,
        score:        u64,
        toll_paid:    u64,
        tier:         u8,   // 0 = ally (free), 1 = neutral (toll), 2 = enemy (blocked -- not emitted)
        epoch:        u64,
    }

    public struct PassageDenied has copy, drop {
        gate_id:  ID,
        traveler: address,
        reason:   u8,   // 0 = enemy score, 1 = paused, 2 = expired, 3 = revoked
        epoch:    u64,
    }

    public struct GateConfigUpdated has copy, drop {
        gate_id:         ID,
        ally_threshold:  u64,
        base_toll_mist:  u64,
    }

    public struct TollsWithdrawn has copy, drop {
        gate_id: ID,
        owner:   address,
        amount:  u64,
    }

    public struct GatePolicyBoundToWorldGate has copy, drop {
        gate_policy_id: ID,
        world_gate_id:  ID,
        owner:          address,
        epoch:          u64,
    }

    public struct GatePolicyUnboundFromWorldGate has copy, drop {
        gate_policy_id: ID,
        world_gate_id:  ID,
        owner:          address,
        epoch:          u64,
    }

    // === Structs ===

    /// Shared object -- deployed once per gate. Stores policy params + toll accumulator.
    public struct GatePolicy has key {
        id:              UID,
        owner:           address,
        // Schema that gate reads: must be b"TRIBE_STANDING" or a custom standing schema.
        schema_id:       vector<u8>,
        // Score >= ally_threshold     free passage. Must be > 0.
        ally_threshold:  u64,
        // Score == 0     blocked. Score > 0 && < ally_threshold     neutral toll.
        base_toll_mist:  u64,
        // Accumulated tolls, withdrawable by owner via GateAdminCap.
        treasury:        Balance<SUI>,
        paused:          bool,
        world_gate_id:   Option<ID>,
    }

    /// Owned by gate deployer. Required for all admin operations.
    public struct GateAdminCap has key, store {
        id:      UID,
        gate_id: ID,
    }

    // === Init / Deployment ===

    /// Deploy a new reputation-gated Smart Gate policy.
    /// Emits no event -- deployment is indexed off the shared object creation.
    #[allow(lint(self_transfer))]
    public fun create_gate(
        schema_id:      vector<u8>,
        ally_threshold: u64,
        base_toll_mist: u64,
        ctx:            &mut TxContext,
    ) {
        assert!(ally_threshold > 0, EZeroAllyThreshold);

        let policy = GatePolicy {
            id:             object::new(ctx),
            owner:          tx_context::sender(ctx),
            schema_id,
            ally_threshold,
            base_toll_mist,
            treasury:       balance::zero<SUI>(),
            paused:         false,
            world_gate_id:  option::none<ID>(),
        };
        let cap = GateAdminCap {
            id:      object::new(ctx),
            gate_id: object::id(&policy),
        };

        transfer::share_object(policy);
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    // === Passage Check ===

    /// Core gate check. Traveler presents their TRIBE_STANDING attestation and payment.
    ///
    /// Validates:
    ///   - Gate is not paused
    ///   - Attestation schema matches gate's required schema
    ///   - Attestation subject == tx sender (can't use someone else's rep)
    ///   - Attestation is not revoked
    ///   - Attestation is not expired
    ///   - Score is > 0 (score == 0     enemy     denied)
    ///   - Payment covers the toll for the traveler's tier
    ///
    /// On success: deducts toll from payment, returns remainder to sender,
    ///             emits PassageGranted. On denial: emits PassageDenied and aborts.
    #[allow(lint(self_transfer))]
    public fun check_passage(
        gate:        &mut GatePolicy,
        attestation: &Attestation,
        payment:     Coin<SUI>,
        ctx:         &mut TxContext,
    ) {
        let sender    = tx_context::sender(ctx);
        let epoch     = tx_context::epoch(ctx);
        let gate_id   = object::id(gate);

        // 1. Paused?
        if (gate.paused) {
            event::emit(PassageDenied { gate_id, traveler: sender, reason: 1, epoch });
            abort EGatePaused
        };

        // 2. Schema check
        assert!(
            attestation::get_schema_id(attestation) == gate.schema_id,
            EWrongSchema
        );

        // 3. Subject must be the caller -- prevents rep laundering
        assert!(
            attestation::get_subject(attestation) == sender,
            EWrongSubject
        );

        // 4. Revocation check
        assert!(!attestation::is_revoked(attestation), ERevokedAttestation);

        // 5. Expiry check
        assert!(attestation::is_valid(attestation, epoch), EExpiredAttestation);

        let score = attestation::get_value(attestation);

        // 6. Enemy check (score == 0     no standing     blocked)
        if (score == 0) {
            event::emit(PassageDenied { gate_id, traveler: sender, reason: 0, epoch });
            abort EPassageDenied
        };

        // 7. Determine toll tier
        let (toll, tier): (u64, u8) = if (score >= gate.ally_threshold) {
            (0, 0)                       // ALLY -- free
        } else {
            (gate.base_toll_mist, 1)     // NEUTRAL -- standard toll
        };

        // 8. Collect toll (split from payment, return change)
        let payment_val = coin::value(&payment);
        assert!(payment_val >= toll, EInsufficientPayment);

        if (toll > 0) {
            let mut pay_mut = payment;
            let toll_coin   = coin::split(&mut pay_mut, toll, ctx);
            balance::join(&mut gate.treasury, coin::into_balance(toll_coin));
            // Return remainder (may be zero-value coin -- caller can merge or destroy)
            transfer::public_transfer(pay_mut, sender);
        } else {
            // Free passage -- return entire payment
            transfer::public_transfer(payment, sender);
        };

        event::emit(PassageGranted { gate_id, traveler: sender, score, toll_paid: toll, tier, epoch });
    }

    // === Admin Operations ===

    fun assert_admin(cap: &GateAdminCap, gate: &GatePolicy) {
        assert!(cap.gate_id == object::id(gate), ENotAdmin);
    }

    /// Update passage thresholds. Effective immediately for all future calls.
    public fun update_thresholds(
        cap:            &GateAdminCap,
        gate:           &mut GatePolicy,
        ally_threshold: u64,
        base_toll_mist: u64,
    ) {
        assert_admin(cap, gate);
        assert!(ally_threshold > 0, EZeroAllyThreshold);
        gate.ally_threshold  = ally_threshold;
        gate.base_toll_mist  = base_toll_mist;
        event::emit(GateConfigUpdated {
            gate_id: object::id(gate),
            ally_threshold,
            base_toll_mist,
        });
    }

    /// Emergency pause. All passage attempts abort with EGatePaused.
    public fun pause(cap: &GateAdminCap, gate: &mut GatePolicy) {
        assert_admin(cap, gate);
        gate.paused = true;
    }

    /// Lift pause.
    public fun unpause(cap: &GateAdminCap, gate: &mut GatePolicy) {
        assert_admin(cap, gate);
        gate.paused = false;
    }

    /// Drain accumulated toll treasury to gate owner.
    public fun withdraw_tolls(
        cap:  &GateAdminCap,
        gate: &mut GatePolicy,
        ctx:  &mut TxContext,
    ) {
        assert_admin(cap, gate);
        let amount = balance::value(&gate.treasury);
        if (amount > 0) {
            let payout = coin::from_balance(balance::split(&mut gate.treasury, amount), ctx);
            transfer::public_transfer(payout, gate.owner);
        };
        event::emit(TollsWithdrawn { gate_id: object::id(gate), owner: gate.owner, amount });
    }

    /// Bind this FrontierWarden policy to one EVE world Gate object.
    public fun bind_world_gate(
        cap:           &GateAdminCap,
        gate:          &mut GatePolicy,
        world_gate_id: ID,
        ctx:           &mut TxContext,
    ) {
        assert_admin(cap, gate);
        assert!(option::is_none(&gate.world_gate_id), EAlreadyBound);
        gate.world_gate_id = option::some(world_gate_id);
        event::emit(GatePolicyBoundToWorldGate {
            gate_policy_id: object::id(gate),
            world_gate_id,
            owner: tx_context::sender(ctx),
            epoch: tx_context::epoch(ctx),
        });
    }

    /// Clear an existing world Gate binding. Rebinding requires this explicit step.
    public fun unbind_world_gate(
        cap:  &GateAdminCap,
        gate: &mut GatePolicy,
        ctx:  &mut TxContext,
    ) {
        assert_admin(cap, gate);
        assert!(option::is_some(&gate.world_gate_id), ENotBound);
        let world_gate_id = option::extract(&mut gate.world_gate_id);
        event::emit(GatePolicyUnboundFromWorldGate {
            gate_policy_id: object::id(gate),
            world_gate_id,
            owner: tx_context::sender(ctx),
            epoch: tx_context::epoch(ctx),
        });
    }

    // === View Functions ===

    public fun get_ally_threshold(gate: &GatePolicy): u64  { gate.ally_threshold }
    public fun get_base_toll(gate: &GatePolicy): u64        { gate.base_toll_mist }
    public fun is_paused(gate: &GatePolicy): bool           { gate.paused }
    public fun treasury_balance(gate: &GatePolicy): u64     { balance::value(&gate.treasury) }
    public fun is_world_gate_bound(gate: &GatePolicy): bool { option::is_some(&gate.world_gate_id) }

    public fun get_bound_world_gate_id(gate: &GatePolicy): ID {
        assert!(option::is_some(&gate.world_gate_id), ENotBound);
        *option::borrow(&gate.world_gate_id)
    }
}
