module reputation::profile {

    use sui::dynamic_field;
    use sui::event;

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const EProfileNotFound: u64 = 2;
    const EInvalidDecayPct: u64 = 3;

    // === Events ===
    public struct ProfileCreated has copy, drop {
        profile_id: address,
        owner: address,
    }

    public struct ScoreUpdated has copy, drop {
        profile_id: address,
        schema_id: vector<u8>,
        old_value: u64,
        new_value: u64,
        issuer: address,
    }

    // === Structs ===

    // SBT: non-transferable (no `store` ability)
    public struct ReputationProfile has key {
        id: UID,
        owner: address,
        created_at: u64,
    }

    public struct ScoreCache has store {
        value: u64,
        last_updated: u64,
        issuer: address,
        attestation_count: u64,
    }

    // OracleCapability -- issued by OracleRegistry only, authorizes score writes
    public struct OracleCapability has key, store {
        id: UID,
        oracle_address: address,
        authorized_schemas: vector<vector<u8>>,
        issued_at: u64,
    }

    // SystemCapability -- for in-game contracts (CradleOS, Blood Contract, etc.)
    public struct SystemCapability has key, store {
        id: UID,
        system_address: address,
        authorized_schemas: vector<vector<u8>>,
        issued_at: u64,
    }

    // === Capability Issuance (package-internal -- only OracleRegistry calls these) ===

    public(package) fun issue_oracle_capability(
        oracle_address: address,
        schemas: vector<vector<u8>>,
        ctx: &mut TxContext
    ): OracleCapability {
        OracleCapability {
            id: object::new(ctx),
            oracle_address,
            authorized_schemas: schemas,
            issued_at: tx_context::epoch(ctx),
        }
    }

    public(package) fun issue_system_capability(
        system_address: address,
        schemas: vector<vector<u8>>,
        ctx: &mut TxContext
    ): SystemCapability {
        SystemCapability {
            id: object::new(ctx),
            system_address,
            authorized_schemas: schemas,
            issued_at: tx_context::epoch(ctx),
        }
    }

    // === Capability Destruction (for schema-list updates in OracleRegistry) ===

    public(package) fun destroy_oracle_capability(cap: OracleCapability) {
        let OracleCapability { id, oracle_address: _, authorized_schemas: _, issued_at: _ } = cap;
        object::delete(id);
    }

    public(package) fun destroy_system_capability(cap: SystemCapability) {
        let SystemCapability { id, system_address: _, authorized_schemas: _, issued_at: _ } = cap;
        object::delete(id);
    }

    // === Capability Accessors (FIX: private fields inaccessible from other modules) ===

    public fun get_oracle_address(cap: &OracleCapability): address {
        cap.oracle_address
    }

    public fun get_system_address(cap: &SystemCapability): address {
        cap.system_address
    }

    // === Profile Functions ===

    public fun create_profile(ctx: &mut TxContext) {
        let profile = ReputationProfile {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            created_at: tx_context::epoch(ctx),
        };

        let profile_address = object::id_address(&profile);
        transfer::share_object(profile);

        event::emit(ProfileCreated {
            profile_id: profile_address,
            owner: tx_context::sender(ctx),
        });
    }

    // Requires OracleCapability -- prevents unauthorized score writes
    public fun update_score(
        cap: &OracleCapability,
        profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        new_value: u64,
        attestation_count: u64,
        ctx: &mut TxContext
    ) {
        assert!(cap.oracle_address == tx_context::sender(ctx), ENotAuthorized);
        assert!(vector::contains(&cap.authorized_schemas, &schema_id), ENotAuthorized);

        let (old_value, _) = write_score_cache(profile, copy schema_id, new_value, attestation_count, cap.oracle_address, ctx);

        event::emit(ScoreUpdated {
            profile_id: object::id_address(profile),
            schema_id,
            old_value,
            new_value,
            issuer: cap.oracle_address,
        });
    }

    // System oracle variant for in-game contracts
    public fun update_score_system(
        cap: &SystemCapability,
        profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        new_value: u64,
        attestation_count: u64,
        ctx: &mut TxContext
    ) {
        assert!(cap.system_address == tx_context::sender(ctx), ENotAuthorized);
        assert!(vector::contains(&cap.authorized_schemas, &schema_id), ENotAuthorized);

        let (old_value, _) = write_score_cache(profile, copy schema_id, new_value, attestation_count, cap.system_address, ctx);

        event::emit(ScoreUpdated {
            profile_id: object::id_address(profile),
            schema_id,
            old_value,
            new_value,
            issuer: cap.system_address,
        });
    }

    // Score decay -- oracle calls this on a schedule to fade inactive scores
    public fun apply_decay(
        cap: &OracleCapability,
        profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        decay_pct: u64,
        ctx: &mut TxContext
    ) {
        assert!(cap.oracle_address == tx_context::sender(ctx), ENotAuthorized);
        assert!(vector::contains(&cap.authorized_schemas, &schema_id), ENotAuthorized);
        assert!(decay_pct <= 100, EInvalidDecayPct);
        // P3: zero-decay is a guaranteed no-op -- skip dynamic field access and event emission.
        if (decay_pct == 0) { return };

        if (!dynamic_field::exists_(&profile.id, schema_id)) { return };

        let (old_value, new_value) = {
            let existing: &mut ScoreCache = dynamic_field::borrow_mut(&mut profile.id, schema_id);
            let old = existing.value;
            let new = old - (old * decay_pct) / 100;
            existing.value = new;
            existing.last_updated = tx_context::epoch(ctx);
            (old, new)
        };

        event::emit(ScoreUpdated {
            profile_id: object::id_address(profile),
            schema_id,
            old_value,
            new_value,
            issuer: cap.oracle_address,
        });
    }

    // === View Functions ===

    public fun get_score(profile: &ReputationProfile, schema_id: vector<u8>): u64 {
        if (!dynamic_field::exists_(&profile.id, schema_id)) { return 0 };
        let cache: &ScoreCache = dynamic_field::borrow(&profile.id, schema_id);
        cache.value
    }

    public fun get_score_detail(
        profile: &ReputationProfile,
        schema_id: vector<u8>
    ): (u64, u64, address, u64) {
        assert!(dynamic_field::exists_(&profile.id, schema_id), EProfileNotFound);
        let cache: &ScoreCache = dynamic_field::borrow(&profile.id, schema_id);
        (cache.value, cache.last_updated, cache.issuer, cache.attestation_count)
    }

    public fun get_owner(profile: &ReputationProfile): address {
        profile.owner
    }

    public fun is_schema_authorized(cap: &OracleCapability, schema_id: vector<u8>): bool {
        vector::contains(&cap.authorized_schemas, &schema_id)
    }

    // === Internal Helpers ===

    fun write_score_cache(
        profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        new_value: u64,
        attestation_count: u64,
        issuer: address,
        ctx: &TxContext
    ): (u64, u64) {
        if (dynamic_field::exists_(&profile.id, schema_id)) {
            let existing: &mut ScoreCache = dynamic_field::borrow_mut(&mut profile.id, schema_id);
            let prev = existing.value;
            existing.value = new_value;
            existing.last_updated = tx_context::epoch(ctx);
            existing.issuer = issuer;
            existing.attestation_count = attestation_count;
            (prev, new_value)
        } else {
            let cache = ScoreCache {
                value: new_value,
                last_updated: tx_context::epoch(ctx),
                issuer,
                attestation_count,
            };
            dynamic_field::add(&mut profile.id, copy schema_id, cache);
            (0, new_value)
        }
    }

    // === Test Helpers ===
    #[test_only]
    public fun create_oracle_capability_for_testing(
        oracle_address: address,
        schemas: vector<vector<u8>>,
        ctx: &mut TxContext
    ): OracleCapability {
        issue_oracle_capability(oracle_address, schemas, ctx)
    }

    #[test_only]
    public fun create_system_capability_for_testing(
        system_address: address,
        schemas: vector<vector<u8>>,
        ctx: &mut TxContext
    ): SystemCapability {
        issue_system_capability(system_address, schemas, ctx)
    }
}
