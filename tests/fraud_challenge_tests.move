#[test_only]
module reputation::fraud_challenge_tests {
    use std::vector;
    use sui::test_scenario;
    use sui::balance;
    use sui::sui::SUI;
    use reputation::oracle_registry::{Self, OracleRegistry};
    use reputation::fraud_challenge::{Self, FraudChallenge};

    const ADMIN: address = @0xAD;
    const ORACLE: address = @0x0C;
    const PLAYER: address = @0xA1;
    const COUNCIL_A: address = @0xC1;

    fun one_sui(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(1_000_000_000)
    }

    fun half_sui(): balance::Balance<SUI> {
        balance::create_for_testing<SUI>(500_000_000)
    }

    // Shared setup: init registry + register ORACLE with 1 SUI stake.
    fun setup_registry_with_oracle(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(
                &mut registry, b"TestOracle", vector[b"S1"],
                one_sui(), false, b"", false, test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };
    }

    // --- Council member cannot vote twice ---
    #[test]
    #[expected_failure(abort_code = fraud_challenge::EAlreadyVoted)]
    fun test_council_double_vote_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { oracle_registry::init_for_testing(test_scenario::ctx(scenario)); };

        // Add council member
        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::add_council_member(&mut registry, COUNCIL_A, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        // Register oracle
        test_scenario::next_tx(scenario, ORACLE);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            oracle_registry::register_oracle(
                &mut registry, b"BadOracle", vector[b"S1"],
                one_sui(), false, b"", false, test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        // Create fraud challenge
        test_scenario::next_tx(scenario, PLAYER);
        {
            let registry = test_scenario::take_shared<OracleRegistry>(scenario);
            fraud_challenge::create_fraud_challenge(
                &registry,
                sui::object::id_from_address(@0x99),
                ORACLE,
                b"evidence",
                half_sui(),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        // Vote 1 — OK
        test_scenario::next_tx(scenario, COUNCIL_A);
        {
            let registry = test_scenario::take_shared<OracleRegistry>(scenario);
            let mut challenge = test_scenario::take_shared<FraudChallenge>(scenario);
            fraud_challenge::vote_on_challenge(&mut challenge, &registry, true, test_scenario::ctx(scenario));
            test_scenario::return_shared(challenge);
            test_scenario::return_shared(registry);
        };

        // Vote 2 — must fail with EAlreadyVoted
        test_scenario::next_tx(scenario, COUNCIL_A);
        {
            let registry = test_scenario::take_shared<OracleRegistry>(scenario);
            let mut challenge = test_scenario::take_shared<FraudChallenge>(scenario);
            fraud_challenge::vote_on_challenge(&mut challenge, &registry, false, test_scenario::ctx(scenario));
            test_scenario::return_shared(challenge);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- resolve_challenge with zero votes is rejected (ENoQuorum) ---
    // Regression test for the zero-vote slash bug:
    // when council_size * 2 / 3 == 0 (council_size <= 1), resolve must not
    // allow a challenge to pass with zero votes cast.
    // Steps: no council → create challenge → advance past deadline → resolve → ENoQuorum
    #[test]
    #[expected_failure(abort_code = fraud_challenge::ENoQuorum)]
    fun test_resolve_challenge_zero_votes_rejected() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_registry_with_oracle(scenario);

        // Create fraud challenge (challenger_stake = half_sui, deadline = epoch + 7).
        // council_size is still 0 — no add_council_member call.
        test_scenario::next_tx(scenario, PLAYER);
        {
            let registry = test_scenario::take_shared<OracleRegistry>(scenario);
            fraud_challenge::create_fraud_challenge(
                &registry,
                sui::object::id_from_address(@0x99),
                ORACLE,
                b"evidence",
                half_sui(),
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        // Advance 8 epochs so epoch > deadline_epoch (0 + 7 = 7).
        // test_scenario::next_epoch is the only way to advance epoch —
        // next_tx alone does NOT change the epoch counter.
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);
        test_scenario::next_epoch(scenario, ADMIN);

        // Attempt to resolve with zero votes — must abort with ENoQuorum
        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<OracleRegistry>(scenario);
            let mut challenge = test_scenario::take_shared<FraudChallenge>(scenario);
            fraud_challenge::resolve_challenge(&mut challenge, &mut registry, test_scenario::ctx(scenario));
            test_scenario::return_shared(challenge);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }
}
