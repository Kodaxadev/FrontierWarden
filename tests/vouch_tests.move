#[test_only]
module reputation::vouch_tests {
    use std::option;
    use sui::balance;
    use sui::object::ID;
    use sui::sui::SUI;
    use sui::test_scenario;
    use reputation::oracle_registry;
    use reputation::profile::{Self, ReputationProfile};
    use reputation::vouch::{Self, Vouch};

    const ADMIN: address = @0xAD;
    const ORACLE: address = @0x0C;
    const VOUCHER: address = @0xCC;
    const BORROWER: address = @0xB0;

    const VOUCH_STAKE: u64 = 1_000_000_000;
    const CREDIT_SCORE: u64 = 500;

    fun vouch_stake(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(VOUCH_STAKE)
    }

    fun newest_profile_id(): ID {
        option::destroy_some(test_scenario::most_recent_id_shared<ReputationProfile>())
    }

    fun setup_voucher_with_score(scenario: &mut test_scenario::Scenario): ID {
        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        let voucher_profile_id = newest_profile_id();
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_shared_by_id<ReputationProfile>(
                scenario,
                voucher_profile_id,
            );
            profile::update_score(&cap, &mut vp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
            profile::destroy_oracle_capability(cap);
        };

        voucher_profile_id
    }

    #[test]
    fun test_create_vouch_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        let voucher_profile_id = setup_voucher_with_score(scenario);

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
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

    #[test]
    #[expected_failure(abort_code = vouch::EInsufficientReputation)]
    fun test_create_vouch_insufficient_rep() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        let voucher_profile_id = newest_profile_id();
        {
            let vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
        };

        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = vouch::EProfileOwnerMismatch)]
    fun test_create_vouch_rejects_foreign_profile() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        let voucher_profile_id = setup_voucher_with_score(scenario);

        test_scenario::next_tx(scenario, BORROWER);
        {
            let vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
        };

        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = vouch::ENotExpired)]
    fun test_redeem_not_expired_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        let voucher_profile_id = setup_voucher_with_score(scenario);

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_shared_by_id<ReputationProfile>(scenario, voucher_profile_id);
            vouch::create_vouch(&vp, BORROWER, vouch_stake(), test_scenario::ctx(scenario));
            test_scenario::return_shared(vp);
        };

        test_scenario::next_tx(scenario, BORROWER);
        {
            let v = test_scenario::take_from_sender<Vouch>(scenario);
            vouch::redeem_expired(v, test_scenario::ctx(scenario));
        };

        test_scenario::end(scenario_val);
    }
}
