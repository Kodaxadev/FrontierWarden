#[test_only]
module reputation::vouch_tests {
    use sui::test_scenario;
    use sui::balance;
    use sui::sui::SUI;
    use reputation::oracle_registry;
    use reputation::profile::{Self, ReputationProfile};
    use reputation::vouch::{Self, Vouch};

    const ADMIN: address = @0xAD;
    const ORACLE: address = @0x0C;
    const VOUCHER: address = @0xCC;
    const BORROWER: address = @0xB0;

    const VOUCH_STAKE: u64 = 1_000_000_000; // 1 SUI
    const CREDIT_SCORE: u64 = 500;

    fun vouch_stake(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(VOUCH_STAKE)
    }

    // Shared setup: oracle cap + VOUCHER credit score
    fun setup_voucher_with_score(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_from_address<ReputationProfile>(scenario, VOUCHER);
            profile::update_score(&cap, &mut vp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            test_scenario::return_to_address(VOUCHER, vp);
            profile::destroy_oracle_capability(cap);
        };
    }

    // --- 1. Vouch creation transfers object to vouchee ---
    #[test]
    fun test_create_vouch_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_voucher_with_score(scenario);

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, vp);
        };

        test_scenario::next_tx(scenario, BORROWER);
        {
            let v = test_scenario::take_from_sender<Vouch>(scenario);
            assert!(vouch::is_active(&v), 0);
            assert!(vouch::get_stake_amount(&v) == VOUCH_STAKE, 1);
            assert!(vouch::get_voucher(&v) == VOUCHER, 2);
            assert!(vouch::get_vouchee(&v) == BORROWER, 3);
            test_scenario::return_to_sender(scenario, v);
        };

        test_scenario::end(scenario_val);
    }

    // --- 2. Score below MIN_VOUCHER_SCORE (500) blocks vouch creation ---
    #[test]
    #[expected_failure(abort_code = vouch::EInsufficientReputation)]
    fun test_create_vouch_insufficient_rep() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        // Score stays at 0 — below the 500 threshold
        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, vp);
        };

        test_scenario::end(scenario_val);
    }

    // --- 3. redeem_expired rejected while vouch is active and not expired ---
    #[test]
    #[expected_failure(abort_code = vouch::ENotExpired)]
    fun test_redeem_not_expired_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_voucher_with_score(scenario);

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, vp);
        };

        // Active vouch at epoch 0 (expires at 30) — must fail
        test_scenario::next_tx(scenario, BORROWER);
        {
            let v = test_scenario::take_from_sender<Vouch>(scenario);
            vouch::redeem_expired(v, test_scenario::ctx(scenario));
        };

        test_scenario::end(scenario_val);
    }
}
