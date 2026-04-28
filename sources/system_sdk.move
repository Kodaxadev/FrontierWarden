module reputation::system_sdk {
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use reputation::profile::{Self, ReputationProfile, SystemCapability};

    // === Errors ===
    const ENotSystemOracle: u64 = 1;

    // === Events ===
    public struct SystemAttestationEvent has copy, drop {
        schema_id: vector<u8>,
        subject: address,
        value: u64,
        system_oracle: address,
        timestamp: u64,
    }

    // One-call attestation for in-game contracts (CradleOS, Blood Contract, Bazaar)
    // Requires SystemCapability -- issued to the contract at oracle registration
    // FIX: uses profile::get_system_address() instead of private cap.system_address field access
    public entry fun system_attest(
        cap: &SystemCapability,
        subject_profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        value: u64,
        ctx: &mut TxContext
    ) {
        assert!(profile::get_system_address(cap) == tx_context::sender(ctx), ENotSystemOracle);

        profile::update_score_system(cap, subject_profile, schema_id, value, 1, ctx);

        event::emit(SystemAttestationEvent {
            schema_id,
            subject: profile::get_owner(subject_profile),
            value,
            system_oracle: tx_context::sender(ctx),
            timestamp: tx_context::epoch(ctx),
        });
    }
}
