#[test_only]
module reputation::vouch_lending_tests {
    use sui::test_scenario;
    use sui::balance;
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context;
    use sui::coin::{Self, Coin};
    use reputation::oracle_registry;
    use reputation::profile::{Self, ReputationProfile, OracleCapability};
    use reputation::vouch::{Self, Vouch};
    use reputation::lending::{Self, Loan, LendingCapability};

    const ADMIN: address = @0xAD;
    const ORACLE: address = @0x0C;
    const VOUCHER: address = @0xCC;
    const BORROWER: address = @0xB0;
    const LENDER: address = @0xAA;

    const VOUCH_STAKE: u64 = 1_000_000_000;  // 1 SUI
    const LOAN_AMOUNT: u64 = 100_000_000;     // 0.1 SUI
    const COLLATERAL: u64 = 50_000_000;       // 0.05 SUI
    const CREDIT_SCORE: u64 = 500;

    // Full setup: registries, profiles, credit scores, vouch, and a shared Loan
    fun setup_all(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        {
            oracle_registry::init_for_testing(test_scenario::ctx(scenario));
            lending::init_for_testing(test_scenario::ctx(scenario));
        };

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, BORROWER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_from_address<ReputationProfile>(scenario, VOUCHER);
            let mut bp = test_scenario::take_from_address<ReputationProfile>(scenario, BORROWER);
            profile::update_score(&cap, &mut vp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            profile::update_score(&cap, &mut bp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            test_scenario::return_to_address(VOUCHER, vp);
            test_scenario::return_to_address(BORROWER, bp);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(
                &vp, BORROWER,
                balance::create_for_testing<SUI>(VOUCH_STAKE),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_to_sender(scenario, vp);
        };

        test_scenario::next_tx(scenario, LENDER);
        {
            let bp = test_scenario::take_from_address<ReputationProfile>(scenario, BORROWER);
            let v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);
            let loan = lending::issue_loan(
                &bp, &v, LOAN_AMOUNT,
                balance::create_for_testing<SUI>(COLLATERAL),
                test_scenario::ctx(scenario)
            );
            transfer::public_share_object(loan);
            test_scenario::return_to_address(BORROWER, bp);
            test_scenario::return_to_address(BORROWER, v);
        };
    }

    // --- 1. Vouch creation transfers object to vouchee ---
    #[test]
    fun test_create_vouch_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

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

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(
                &vp, BORROWER,
                balance::create_for_testing<SUI>(VOUCH_STAKE),
                test_scenario::ctx(scenario)
            );
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
            vouch::create_vouch(
                &vp, BORROWER,
                balance::create_for_testing<SUI>(VOUCH_STAKE),
                test_scenario::ctx(scenario)
            );
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

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(
                &vp, BORROWER,
                balance::create_for_testing<SUI>(VOUCH_STAKE),
                test_scenario::ctx(scenario)
            );
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

    // --- 4. Lender cannot be the same address as borrower ---
    #[test]
    #[expected_failure(abort_code = lending::ESelfLoan)]
    fun test_issue_loan_self_loan_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };
        test_scenario::next_tx(scenario, BORROWER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_from_address<ReputationProfile>(scenario, VOUCHER);
            let mut bp = test_scenario::take_from_address<ReputationProfile>(scenario, BORROWER);
            profile::update_score(&cap, &mut vp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            profile::update_score(&cap, &mut bp, b"CREDIT", CREDIT_SCORE, 1, test_scenario::ctx(scenario));
            test_scenario::return_to_address(VOUCHER, vp);
            test_scenario::return_to_address(BORROWER, bp);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(&vp, BORROWER, balance::create_for_testing<SUI>(VOUCH_STAKE), test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, vp);
        };

        // BORROWER acts as lender — sender == borrower → ESelfLoan
        test_scenario::next_tx(scenario, BORROWER);
        {
            let bp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            let v = test_scenario::take_from_sender<Vouch>(scenario);
            let loan = lending::issue_loan(
                &bp, &v, LOAN_AMOUNT,
                balance::create_for_testing<SUI>(COLLATERAL),
                test_scenario::ctx(scenario)
            );
            transfer::public_share_object(loan);
            test_scenario::return_to_sender(scenario, bp);
            test_scenario::return_to_sender(scenario, v);
        };

        test_scenario::end(scenario_val);
    }

    // --- 5. Loan rejected when borrower credit score < 300 ---
    #[test]
    #[expected_failure(abort_code = lending::EInsufficientCredit)]
    fun test_issue_loan_insufficient_credit() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, VOUCHER);
        { profile::create_profile(test_scenario::ctx(scenario)); };
        test_scenario::next_tx(scenario, BORROWER);
        { profile::create_profile(test_scenario::ctx(scenario)); };

        // Only VOUCHER gets a score — BORROWER stays at 0
        test_scenario::next_tx(scenario, ORACLE);
        {
            let cap = profile::create_oracle_capability_for_testing(
                ORACLE, vector[b"CREDIT"], test_scenario::ctx(scenario)
            );
            let mut vp = test_scenario::take_from_address<ReputationProfile>(scenario, VOUCHER);
            profile::update_score(&cap, &mut vp, b"CREDIT", 600, 1, test_scenario::ctx(scenario));
            test_scenario::return_to_address(VOUCHER, vp);
            profile::destroy_oracle_capability(cap);
        };

        test_scenario::next_tx(scenario, VOUCHER);
        {
            let vp = test_scenario::take_from_sender<ReputationProfile>(scenario);
            vouch::create_vouch(&vp, BORROWER, balance::create_for_testing<SUI>(VOUCH_STAKE), test_scenario::ctx(scenario));
            test_scenario::return_to_sender(scenario, vp);
        };

        // BORROWER score = 0 < 300 → EInsufficientCredit
        test_scenario::next_tx(scenario, LENDER);
        {
            let bp = test_scenario::take_from_address<ReputationProfile>(scenario, BORROWER);
            let v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);
            let loan = lending::issue_loan(
                &bp, &v, LOAN_AMOUNT,
                balance::create_for_testing<SUI>(COLLATERAL),
                test_scenario::ctx(scenario)
            );
            transfer::public_share_object(loan);
            test_scenario::return_to_address(BORROWER, bp);
            test_scenario::return_to_address(BORROWER, v);
        };

        test_scenario::end(scenario_val);
    }

    // --- 6. Repay: collateral returned to borrower, repayment forwarded to lender ---
    #[test]
    fun test_repay_loan_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_all(scenario);

        test_scenario::next_tx(scenario, BORROWER);
        {
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            lending::repay_loan(
                &mut loan,
                balance::create_for_testing<SUI>(LOAN_AMOUNT),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(loan);
        };

        test_scenario::next_tx(scenario, BORROWER);
        {
            let c = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            assert!(coin::value(&c) == COLLATERAL, 0);
            test_scenario::return_to_sender(scenario, c);
        };

        test_scenario::next_tx(scenario, LENDER);
        {
            let c = test_scenario::take_from_sender<Coin<SUI>>(scenario);
            assert!(coin::value(&c) == LOAN_AMOUNT, 1);
            test_scenario::return_to_sender(scenario, c);
        };

        test_scenario::end(scenario_val);
    }

    // --- 7. Second repayment on the same loan is rejected ---
    #[test]
    #[expected_failure(abort_code = lending::EAlreadyRepaid)]
    fun test_double_repay_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_all(scenario);

        test_scenario::next_tx(scenario, BORROWER);
        {
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            lending::repay_loan(&mut loan, balance::create_for_testing<SUI>(LOAN_AMOUNT), test_scenario::ctx(scenario));
            test_scenario::return_shared(loan);
        };

        test_scenario::next_tx(scenario, BORROWER);
        {
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            lending::repay_loan(&mut loan, balance::create_for_testing<SUI>(LOAN_AMOUNT), test_scenario::ctx(scenario));
            test_scenario::return_shared(loan);
        };

        test_scenario::end(scenario_val);
    }

    // --- 8. Slash rejected while loan is not yet past due date ---
    #[test]
    #[expected_failure(abort_code = lending::ELoanNotDefaulted)]
    fun test_slash_rejected_before_due() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_all(scenario);

        // Epoch is 0 and due_epoch is 30 → not yet defaulted
        test_scenario::next_tx(scenario, ADMIN);
        {
            let cap = test_scenario::take_from_sender<LendingCapability>(scenario);
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            let mut v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);
            lending::slash_defaulted_vouch(&mut loan, &mut v, &cap, test_scenario::ctx(scenario));
            test_scenario::return_shared(loan);
            test_scenario::return_to_address(BORROWER, v);
            test_scenario::return_to_sender(scenario, cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- 9. Slash succeeds after loan is expired via test helper ---
    #[test]
    fun test_slash_after_default_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_all(scenario);

        test_scenario::next_tx(scenario, ADMIN);
        {
            let cap = test_scenario::take_from_sender<LendingCapability>(scenario);
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            let mut v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);

            // Force loan into defaulted state via test helper
            lending::expire_loan_for_testing(&mut loan);
            lending::slash_defaulted_vouch(&mut loan, &mut v, &cap, test_scenario::ctx(scenario));

            assert!(!vouch::is_active(&v), 0);
            assert!(vouch::get_stake_amount(&v) == 0, 1);

            test_scenario::return_shared(loan);
            test_scenario::return_to_address(BORROWER, v);
            test_scenario::return_to_sender(scenario, cap);
        };

        test_scenario::end(scenario_val);
    }

    // --- 10. Repayment blocked after vouch has been slashed for default ---
    #[test]
    #[expected_failure(abort_code = lending::ELoanDefaulted)]
    fun test_repay_rejected_after_default() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;
        setup_all(scenario);

        test_scenario::next_tx(scenario, ADMIN);
        {
            let cap = test_scenario::take_from_sender<LendingCapability>(scenario);
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            let mut v = test_scenario::take_from_address<Vouch>(scenario, BORROWER);

            // Force loan into defaulted state via test helper
            lending::expire_loan_for_testing(&mut loan);
            lending::slash_defaulted_vouch(&mut loan, &mut v, &cap, test_scenario::ctx(scenario));

            test_scenario::return_shared(loan);
            test_scenario::return_to_address(BORROWER, v);
            test_scenario::return_to_sender(scenario, cap);
        };

        // loan.defaulted = true → repay must abort with ELoanDefaulted
        test_scenario::next_tx(scenario, BORROWER);
        {
            let mut loan = test_scenario::take_shared<Loan>(scenario);
            lending::repay_loan(
                &mut loan,
                balance::create_for_testing<SUI>(LOAN_AMOUNT),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(loan);
        };

        test_scenario::end(scenario_val);
    }
}
