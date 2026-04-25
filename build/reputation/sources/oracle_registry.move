module reputation::oracle_registry {
    use std::vector;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::vec_set::{Self, VecSet};
    use sui::event;
    use reputation::profile::{Self, OracleCapability, SystemCapability};

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const EOracleAlreadyExists: u64 = 2;
    const EOracleNotFound: u64 = 3;
    const EInsufficientStake: u64 = 4;
    const ENotCouncilMember: u64 = 6;
    const EChallengeExpired: u64 = 7;
    const EChallengeNotReady: u64 = 8;
    const EAlreadyResolved: u64 = 9;
    const EAlreadyVoted: u64 = 11;
    const ECapabilityMismatch: u64 = 13;
    const ENotResolved: u64 = 14;

    // === Constants ===
    const MIN_STAKE: u64 = 1_000_000_000; // 1 SUI in MIST
    const CHALLENGE_WINDOW_EPOCHS: u64 = 7;
    const SLASH_PERCENTAGE: u64 = 10;
    const CHALLENGER_REWARD_PERCENTAGE: u64 = 50;

    // === Events ===
    public struct OracleRegistered has copy, drop {
        oracle_address: address,
        name: vector<u8>,
        tee_verified: bool,
        is_system_oracle: bool,
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

    // === Structs ===
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

    // FIX: voters changed from Table<address,bool> to VecSet<address>
    // VecSet has `drop`, preventing resource leak; O(n) lookup is fine for bounded council (max 9)
    public struct FraudChallenge has key {
        id: UID,
        attestation_id: ID,
        oracle: address,
        challenger: address,
        evidence_hash: vector<u8>,
        challenger_stake: Balance<SUI>,
        votes_guilty: u64,
        votes_innocent: u64,
        voters: VecSet<address>,
        deadline_epoch: u64,
        resolved: bool,
        slash_amount: u64,
    }

    // === Init ===
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

    // === Oracle Registration ===

    // FIX: schemas_for_cap copied before move into OracleInfo (prevents use-after-move)
    // FIX: separate branches — no type unification, no dummy capability objects
    // FIX: use profile::get_oracle_address / get_system_address in add_schema functions
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

        let min_required = if (is_system_oracle) { MIN_STAKE / 10 } else { MIN_STAKE };
        assert!(balance::value(&stake) >= min_required, EInsufficientStake);

        // Get stake value before moving stake into struct
        let stake_val = balance::value(&stake);

        // FIX: copy schemas before moving into struct so capability issuance can use them
        let schemas_for_cap = copy initial_schemas;

        let oracle = OracleInfo {
            oracle_address: sender,
            name,
            schemas: initial_schemas,
            staked_sui: stake,
            total_stake: stake_val,
            reputation_score: 500,
            slash_count: 0,
            registered_at: tx_context::epoch(ctx),
            tee_verified,
            tee_attestation_hash,
            is_system_oracle,
        };
        table::add(&mut registry.oracles, sender, oracle);

        // FIX: separate branches with no shared return type
        if (is_system_oracle) {
            let cap = profile::issue_system_capability(sender, schemas_for_cap, ctx);
            transfer::public_transfer(cap, sender);
        } else {
            let cap = profile::issue_oracle_capability(sender, schemas_for_cap, ctx);
            transfer::public_transfer(cap, sender);
        };

        event::emit(OracleRegistered { oracle_address: sender, name, tee_verified, is_system_oracle });
    }

    // FIX: consumes old capability and issues fresh one with updated schema list
    // FIX: uses profile::get_oracle_address() instead of private field access
    public entry fun add_schema_to_oracle(
        registry: &mut OracleRegistry,
        old_cap: OracleCapability,
        schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(profile::get_oracle_address(&old_cap) == sender, ECapabilityMismatch);
        assert!(table::contains(&registry.oracles, sender), EOracleNotFound);

        let oracle = table::borrow_mut(&mut registry.oracles, sender);
        vector::push_back(&mut oracle.schemas, schema_id);
        let updated_schemas = oracle.schemas;

        profile::destroy_oracle_capability(old_cap);
        let new_cap = profile::issue_oracle_capability(sender, updated_schemas, ctx);
        transfer::public_transfer(new_cap, sender);
    }

    // FIX: uses profile::get_system_address() instead of private field access
    public entry fun add_schema_to_system_oracle(
        registry: &mut OracleRegistry,
        old_cap: SystemCapability,
        schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(profile::get_system_address(&old_cap) == sender, ECapabilityMismatch);
        assert!(table::contains(&registry.oracles, sender), EOracleNotFound);

        let oracle = table::borrow_mut(&mut registry.oracles, sender);
        vector::push_back(&mut oracle.schemas, schema_id);
        let updated_schemas = oracle.schemas;

        profile::destroy_system_capability(old_cap);
        let new_cap = profile::issue_system_capability(sender, updated_schemas, ctx);
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

        let amount = balance::value(&stake);
        let oracle = table::borrow_mut(&mut registry.oracles, oracle_address);
        balance::join(&mut oracle.staked_sui, stake);
        oracle.total_stake = oracle.total_stake + amount;

        transfer::transfer(
            Delegation {
                id: object::new(ctx),
                oracle: oracle_address,
                delegator: tx_context::sender(ctx),
                amount,
                staked_at: tx_context::epoch(ctx),
            },
            tx_context::sender(ctx)
        );
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
        assert!(balance::value(&challenger_stake) >= MIN_STAKE / 2, EInsufficientStake);

        let challenge_id;
        let challenge = FraudChallenge {
            id: object::new(ctx),
            attestation_id,
            oracle: oracle_address,
            challenger: tx_context::sender(ctx),
            evidence_hash,
            challenger_stake,
            votes_guilty: 0,
            votes_innocent: 0,
            voters: vec_set::empty(),
            deadline_epoch: tx_context::epoch(ctx) + CHALLENGE_WINDOW_EPOCHS,
            resolved: false,
            slash_amount: 0,
        };
        challenge_id = object::id_address(&challenge);
        transfer::share_object(challenge);

        event::emit(FraudChallengeCreated {
            challenge_id,
            attestation_id,
            challenger: tx_context::sender(ctx),
            oracle: oracle_address,
        });
    }

    // FIX: VecSet prevents double voting without needing Table lifecycle management
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
        assert!(!vec_set::contains(&challenge.voters, &sender), EAlreadyVoted);

        vec_set::insert(&mut challenge.voters, sender);
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
        let guilty = total_votes >= quorum && challenge.votes_guilty >= quorum;
        let challenge_addr = object::id_address(challenge);

        if (guilty) {
            let oracle = table::borrow_mut(&mut registry.oracles, challenge.oracle);
            let slash_amount = (oracle.total_stake * SLASH_PERCENTAGE) / 100;

            if (slash_amount > 0) {
                let mut slashed = balance::split(&mut oracle.staked_sui, slash_amount);
                let reward = (slash_amount * CHALLENGER_REWARD_PERCENTAGE) / 100;
                let reward_bal = balance::split(&mut slashed, reward);
                transfer::public_transfer(coin::from_balance(reward_bal, ctx), challenge.challenger);
                transfer::public_transfer(coin::from_balance(slashed, ctx), registry.treasury);
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
            let stake_half = balance::value(&challenge.challenger_stake) / 2;
            let penalty = balance::split(&mut challenge.challenger_stake, stake_half);
            transfer::public_transfer(coin::from_balance(penalty, ctx), registry.treasury);
            transfer::public_transfer(
                coin::from_balance(balance::withdraw_all(&mut challenge.challenger_stake), ctx),
                challenge.challenger
            );
        };

        event::emit(FraudChallengeResolved { challenge_id: challenge_addr, guilty, slash_amount: challenge.slash_amount });
    }

    // FIX: allows GC of resolved challenges — Balance is empty post-resolution, VecSet has drop
    public entry fun delete_resolved_challenge(challenge: FraudChallenge, _ctx: &mut TxContext) {
        assert!(challenge.resolved, ENotResolved);
        let FraudChallenge {
            id, attestation_id: _, oracle: _, challenger: _, evidence_hash: _,
            challenger_stake, votes_guilty: _, votes_innocent: _, voters: _,
            deadline_epoch: _, resolved: _, slash_amount: _,
        } = challenge;
        object::delete(id);
        balance::destroy_zero(challenger_stake);
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
        if (!table::contains(&registry.oracles, oracle)) { return false };
        let info = table::borrow(&registry.oracles, oracle);
        vector::contains(&info.schemas, &schema_id)
    }

    public fun get_oracle_info(registry: &OracleRegistry, oracle: address): &OracleInfo {
        assert!(table::contains(&registry.oracles, oracle), EOracleNotFound);
        table::borrow(&registry.oracles, oracle)
    }

    public fun is_tee_verified(info: &OracleInfo): bool { info.tee_verified }
    public fun is_system_oracle(info: &OracleInfo): bool { info.is_system_oracle }
    public fun get_reputation_score(info: &OracleInfo): u64 { info.reputation_score }

    public fun is_valid_oracle_for_schema_via_cap(cap: &OracleCapability, schema_id: vector<u8>): bool {
        profile::is_schema_authorized(cap, schema_id)
    }

    // === Test Helpers ===
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
