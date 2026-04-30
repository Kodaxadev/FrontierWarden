#[allow(lint(self_transfer))]
module reputation::oracle_registry {

    use sui::table::{Self, Table};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use reputation::profile::{Self, OracleCapability, SystemCapability};

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const EOracleAlreadyExists: u64 = 2;
    const EOracleNotFound: u64 = 3;
    const EInsufficientStake: u64 = 4;
    const ECapabilityMismatch: u64 = 13;

    // === Constants ===
    const MIN_STAKE: u64 = 1_000_000_000; // 1 SUI in MIST
    // SLASH_PERCENTAGE and CHALLENGER_REWARD_PERCENTAGE live in fraud_challenge.move.
    // They are passed as arguments to slash_oracle_stake so oracle_registry stays
    // agnostic about fraud policy -- only fraud_challenge knows the percentages.

    // === Events ===
    public struct OracleRegistered has copy, drop {
        oracle_address: address,
        name: vector<u8>,
        tee_verified: bool,
        is_system_oracle: bool,
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

    // schemas_for_cap is copied before move into OracleInfo (prevents use-after-move).
    // Separate branches for system vs normal oracle -- no type unification required.
    public fun register_oracle(
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

        if (is_system_oracle) {
            assert!(sender == registry.admin, ENotAuthorized);
        };
        let min_required = if (is_system_oracle) { MIN_STAKE / 10 } else { MIN_STAKE };
        assert!(balance::value(&stake) >= min_required, EInsufficientStake);

        let stake_val = balance::value(&stake);
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

        if (is_system_oracle) {
            let cap = profile::issue_system_capability(sender, schemas_for_cap, ctx);
            transfer::public_transfer(cap, sender);
        } else {
            let cap = profile::issue_oracle_capability(sender, schemas_for_cap, ctx);
            transfer::public_transfer(cap, sender);
        };

        event::emit(OracleRegistered { oracle_address: sender, name, tee_verified, is_system_oracle });
    }

    // Consumes old capability and issues a fresh one with the updated schema list.
    public fun add_schema_to_oracle(
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

    public fun add_schema_to_system_oracle(
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

    // ---------------------------------------------------------------------------
    // SPRINT 2 -- undelegate() implementation spec
    // Do NOT implement until devnet publish is green (module upgrade compatibility
    // must be verified before adding new on-chain objects/fields).
    //
    // STRUCT CHANGE -- replace Delegation with DelegatorPosition:
    //
    //   public struct DelegatorPosition has key, store {
    //       id: UID,
    //       oracle_id: address,
    //       delegator: address,
    //       shares: u64,        // proportional claim on oracle.staked_sui
    //       staked_at: u64,
    //   }
    //
    // FIELD CHANGE -- add to OracleInfo:
    //
    //   total_shares: u64,      // cumulative shares outstanding (starts at 0)
    //
    // UPDATE delegate() -- replace Delegation issuance with DelegatorPosition:
    //
    //   let balance_before = oracle.total_stake;   // snapshot before join
    //   balance::join(&mut oracle.staked_sui, stake);
    //   oracle.total_stake = oracle.total_stake + amount;
    //   let shares = if (oracle.total_shares == 0) {
    //       amount                                  // first deposit: 1 share per MIST
    //   } else {
    //       (amount * oracle.total_shares) / balance_before
    //       // ROUNDING: truncates toward zero (user bears the loss on small
    //       // deposits relative to total_shares). Same convention as Sui's
    //       // staking_pool.move. Document and accept.
    //   };
    //   oracle.total_shares = oracle.total_shares + shares;
    //   transfer::transfer(
    //       DelegatorPosition { id: object::new(ctx), oracle_id: oracle_address,
    //                           delegator: tx_context::sender(ctx),
    //                           shares, staked_at: tx_context::epoch(ctx) },
    //       tx_context::sender(ctx)
    //   );
    //
    // NEW undelegate() entry function:
    //
    //   public entry fun undelegate(
    //       registry: &mut OracleRegistry,
    //       position: DelegatorPosition,
    //       ctx: &mut TxContext
    //   ) {
    //       assert!(position.delegator == tx_context::sender(ctx), ENotAuthorized);
    //       assert!(table::contains(&registry.oracles, position.oracle_id), EOracleNotFound);
    //       let oracle = table::borrow_mut(&mut registry.oracles, position.oracle_id);
    //       // Proportional withdrawal: shares/total_shares of current balance.
    //       // Safe from divide-by-zero: total_shares >= position.shares > 0.
    //       let withdraw_amount =
    //           (balance::value(&oracle.staked_sui) * position.shares) / oracle.total_shares;
    //       oracle.total_shares = oracle.total_shares - position.shares;
    //       oracle.total_stake  = oracle.total_stake - withdraw_amount;
    //       let payout = balance::split(&mut oracle.staked_sui, withdraw_amount);
    //       let DelegatorPosition { id, oracle_id: _, delegator: _, shares: _, staked_at: _ }
    //           = position;
    //       object::delete(id);
    //       transfer::public_transfer(coin::from_balance(payout, ctx), tx_context::sender(ctx));
    //   }
    //
    // NOTE: undelegate() needs `coin` import added back to oracle_registry.move.
    // NOTE: oracle reward distribution (sprint 3) uses the same total_shares field,
    //       so the two features share one data structure with no further refactor needed.
    // ---------------------------------------------------------------------------

    public fun delegate(
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

    // === Council Management ===

    public fun add_council_member(
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

    // === Bridge Functions (called by fraud_challenge.move) ===
    // BRIDGE: These functions are coupling points between oracle_registry and
    // fraud_challenge. If OracleRegistry fields (oracles, council) change shape,
    // grep "// BRIDGE" in both files to find all affected sites.

    /// BRIDGE -- Returns true if oracle_address is registered in the registry.
    public fun contains_oracle(registry: &OracleRegistry, oracle: address): bool {
        table::contains(&registry.oracles, oracle)
    }

    /// BRIDGE -- Returns true if addr is an active council member.
    public fun is_council_member(registry: &OracleRegistry, addr: address): bool {
        table::contains(&registry.council, addr)
    }

    /// BRIDGE -- Returns the current council member count (used for quorum calculation).
    public fun get_council_size(registry: &OracleRegistry): u64 {
        registry.council_size
    }

    /// BRIDGE -- Returns the treasury address (slash proceeds destination).
    public fun get_treasury(registry: &OracleRegistry): address {
        registry.treasury
    }

    /// BRIDGE -- Slashes an oracle's stake; returns (challenger_reward, treasury_amount, slash_total).
    /// Caller is responsible for transferring both returned balances.
    /// slash_pct and challenger_reward_pct are supplied by fraud_challenge.move so
    /// oracle_registry stays agnostic about fraud policy.
    public(package) fun slash_oracle_stake(
        registry: &mut OracleRegistry,
        oracle_addr: address,
        slash_pct: u64,
        challenger_reward_pct: u64,
    ): (Balance<SUI>, Balance<SUI>, u64) {
        let oracle = table::borrow_mut(&mut registry.oracles, oracle_addr);
        let slash_amount = (oracle.total_stake * slash_pct) / 100;
        if (slash_amount == 0) {
            return (balance::zero(), balance::zero(), 0)
        };
        let mut slashed = balance::split(&mut oracle.staked_sui, slash_amount);
        let reward = (slash_amount * challenger_reward_pct) / 100;
        let reward_bal = balance::split(&mut slashed, reward);
        oracle.total_stake = oracle.total_stake - slash_amount;
        oracle.slash_count = oracle.slash_count + 1;
        oracle.reputation_score = oracle.reputation_score * (100 - slash_pct) / 100;
        (reward_bal, slashed, slash_amount)
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

    public fun is_valid_oracle_for_schema_via_cap(
        cap: &OracleCapability, schema_id: vector<u8>
    ): bool {
        profile::is_schema_authorized(cap, schema_id)
    }

    // === Test Helpers ===
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
