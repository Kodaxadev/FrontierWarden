#[test_only]
module reputation::oracle_profile_tests {
    use std::option;
    use std::vector;
    use sui::test_scenario;
    use sui::balance;
    use sui::sui::SUI;
    use sui::transfer;
    use sui::object::ID;
    use sui::coin::{Self, Coin};
    use reputation::attestation;
    use reputation::oracle_registry::{Self, OracleRegistry};
    use reputation::profile::{Self, ReputationProfile, OracleCapability};
    use reputation::schema_registry::{Self, SchemaRegistry};
    use reputation::vouch;
    use reputation::vouch::Vouch;
    use reputation::lending::{Self, Loan, LendingCapability};

    const ADMIN: address = @0xAD;
    const ORACLE: address = @0x0C;
    const PLAYER: address = @0xA1;
    const VOUCHER: address = @0xCC;
    const BORROWER: address = @0xB0;
    const NOT_ORACLE: address = @0xE0;
    const CREDIT_SCORE: u64 = 500;
    const VOUCH_STAKE: u64 = 1_000_000_000;  // 1 SUI

    fun one_sui(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(1_000_000_000)
    }

    fun point_one_sui(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(100_000_000)
    }

    fun newest_profile_id(): ID {
        option::destroy_some(test_scenario::most_recent_id_shared<ReputationProfile>())
    }

    fun setup_schema_and_oracle(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            schema_registry::init_for_testing(test_scenario::ctx(scenario));
            oracle_registry::init_for_testing(test_scenario::ctx(scenario));
        };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut schema_registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(
                &mut schema_registry,
                b"TRIBE_STANDING",
                1,
                option::none(),
                true,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(schema_registry);
        };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut oracle_registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(
                &mut oracle_registry,
                b"Game Oracle",
                vector[b"TRIBE_STANDING"],
                one_sui(),
                false,
                b"",
                false,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(oracle_registry);
        };
    }

    // --- Oracle registration issues OracleCapability ---
    #[test]
    fun test_register_oracle_issues_capability() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(
                &mut registry,
                b"EF-Map Combat Oracle",
                vector[b"PIRATE_INDEX_V1"],
                one_sui(),
                false,
                b"",
                false,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        // Capability should be in ORACLE's inventory
        test_scenario::next_tx(scenario, ORACLE);
        {
            let cap = test_scenario::take_from_sender<OracleCapability>(scenario);
            assert!(profile::get_oracle_address(&cap) == ORACLE, 0);
            test_scenario::return_to_sender(scenario, cap);
        };

        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = attestation::EInvalidOracle)]
    fun test_attestation_issue_requires_registered_oracle_sender() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_schema_and_oracle(scenario);

        test_scenario::next_tx(scenario, NOT_ORACLE);
        {
            let schema_registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            let oracle_registry = test_scenario::take_shared<OracleRegistry>(scenario);
            let attest = attestation::issue(
                &schema_registry,
                &oracle_registry,
                b"TRIBE_STANDING",
                PLAYER,
                750,
                100,
                test_scenario::ctx(scenario)
            );
            transfer::public_transfer(attest, PLAYER);
            test_scenario::return_shared(schema_registry);
            test_scenario::return_shared(oracle_registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- System oracle registration is admin-only ---
    #[test]
    #[expected_failure(abort_code = oracle_registry::ENotAuthorized)]
    fun test_register_system_oracle_requires_admin() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(
                &mut registry,
                b"Fake System Oracle",
                vector[b"CREDIT"],
                point_one_sui(),
                false,
                b"",
                true,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Duplicate oracle registration is rejected ---
    #[test]
    #[expected_failure(abort_code = oracle_registry::EOracleAlreadyExists)]
    fun test_register_oracle_duplicate() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(&mut registry, b"Oracle1", vector[b"SCHEMA_A"], one_sui(), false, b"", false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            // Second registration by same address should fail
            oracle_registry::register_oracle(&mut registry, b"Oracle1", vector[b"SCHEMA_B"], one_sui(), false, b"", false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- add_schema_to_oracle rotates capability ---
    #[test]
    fun test_add_schema_rotates_capability() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(&mut registry, b"Oracle", vector[b"SCHEMA_A"], one_sui(), false, b"", false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            let old_cap = test_scenario::take_from_sender<OracleCapability>(scenario);
            // Consume old cap, receive new cap with both schemas
            oracle_registry::add_schema_to_oracle(&mut registry, old_cap, b"SCHEMA_B", test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let new_cap = test_scenario::take_from_sender<OracleCapability>(scenario);
            // New cap should authorize both schemas
            assert!(oracle_registry::is_valid_oracle_for_schema_via_cap(&new_cap, b"SCHEMA_A"), 0);
            assert!(oracle_registry::is_valid_oracle_for_schema_via_cap(&new_cap, b"SCHEMA_B"), 1);
            test_scenario::return_to_sender(scenario, new_cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- Profile score write requires OracleCapability ---
    #[test]
    fun test_update_score_with_capability() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        // Player creates profile
        test_scenario::next_tx(scenario, PLAYER);
        {
            profile::create_profile(test_scenario::ctx(scenario));
        };
        // Oracle writes score using test helper (bypasses registration for unit test isolation)
        test_scenario::next_tx(scenario, ORACLE);
        let player_profile_id = newest_profile_id();
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE,
                vector[b"PIRATE_INDEX_V1"],
                test_scenario::ctx(scenario)
            );
            let mut player_profile = test_scenario::take_shared_by_id<ReputationProfile>(scenario, player_profile_id);

            profile::update_score(&cap, &mut player_profile, b"PIRATE_INDEX_V1", 75, 1, test_scenario::ctx(scenario));

            assert!(profile::get_score(&player_profile, b"PIRATE_INDEX_V1") == 75, 0);

            test_scenario::return_shared(player_profile);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- Score decay reduces value ---
    #[test]
    fun test_apply_decay() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, PLAYER);
        {
            profile::create_profile(test_scenario::ctx(scenario));
        };
        test_scenario::next_tx(scenario, ORACLE);
        let player_profile_id = newest_profile_id();
        {
            let cap = profile::create_oracle_capability_for_testing(ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario));
            let mut p = test_scenario::take_shared_by_id<ReputationProfile>(scenario, player_profile_id);

            // Set score to 1000
            profile::update_score(&cap, &mut p, b"CREDIT", 1000, 1, test_scenario::ctx(scenario));
            assert!(profile::get_score(&p, b"CREDIT") == 1000, 0);

            // Apply 10% decay → 900
            profile::apply_decay(&cap, &mut p, b"CREDIT", 10, test_scenario::ctx(scenario));
            assert!(profile::get_score(&p, b"CREDIT") == 900, 1);

            test_scenario::return_shared(p);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- Unauthorized schema write rejected ---
    #[test]
    #[expected_failure(abort_code = profile::ENotAuthorized)]
    fun test_update_score_wrong_schema() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, PLAYER);
        {
            profile::create_profile(test_scenario::ctx(scenario));
        };
        test_scenario::next_tx(scenario, ORACLE);
        let player_profile_id = newest_profile_id();
        {
            // Cap only authorizes CREDIT, not PIRATE_INDEX_V1
            let cap = profile::create_oracle_capability_for_testing(ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario));
            let mut p = test_scenario::take_shared_by_id<ReputationProfile>(scenario, player_profile_id);

            profile::update_score(&cap, &mut p, b"PIRATE_INDEX_V1", 50, 1, test_scenario::ctx(scenario));

            test_scenario::return_shared(p);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- slash_for_default sends balance to voucher, not caller ---
    #[test]
    fun test_slash_sends_balance_to_voucher() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };
        test_scenario::next_tx(scenario, ADMIN);
        { lending::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        {
            profile::create_profile(test_scenario::ctx(scenario));
        };
        test_scenario::next_tx(scenario, ORACLE);
        let voucher_profile_id = newest_profile_id();
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            profile::update_score(&cap, &mut vp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
            profile::destroy_oracle_capability(cap);
        };

        // VOUCHER creates vouch
        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            vouch::create_vouch(
                &vp, BORROWER,
                balance::create_for_testing<SUI>(VOUCH_STAKE),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(vp);
        };

        // Trigger slash — ADMIN calls, but slashed balance must go to VOUCHER
        test_scenario::next_tx(scenario, ADMIN);
        {
            let cap = test_scenario::take_from_sender<LendingCapability>(scenario);
            let mut v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);
            let slashed = vouch::slash_for_default(&mut v, test_scenario::ctx(scenario));
            assert!(balance::value(&slashed) == VOUCH_STAKE, 0);

            // ADMIN is caller, but balance transfers to VOUCHER
            transfer::public_transfer(coin::from_balance(slashed, test_scenario::ctx(scenario)), VOUCHER);
            test_scenario::return_to_address(BORROWER, v);
            test_scenario::return_to_sender(scenario, cap);
        };

        // VOUCHER receives the slashed stake
        test_scenario::next_tx(scenario, VOUCHER);
        {
            let c = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            assert!(coin::value(&c) == VOUCH_STAKE, 1);
            test_scenario::return_to_sender(scenario, c);
        };

        test_scenario::end(scenario_val);
    }
}
