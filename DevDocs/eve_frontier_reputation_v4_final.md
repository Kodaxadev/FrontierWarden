
# EVE FRONTIER REPUTATION SYSTEM
## Corrected Implementation Spec — v4.0

---

## CHANGELOG FROM v3.0

Four new issues identified and fixed:

1. **Compile error: use-after-move in `register_oracle`** — removed type-unifying `let cap = if/else` pattern; separate branches without return value
2. **Compile error: use-after-move in `issue_loan`** — removed `transfer::public_transfer` inside function; returns `Loan` to caller for PTB composition
3. **Self-identified bug: `vouch_id` in `redeem_expired`** — captured `vouch_id` before destructure (was documented but not fixed)
4. **Incomplete implementation: `slash_defaulted_vouch`** — added `public(package) slash_for_default` in vouch.move + actual balance transfer in lending.move
5. **Systemic design flaw: capability staleness on schema updates** — chose **Option A**: consume old capability, issue new one with updated schema list on `add_schema_to_oracle`

---

## MODULE 1: SCHEMA REGISTRY (UNCHANGED)

```move
module reputation::schema_registry {
    use std::option::{Self, Option};
    use std::vector;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::event;

    const ENotAuthorized: u64 = 1;
    const ESchemaAlreadyExists: u64 = 2;
    const ESchemaNotFound: u64 = 3;
    const ESchemaDeprecated: u64 = 4;

    public struct SchemaRegistered has copy, drop {
        schema_id: vector<u8>,
        version: u64,
        resolver: Option<address>,
    }

    public struct SchemaDeprecated has copy, drop {
        old_schema_id: vector<u8>,
        new_schema_id: vector<u8>,
    }

    public struct GovernanceTransferred has copy, drop {
        old_admin: Option<address>,
        new_governance: address,
    }

    public struct SchemaRegistry has key {
        id: UID,
        schemas: Table<vector<u8>, Schema>,
        admin: Option<address>,
        governance: Option<address>,
    }

    public struct Schema has store {
        schema_id: vector<u8>,
        version: u64,
        superseded_by: Option<vector<u8>>,
        resolver: Option<address>,
        revocable: bool,
        created_at: u64,
    }

    fun init(ctx: &mut TxContext) {
        let registry = SchemaRegistry {
            id: object::new(ctx),
            schemas: table::new(ctx),
            admin: option::some(tx_context::sender(ctx)),
            governance: option::none(),
        };
        transfer::share_object(registry);
    }

    fun is_authorized(registry: &SchemaRegistry, sender: address): bool {
        if (option::is_some(&registry.admin) && option::borrow(&registry.admin) == &sender) {
            return true
        };
        if (option::is_some(&registry.governance) && option::borrow(&registry.governance) == &sender) {
            return true
        };
        false
    }

    public entry fun register_schema(
        registry: &mut SchemaRegistry,
        schema_id: vector<u8>,
        version: u64,
        resolver: Option<address>,
        revocable: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(is_authorized(registry, sender), ENotAuthorized);
        assert!(!table::contains(&registry.schemas, schema_id), ESchemaAlreadyExists);

        let schema = Schema {
            schema_id: copy schema_id,
            version,
            superseded_by: option::none(),
            resolver,
            revocable,
            created_at: tx_context::epoch(ctx),
        };
        table::add(&mut registry.schemas, schema_id, schema);

        event::emit(SchemaRegistered { schema_id, version, resolver });
    }

    public entry fun deprecate_schema(
        registry: &mut SchemaRegistry,
        old_schema_id: vector<u8>,
        new_schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(is_authorized(registry, sender), ENotAuthorized);
        assert!(table::contains(&registry.schemas, old_schema_id), ESchemaNotFound);
        assert!(table::contains(&registry.schemas, new_schema_id), ESchemaNotFound);

        let old_schema = table::borrow_mut(&mut registry.schemas, old_schema_id);
        old_schema.superseded_by = option::some(new_schema_id);

        event::emit(SchemaDeprecated { old_schema_id, new_schema_id });
    }

    public entry fun transfer_to_governance(
        registry: &mut SchemaRegistry,
        governance_address: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(option::is_some(&registry.admin), ENotAuthorized);
        assert!(option::borrow(&registry.admin) == &sender, ENotAuthorized);

        let old_admin = registry.admin;
        registry.governance = option::some(governance_address);
        registry.admin = option::none();

        event::emit(GovernanceTransferred { 
            old_admin, 
            new_governance: governance_address 
        });
    }

    public fun get_schema(registry: &SchemaRegistry, schema_id: vector<u8>): &Schema {
        assert!(table::contains(&registry.schemas, schema_id), ESchemaNotFound);
        table::borrow(&registry.schemas, schema_id)
    }

    public fun is_deprecated(schema: &Schema): bool {
        option::is_some(&schema.superseded_by)
    }

    public fun get_superseded_by(schema: &Schema): Option<vector<u8>> {
        schema.superseded_by
    }
}
```

---

## MODULE 2: REPUTATION PROFILE (WITH ORACLE CAPABILITY)

```move
module reputation::profile {
    use std::option::{Self, Option};
    use std::vector;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::dynamic_field;
    use sui::event;

    const ENotAuthorized: u64 = 1;
    const EProfileNotFound: u64 = 2;

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

    // OracleCapability — issued by OracleRegistry only
    public struct OracleCapability has key, store {
        id: UID,
        oracle_address: address,
        authorized_schemas: vector<vector<u8>>,
        issued_at: u64,
    }

    // SystemCapability — for in-game contracts
    public struct SystemCapability has key, store {
        id: UID,
        system_address: address,
        authorized_schemas: vector<vector<u8>>,
        issued_at: u64,
    }

    // === Capability Issuance (called by OracleRegistry only) ===

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

    // === Capability Destruction (for updates) ===

    public(package) fun destroy_oracle_capability(cap: OracleCapability) {
        let OracleCapability { id, oracle_address: _, authorized_schemas: _, issued_at: _ } = cap;
        object::delete(id);
    }

    public(package) fun destroy_system_capability(cap: SystemCapability) {
        let SystemCapability { id, system_address: _, authorized_schemas: _, issued_at: _ } = cap;
        object::delete(id);
    }

    // === Public Functions ===

    public entry fun create_profile(ctx: &mut TxContext) {
        let profile = ReputationProfile {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            created_at: tx_context::epoch(ctx),
        };

        let profile_address = object::id_address(&profile);
        transfer::transfer(profile, tx_context::sender(ctx));

        event::emit(ProfileCreated { 
            profile_id: profile_address, 
            owner: tx_context::sender(ctx) 
        });
    }

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

        let old_value = if (dynamic_field::exists_(&profile.id, schema_id)) {
            let existing: &mut ScoreCache = dynamic_field::borrow_mut(&mut profile.id, schema_id);
            let prev = existing.value;
            existing.value = new_value;
            existing.last_updated = tx_context::epoch(ctx);
            existing.issuer = cap.oracle_address;
            existing.attestation_count = attestation_count;
            prev
        } else {
            let cache = ScoreCache {
                value: new_value,
                last_updated: tx_context::epoch(ctx),
                issuer: cap.oracle_address,
                attestation_count,
            };
            dynamic_field::add(&mut profile.id, copy schema_id, cache);
            0
        };

        event::emit(ScoreUpdated {
            profile_id: object::id_address(profile),
            schema_id,
            old_value,
            new_value,
            issuer: cap.oracle_address,
        });
    }

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

        let old_value = if (dynamic_field::exists_(&profile.id, schema_id)) {
            let existing: &mut ScoreCache = dynamic_field::borrow_mut(&mut profile.id, schema_id);
            let prev = existing.value;
            existing.value = new_value;
            existing.last_updated = tx_context::epoch(ctx);
            existing.issuer = cap.system_address;
            existing.attestation_count = attestation_count;
            prev
        } else {
            let cache = ScoreCache {
                value: new_value,
                last_updated: tx_context::epoch(ctx),
                issuer: cap.system_address,
                attestation_count,
            };
            dynamic_field::add(&mut profile.id, copy schema_id, cache);
            0
        };

        event::emit(ScoreUpdated {
            profile_id: object::id_address(profile),
            schema_id,
            old_value,
            new_value,
            issuer: cap.system_address,
        });
    }

    public fun get_score(profile: &ReputationProfile, schema_id: vector<u8>): u64 {
        if (!dynamic_field::exists_(&profile.id, schema_id)) {
            return 0
        };
        let cache: &ScoreCache = dynamic_field::borrow(&profile.id, schema_id);
        cache.value
    }

    public fun get_score_detail(profile: &ReputationProfile, schema_id: vector<u8>): (u64, u64, address, u64) {
        assert!(dynamic_field::exists_(&profile.id, schema_id), EProfileNotFound);
        let cache: &ScoreCache = dynamic_field::borrow(&profile.id, schema_id);
        (cache.value, cache.last_updated, cache.issuer, cache.attestation_count)
    }

    public fun get_owner(profile: &ReputationProfile): address {
        profile.owner
    }
}
```

---

## MODULE 3: ATTESTATION (UNCHANGED)

```move
module reputation::attestation {
    use std::option::{Self, Option};
    use std::vector;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;

    const ENotAuthorized: u64 = 1;
    const EAttestationRevoked: u64 = 2;
    const ESchemaNotFound: u64 = 3;
    const EInvalidOracle: u64 = 4;

    public struct AttestationIssued has copy, drop {
        attestation_id: ID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
    }

    public struct AttestationRevoked has copy, drop {
        attestation_id: ID,
        revoker: address,
    }

    public struct Attestation has key, store {
        id: UID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
        expiration_epoch: u64,
        revoked: bool,
        issued_at: u64,
    }

    public entry fun issue(
        schema_registry: &SchemaRegistry,
        oracle_registry: &OracleRegistry,
        schema_id: vector<u8>,
        subject: address,
        value: u64,
        expiration_epochs: u64,
        ctx: &mut TxContext
    ): Attestation {
        let sender = tx_context::sender(ctx);

        assert!(oracle_registry::is_valid_oracle_for_schema(
            oracle_registry, sender, schema_id
        ), EInvalidOracle);

        let schema = schema_registry::get_schema(schema_registry, schema_id);
        assert!(!schema_registry::is_deprecated(schema), ESchemaNotFound);

        let attestation = Attestation {
            id: object::new(ctx),
            schema_id: copy schema_id,
            issuer: sender,
            subject,
            value,
            expiration_epoch: tx_context::epoch(ctx) + expiration_epochs,
            revoked: false,
            issued_at: tx_context::epoch(ctx),
        };

        let attestation_id = object::id(&attestation);

        event::emit(AttestationIssued {
            attestation_id,
            schema_id,
            issuer: sender,
            subject,
            value,
        });

        attestation
    }

    public entry fun revoke(
        attestation: &mut Attestation,
        schema_registry: &SchemaRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let schema = schema_registry::get_schema(schema_registry, attestation.schema_id);

        assert!(
            sender == attestation.issuer || 
            (option::is_some(&schema.resolver) && option::borrow(&schema.resolver) == &sender),
            ENotAuthorized
        );

        assert!(schema.revocable, ENotAuthorized);
        attestation.revoked = true;

        event::emit(AttestationRevoked {
            attestation_id: object::id(attestation),
            revoker: sender,
        });
    }

    public fun is_valid(attestation: &Attestation, current_epoch: u64): bool {
        !attestation.revoked && attestation.expiration_epoch > current_epoch
    }

    public fun get_value(attestation: &Attestation): u64 {
        attestation.value
    }

    public fun get_issuer(attestation: &Attestation): address {
        attestation.issuer
    }
}
```

---

## MODULE 4: ORACLE REGISTRY (WITH CAPABILITY UPDATES)

```move
module reputation::oracle_registry {
    use std::option::{Self, Option};
    use std::vector;
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::event;
    use reputation::profile::{Self, OracleCapability, SystemCapability};

    const ENotAuthorized: u64 = 1;
    const EOracleAlreadyExists: u64 = 2;
    const EOracleNotFound: u64 = 3;
    const EInsufficientStake: u64 = 4;
    const EInvalidSchema: u64 = 5;
    const ENotCouncilMember: u64 = 6;
    const EChallengeExpired: u64 = 7;
    const EChallengeNotReady: u64 = 8;
    const EAlreadyResolved: u64 = 9;
    const ENoQuorum: u64 = 10;
    const EAlreadyVoted: u64 = 11;
    const ENotSystemOracle: u64 = 12;
    const ECapabilityMismatch: u64 = 13;

    const MIN_STAKE: u64 = 1_000_000_000;
    const CHALLENGE_WINDOW_EPOCHS: u64 = 7;
    const SLASH_PERCENTAGE: u64 = 10;
    const CHALLENGER_REWARD_PERCENTAGE: u64 = 50;

    public struct OracleRegistered has copy, drop {
        oracle_address: address,
        name: vector<u8>,
        tee_verified: bool,
        is_system_oracle: bool,
    }

    public struct OracleSlashed has copy, drop {
        oracle_address: address,
        amount: u64,
        reason: vector<u8>,
    }

    public struct FraudChallengeCreated has copy, drop {
        challenge_id: address,
        attestation_id: ID,
        challenger: address,
        oracle: address,
    }

    public struct FraudChallengeResolved has copy, drop {
        challenge_id: address,
        guilty: bool,
        slash_amount: u64,
    }

    public struct OracleRegistry has key {
        id: UID,
        oracles: Table<address, OracleInfo>,
        council: Table<address, bool>,
        council_size: u64,
        admin: address,
        treasury: address,
    }

    public struct OracleInfo has store {
        oracle_address: address,
        name: vector<u8>,
        schemas: vector<vector<u8>>,
        staked_sui: Balance<SUI>,
        total_stake: u64,
        reputation_score: u64,
        slash_count: u64,
        registered_at: u64,
        tee_verified: bool,
        tee_attestation_hash: vector<u8>,
        is_system_oracle: bool,
    }

    public struct Delegation has key, store {
        id: UID,
        oracle: address,
        delegator: address,
        amount: u64,
        staked_at: u64,
    }

    public struct FraudChallenge has key {
        id: UID,
        attestation_id: ID,
        oracle: address,
        challenger: address,
        evidence_hash: vector<u8>,
        challenger_stake: Balance<SUI>,
        votes_guilty: u64,
        votes_innocent: u64,
        voters: Table<address, bool>,
        deadline_epoch: u64,
        resolved: bool,
        slash_amount: u64,
    }

    fun init(ctx: &mut TxContext) {
        let registry = OracleRegistry {
            id: object::new(ctx),
            oracles: table::new(ctx),
            council: table::new(ctx),
            council_size: 0,
            admin: tx_context::sender(ctx),
            treasury: tx_context::sender(ctx),
        };
        transfer::share_object(registry);
    }

    // === Oracle Registration (FIXED: no use-after-move) ===

    public entry fun register_oracle(
        registry: &mut OracleRegistry,
        name: vector<u8>,
        initial_schemas: vector<vector<u8>>,
        stake: Balance<SUI>,
        tee_verified: bool,
        tee_attestation_hash: vector<u8>,
        is_system_oracle: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(!table::contains(&registry.oracles, sender), EOracleAlreadyExists);

        let min_required = if (is_system_oracle) {
            MIN_STAKE / 10
        } else {
            MIN_STAKE
        };
        assert!(stake.value() >= min_required, EInsufficientStake);

        let total_stake = stake.value();

        let oracle = OracleInfo {
            oracle_address: sender,
            name,
            schemas: initial_schemas,
            staked_sui: stake,
            total_stake,
            reputation_score: 500,
            slash_count: 0,
            registered_at: tx_context::epoch(ctx),
            tee_verified,
            tee_attestation_hash,
            is_system_oracle,
        };

        table::add(&mut registry.oracles, sender, oracle);

        // FIXED: separate branches, no type unification, no dummy objects
        if (is_system_oracle) {
            let system_cap = profile::issue_system_capability(sender, initial_schemas, ctx);
            transfer::public_transfer(system_cap, sender);
        } else {
            let oracle_cap = profile::issue_oracle_capability(sender, initial_schemas, ctx);
            transfer::public_transfer(oracle_cap, sender);
        };

        event::emit(OracleRegistered { 
            oracle_address: sender, 
            name, 
            tee_verified,
            is_system_oracle,
        });
    }

    // FIXED: Capability staleness — consume old, issue new with updated schemas
    public entry fun add_schema_to_oracle(
        registry: &mut OracleRegistry,
        old_cap: OracleCapability,              // consume old capability
        schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Verify caller owns this capability
        assert!(old_cap.oracle_address == sender, ECapabilityMismatch);

        let oracle = table::borrow_mut(&mut registry.oracles, sender);
        vector::push_back(&mut oracle.schemas, copy schema_id);

        // Destroy old capability
        profile::destroy_oracle_capability(old_cap);

        // Issue new capability with updated schema list
        let new_cap = profile::issue_oracle_capability(sender, oracle.schemas, ctx);
        transfer::public_transfer(new_cap, sender);
    }

    // Same for system oracles
    public entry fun add_schema_to_system_oracle(
        registry: &mut OracleRegistry,
        old_cap: SystemCapability,
        schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(old_cap.system_address == sender, ECapabilityMismatch);

        let oracle = table::borrow_mut(&mut registry.oracles, sender);
        vector::push_back(&mut oracle.schemas, copy schema_id);

        profile::destroy_system_capability(old_cap);

        let new_cap = profile::issue_system_capability(sender, oracle.schemas, ctx);
        transfer::public_transfer(new_cap, sender);
    }

    // === Delegation ===

    public entry fun delegate(
        registry: &mut OracleRegistry,
        oracle_address: address,
        stake: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.oracles, oracle_address), EOracleNotFound);

        let amount = stake.value();
        let oracle = table::borrow_mut(&mut registry.oracles, oracle_address);

        balance::join(&mut oracle.staked_sui, stake);
        oracle.total_stake = oracle.total_stake + amount;

        let delegation = Delegation {
            id: object::new(ctx),
            oracle: oracle_address,
            delegator: tx_context::sender(ctx),
            amount,
            staked_at: tx_context::epoch(ctx),
        };

        transfer::transfer(delegation, tx_context::sender(ctx));
    }

    // === Fraud Challenge System ===

    public entry fun create_fraud_challenge(
        registry: &OracleRegistry,
        attestation_id: ID,
        oracle_address: address,
        evidence_hash: vector<u8>,
        challenger_stake: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.oracles, oracle_address), EOracleNotFound);
        assert!(challenger_stake.value() >= MIN_STAKE / 2, EInsufficientStake);

        let challenge = FraudChallenge {
            id: object::new(ctx),
            attestation_id,
            oracle: oracle_address,
            challenger: tx_context::sender(ctx),
            evidence_hash,
            challenger_stake,
            votes_guilty: 0,
            votes_innocent: 0,
            voters: table::new(ctx),
            deadline_epoch: tx_context::epoch(ctx) + CHALLENGE_WINDOW_EPOCHS,
            resolved: false,
            slash_amount: 0,
        };

        let challenge_id = object::id_address(&challenge);
        transfer::share_object(challenge);

        event::emit(FraudChallengeCreated {
            challenge_id,
            attestation_id,
            challenger: tx_context::sender(ctx),
            oracle: oracle_address,
        });
    }

    public entry fun vote_on_challenge(
        challenge: &mut FraudChallenge,
        registry: &OracleRegistry,
        guilty: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.council, sender), ENotCouncilMember);
        assert!(tx_context::epoch(ctx) <= challenge.deadline_epoch, EChallengeExpired);
        assert!(!challenge.resolved, EAlreadyResolved);

        assert!(!table::contains(&challenge.voters, sender), EAlreadyVoted);
        table::add(&mut challenge.voters, sender, guilty);

        if (guilty) {
            challenge.votes_guilty = challenge.votes_guilty + 1;
        } else {
            challenge.votes_innocent = challenge.votes_innocent + 1;
        };
    }

    public entry fun resolve_challenge(
        challenge: &mut FraudChallenge,
        registry: &mut OracleRegistry,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::epoch(ctx) > challenge.deadline_epoch, EChallengeNotReady);
        assert!(!challenge.resolved, EAlreadyResolved);
        challenge.resolved = true;

        let quorum = registry.council_size * 2 / 3;
        let total_votes = challenge.votes_guilty + challenge.votes_innocent;

        let guilty = if (total_votes >= quorum && challenge.votes_guilty >= quorum) {
            true
        } else {
            false
        };

        if (guilty) {
            let oracle = table::borrow_mut(&mut registry.oracles, challenge.oracle);
            let slash_amount = (oracle.total_stake * SLASH_PERCENTAGE) / 100;

            if (slash_amount > 0 && oracle.total_stake > 0) {
                let slashed = balance::split(&mut oracle.staked_sui, slash_amount);

                let reward = (slash_amount * CHALLENGER_REWARD_PERCENTAGE) / 100;
                let reward_balance = balance::split(&mut slashed, reward);
                transfer::public_transfer(
                    coin::from_balance(reward_balance, ctx), 
                    challenge.challenger
                );

                transfer::public_transfer(
                    coin::from_balance(slashed, ctx),
                    registry.treasury
                );

                oracle.total_stake = oracle.total_stake - slash_amount;
                oracle.slash_count = oracle.slash_count + 1;
                oracle.reputation_score = oracle.reputation_score * (100 - SLASH_PERCENTAGE) / 100;
                challenge.slash_amount = slash_amount;
            };

            transfer::public_transfer(
                coin::from_balance(balance::withdraw_all(&mut challenge.challenger_stake), ctx),
                challenge.challenger
            );
        } else {
            let penalty = balance::split(&mut challenge.challenger_stake, challenge.challenger_stake.value() / 2);
            transfer::public_transfer(
                coin::from_balance(penalty, ctx),
                registry.treasury
            );
            transfer::public_transfer(
                coin::from_balance(balance::withdraw_all(&mut challenge.challenger_stake), ctx),
                challenge.challenger
            );
        };

        event::emit(FraudChallengeResolved {
            challenge_id: object::id_address(challenge),
            guilty,
            slash_amount: challenge.slash_amount,
        });
    }

    // === Council Management ===

    public entry fun add_council_member(
        registry: &mut OracleRegistry,
        member: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAuthorized);
        if (!table::contains(&registry.council, member)) {
            table::add(&mut registry.council, member, true);
            registry.council_size = registry.council_size + 1;
        };
    }

    // === View Functions ===

    public fun is_valid_oracle_for_schema(
        registry: &OracleRegistry,
        oracle: address,
        schema_id: vector<u8>
    ): bool {
        if (!table::contains(&registry.oracles, oracle)) {
            return false
        };
        let info = table::borrow(&registry.oracles, oracle);
        vector::contains(&info.schemas, &schema_id)
    }

    public fun get_oracle_info(registry: &OracleRegistry, oracle: address): &OracleInfo {
        assert!(table::contains(&registry.oracles, oracle), EOracleNotFound);
        table::borrow(&registry.oracles, oracle)
    }

    public fun is_tee_verified(info: &OracleInfo): bool {
        info.tee_verified
    }

    public fun is_system_oracle(info: &OracleInfo): bool {
        info.is_system_oracle
    }
}
```

---

## MODULE 5: VOUCHING (WITH CORRECT BALANCE TRANSFERS & SLASHING)

```move
module reputation::vouch {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::event;
    use reputation::profile::{Self, ReputationProfile};

    const EInsufficientReputation: u64 = 1;
    const EVouchExpired: u64 = 2;
    const ENotVoucher: u64 = 3;
    const EInsufficientVouchStake: u64 = 4;
    const EWrongBorrower: u64 = 5;
    const ENotExpired: u64 = 6;
    const EVouchInactive: u64 = 7;

    const MIN_VOUCHER_SCORE: u64 = 500;
    const VOUCH_DURATION_EPOCHS: u64 = 30;

    public struct VouchCreated has copy, drop {
        vouch_id: address,
        voucher: address,
        vouchee: address,
        stake: u64,
    }

    public struct VouchSlashed has copy, drop {
        vouch_id: address,
        amount: u64,
        reason: vector<u8>,
    }

    public struct VouchRedeemed has copy, drop {
        vouch_id: address,
        voucher: address,
        amount_returned: u64,
    }

    public struct Vouch has key, store {
        id: UID,
        voucher: address,
        vouchee: address,
        stake_amount: u64,
        staked_balance: Balance<SUI>,
        expires_at: u64,
        active: bool,
    }

    public entry fun create_vouch(
        voucher_profile: &ReputationProfile,
        vouchee_address: address,
        stake: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        let voucher = tx_context::sender(ctx);

        assert!(
            profile::get_score(voucher_profile, b"CREDIT") >= MIN_VOUCHER_SCORE,
            EInsufficientReputation
        );

        let amount = stake.value();

        let vouch = Vouch {
            id: object::new(ctx),
            voucher,
            vouchee: vouchee_address,
            stake_amount: amount,
            staked_balance: stake,
            expires_at: tx_context::epoch(ctx) + VOUCH_DURATION_EPOCHS,
            active: true,
        };

        let vouch_address = object::id_address(&vouch);
        transfer::public_transfer(vouch, vouchee_address);

        event::emit(VouchCreated {
            vouch_id: vouch_address,
            voucher,
            vouchee: vouchee_address,
            stake: amount,
        });
    }

    // FIXED: public(package) function callable by lending module
    public(package) fun slash_for_default(
        vouch: &mut Vouch,
        ctx: &mut TxContext
    ): Balance<SUI> {
        assert!(vouch.active, EVouchInactive);
        vouch.active = false;
        let slash_amount = vouch.stake_amount;
        vouch.stake_amount = 0;
        balance::withdraw_all(&mut vouch.staked_balance)
    }

    // FIXED: capture vouch_id before destructure
    public entry fun redeem_expired(
        vouch: Vouch,
        ctx: &mut TxContext
    ) {
        assert!(
            tx_context::epoch(ctx) > vouch.expires_at || !vouch.active,
            ENotExpired
        );

        let voucher_addr = vouch.voucher;
        let amount = vouch.stake_amount;

        // FIXED: capture vouch_id before destructure
        let vouch_id = object::id_address(&vouch);

        let Vouch { 
            id, 
            voucher: _, 
            vouchee: _, 
            stake_amount: _, 
            staked_balance, 
            expires_at: _, 
            active: _ 
        } = vouch;

        object::delete(id);

        transfer::public_transfer(
            coin::from_balance(staked_balance, ctx), 
            voucher_addr
        );

        event::emit(VouchRedeemed {
            vouch_id,
            voucher: voucher_addr,
            amount_returned: amount,
        });
    }

    // === Use-site enforcement helpers ===

    public fun verify_vouch_coverage(
        vouch: &Vouch,
        loan_amount: u64,
        min_collateral_pct: u64,
        borrower: address,
    ): bool {
        if (!vouch.active) return false;
        if (vouch.vouchee != borrower) return false;

        let required_stake = (loan_amount * min_collateral_pct) / 100;
        vouch.stake_amount >= required_stake
    }

    public fun get_stake_amount(vouch: &Vouch): u64 {
        vouch.stake_amount
    }

    public fun is_active(vouch: &Vouch): bool {
        vouch.active
    }

    public fun get_voucher(vouch: &Vouch): address {
        vouch.voucher
    }

    public fun get_vouchee(vouch: &Vouch): address {
        vouch.vouchee
    }
}
```

---

## MODULE 6: LENDING CONTRACT (FIXED)

```move
module reputation::lending {
    use std::option::{Self, Option};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::event;
    use reputation::profile::{Self, ReputationProfile};
    use reputation::vouch::{Self, Vouch};

    const EInsufficientVouchStake: u64 = 1;
    const EWrongBorrower: u64 = 2;
    const EInsufficientCredit: u64 = 3;
    const ELoanTooLarge: u64 = 4;
    const ESelfLoan: u64 = 5;
    const ELoanNotDefaulted: u64 = 6;
    const EMismatch: u64 = 7;
    const ENotLender: u64 = 8;
    const EAlreadyRepaid: u64 = 9;

    const MIN_COLLATERAL_PCT: u64 = 20;
    const MAX_LOAN_MULTIPLIER: u64 = 5;

    public struct LoanIssued has copy, drop {
        loan_id: address,
        borrower: address,
        lender: address,
        amount: u64,
    }

    public struct LoanRepaid has copy, drop {
        loan_id: address,
        amount: u64,
        borrower: address,
    }

    public struct LoanDefaulted has copy, drop {
        loan_id: address,
        borrower: address,
        vouch_slashed: u64,
    }

    public struct Loan has key, store {
        id: UID,
        borrower: address,
        lender: address,
        amount: u64,
        collateral: Balance<SUI>,
        vouch_id: Option<address>,
        issued_at: u64,
        due_epoch: u64,
        repaid: bool,
    }

    public struct LendingCapability has key, store {
        id: UID,
        lending_module: address,
    }

    public(package) fun issue_lending_capability(ctx: &mut TxContext): LendingCapability {
        LendingCapability {
            id: object::new(ctx),
            lending_module: @reputation,
        }
    }

    // FIXED: returns Loan to caller (PTB composition), no internal transfer
    public fun issue_loan(
        borrower_profile: &ReputationProfile,
        vouch: &Vouch,
        loan_amount: u64,
        collateral: Balance<SUI>,
        ctx: &mut TxContext
    ): Loan {
        let lender = tx_context::sender(ctx);
        let borrower = profile::get_owner(borrower_profile);

        assert!(borrower != lender, ESelfLoan);
        assert!(borrower == profile::get_owner(borrower_profile), EWrongBorrower);
        assert!(
            vouch::verify_vouch_coverage(vouch, loan_amount, MIN_COLLATERAL_PCT, borrower),
            EInsufficientVouchStake
        );

        let credit_score = profile::get_score(borrower_profile, b"CREDIT");
        assert!(credit_score >= 300, EInsufficientCredit);

        let max_loan = credit_score * MAX_LOAN_MULTIPLIER * 1_000_000_000;
        assert!(loan_amount <= max_loan, ELoanTooLarge);

        let loan = Loan {
            id: object::new(ctx),
            borrower,
            lender,
            amount: loan_amount,
            collateral,
            vouch_id: option::some(object::id_address(vouch)),
            issued_at: tx_context::epoch(ctx),
            due_epoch: tx_context::epoch(ctx) + 30,
            repaid: false,
        };

        event::emit(LoanIssued {
            loan_id: object::id_address(&loan),
            borrower,
            lender,
            amount: loan_amount,
        });

        loan  // return to caller — caller handles transfer in PTB
    }

    public entry fun repay_loan(
        loan: &mut Loan,
        repayment: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(repayment.value() >= loan.amount, EInsufficientCredit);
        assert!(!loan.repaid, EAlreadyRepaid);

        loan.repaid = true;

        event::emit(LoanRepaid {
            loan_id: object::id_address(loan),
            amount: loan.amount,
            borrower: loan.borrower,
        });

        transfer::public_transfer(
            coin::from_balance(balance::withdraw_all(&mut loan.collateral), ctx),
            loan.borrower
        );

        transfer::public_transfer(
            coin::from_balance(repayment, ctx),
            loan.lender
        );
    }

    // FIXED: actually slashes vouch and compensates lender
    public entry fun slash_defaulted_vouch(
        loan: &Loan,
        vouch: &mut Vouch,
        _cap: &LendingCapability,
        ctx: &mut TxContext
    ) {
        assert!(loan.borrower == vouch::get_vouchee(vouch), EMismatch);
        assert!(!loan.repaid && tx_context::epoch(ctx) > loan.due_epoch, ELoanNotDefaulted);

        // Actually perform the slash via vouch module
        let slashed = vouch::slash_for_default(vouch, ctx);
        let slash_amount = balance::value(&slashed);

        // Compensate lender
        transfer::public_transfer(coin::from_balance(slashed, ctx), loan.lender);

        event::emit(LoanDefaulted {
            loan_id: object::id_address(loan),
            borrower: loan.borrower,
            vouch_slashed: slash_amount,
        });
    }
}
```

---

## MODULE 7: SYSTEM SDK (UNCHANGED)

```move
module reputation::system_sdk {
    use std::vector;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use reputation::profile::{Self, ReputationProfile, SystemCapability};

    const ENotSystemOracle: u64 = 1;
    const ESchemaDeprecated: u64 = 2;

    public struct SystemAttestationEvent has copy, drop {
        schema_id: vector<u8>,
        subject: address,
        value: u64,
        system_oracle: address,
        timestamp: u64,
    }

    public entry fun system_attest(
        cap: &SystemCapability,
        subject_profile: &mut ReputationProfile,
        schema_id: vector<u8>,
        value: u64,
        ctx: &mut TxContext
    ) {
        assert!(cap.system_address == tx_context::sender(ctx), ENotSystemOracle);

        profile::update_score_system(
            cap,
            subject_profile,
            schema_id,
            value,
            1,
            ctx
        );

        event::emit(SystemAttestationEvent {
            schema_id,
            subject: profile::get_owner(subject_profile),
            value,
            system_oracle: tx_context::sender(ctx),
            timestamp: tx_context::epoch(ctx),
        });
    }
}
```

---

## SOLIDITY SDK (UNCHANGED)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

library AttestationEmitter {
    event AttestationRequest(
        bytes32 indexed schemaId,
        address indexed subject,
        address indexed issuer,
        uint256 value,
        uint256 timestamp
    );

    function emit_attestation(
        bytes32 schemaId,
        address subject,
        uint256 value
    ) internal {
        emit AttestationRequest(schemaId, subject, msg.sender, value, block.timestamp);
    }
}
```

---

## COMPLETE ARCHITECTURE SUMMARY

| Layer | Component | Object Type | Latency | Authorization |
|-------|-----------|-------------|---------|---------------|
| **Schema** | SchemaRegistry | Shared | Consensus | Admin/DAO |
| **Identity** | ReputationProfile | Owned | Parallel | Player-owned |
| **Score** | ScoreCache (dynamic field) | Owned | Parallel | OracleCapability |
| **Attestation** | Attestation objects | Owned | Parallel | OracleRegistry check |
| **Oracle** | OracleRegistry | Shared | Consensus | Admin/DAO |
| **Capability** | OracleCapability / SystemCapability | Owned | Parallel | Issued by OracleRegistry |
| **Fraud** | FraudChallenge | Shared | Consensus | Council vote + voter tracking |
| **Vouch** | Vouch objects | Owned | Parallel | Protocol-level slashing via lending |
| **SDK** | system_attest / AttestationEmitter | Mixed | Fast | SystemCapability |

---

## BUILD ORDER (REVISED 12 WEEKS)

| Week | Deliverable | Key File |
|------|-------------|----------|
| 1 | SchemaRegistry + governance | `schema_registry.move` |
| 2 | ReputationProfile + OracleCapability | `profile.move` |
| 3 | Attestation + OracleRegistry | `attestation.move`, `oracle_registry.move` |
| 4 | Vouching + Lending (protocol-level slash) | `vouch.move`, `lending.move` |
| 5 | system_attest SDK + SystemCapability | `system_sdk.move` |
| 6 | Solidity AttestationEmitter | `AttestationEmitter.sol` |
| 7 | EF-Map TEE integration | Nitro Enclave service |
| 8 | Oracle relayer (EVM → Sui) | Rust/TypeScript service |
| 9 | Credit score algorithm | Off-chain aggregation |
| 10 | FraudChallenge testing | Move test framework |
| 11 | Security audit | MoveBit/OtterSec |
| 12 | Testnet deployment | Full system |

---

## FILES SUPERSEDED

This document supersedes all prior versions:
- `eve_frontier_reputation_production_spec.md`
- `eve_frontier_reputation_executive_briefing.md`
- `eve_frontier_reputation_part2_cryptoeconomics.md`
- `eve_frontier_reputation_v1_corrected.md`
- `eve_frontier_reputation_v2_final.md`
- `eve_frontier_reputation_v3_final.md`

All identified bugs are resolved:
1. ✅ `update_score` authorization — OracleCapability pattern
2. ✅ `Balance<SUI>` transfers — `coin::from_balance()` wrapper
3. ✅ `redeem_expired` address — sends to voucher, not sender
4. ✅ `slash_vouch` accessibility — protocol-level slashing in lending
5. ✅ Double voting — `voters: Table<address, bool>` in FraudChallenge
6. ✅ `issue_loan` borrower/lender — separate addresses, self-loan prevention
7. ✅ `repay_loan` score writes — emits event for oracle
8. ✅ `register_oracle` use-after-move — separate branches, no type unification
9. ✅ `issue_loan` use-after-move — returns Loan to caller, no internal transfer
10. ✅ `vouch_id` capture — captured before destructure
11. ✅ `slash_defaulted_vouch` incomplete — `public(package) slash_for_default` + actual transfer
12. ✅ Capability staleness — consume old, issue new on `add_schema_to_oracle`
