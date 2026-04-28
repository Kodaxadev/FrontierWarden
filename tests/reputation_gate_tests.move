// reputation_gate_tests.move
// Unit tests for the reputation_gate policy engine.
//
// Each test targets exactly one invariant. Attestations are constructed via
// attestation::create_for_testing so the oracle/schema registry pipeline does
// not need to be wired up — that machinery is covered in oracle_profile_tests.
//
// Test matrix:
//   1.  Ally score (>= threshold)    => free passage, full payment returned
//   2.  Neutral score (> 0, < threshold) => toll charged, remainder returned
//   3.  Enemy score (== 0)           => EPassageDenied abort
//   4.  Expired attestation          => EExpiredAttestation abort
//   5.  Revoked attestation          => ERevokedAttestation abort
//   6.  Wrong subject                => EWrongSubject abort
//   7.  Wrong schema                 => EWrongSchema abort
//   8.  Gate paused                  => EGatePaused abort
//   9.  Insufficient payment (neutral) => EInsufficientPayment abort
//  10.  Admin withdraw_tolls         => treasury drained to owner
//  11.  update_thresholds            => new values take effect immediately

#[test_only]
module reputation::reputation_gate_tests {
    use sui::test_scenario;
    use sui::coin::{Self};
    use sui::sui::SUI;
    use reputation::attestation;
    use reputation::reputation_gate::{Self, GatePolicy, GateAdminCap};

    // === Addresses ===
    const OWNER:    address = @0xA0;
    const ORACLE:   address = @0x0C;
    const TRAVELER: address = @0xBB;
    const OTHER:    address = @0xDD;

    // === Gate params ===
    const SCHEMA:        vector<u8> = b"TRIBE_STANDING";
    const ALLY_THRESH:   u64 = 50;
    const BASE_TOLL:     u64 = 500_000;  // 0.0005 SUI in MIST
    const EPOCH_CURRENT: u64 = 10;
    const EPOCH_FUTURE:  u64 = 100;      // expiration_epoch for valid attestations

    // === Payment helpers ===
    fun payment(amount: u64, ctx: &mut test_scenario::Scenario): sui::coin::Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, test_scenario::ctx(ctx))
    }

    // === Shared setup: create gate owned by OWNER ===
    fun setup_gate(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, OWNER);
        {
            reputation_gate::create_gate(
                SCHEMA,
                ALLY_THRESH,
                BASE_TOLL,
                test_scenario::ctx(scenario),
            );
        };
    }

    // === 1. Ally free passage ===
    // score >= ally_threshold  =>  toll == 0, full payment coin returned to sender.
    #[test]
    fun test_ally_free_passage() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH,          // exactly at threshold = ally
                /*expiration_epoch=*/ EPOCH_FUTURE,
                /*revoked=*/ false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(1_000_000, &mut s);

            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            assert!(reputation_gate::treasury_balance(&gate) == 0, 0);
            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        // Full payment coin returned to TRAVELER
        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let returned = test_scenario::take_from_sender<sui::coin::Coin<SUI>>(&s);
            assert!(coin::value(&returned) == 1_000_000, 1);
            test_scenario::return_to_sender(&s, returned);
        };

        test_scenario::end(s);
    }

    // === 2. Neutral toll charged ===
    // 0 < score < ally_threshold  =>  base_toll deducted, remainder returned.
    #[test]
    fun test_neutral_toll_charged() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH - 1,      // below threshold = neutral
                /*expiration_epoch=*/ EPOCH_FUTURE,
                /*revoked=*/ false,
                test_scenario::ctx(&mut s),
            );
            let overpayment = BASE_TOLL + 200_000;
            let pay = payment(overpayment, &mut s);

            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            assert!(reputation_gate::treasury_balance(&gate) == BASE_TOLL, 0);
            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        // Remainder coin (overpayment - toll) returned to TRAVELER
        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let change = test_scenario::take_from_sender<sui::coin::Coin<SUI>>(&s);
            assert!(coin::value(&change) == 200_000, 1);
            test_scenario::return_to_sender(&s, change);
        };

        test_scenario::end(s);
    }

    // === 3. Enemy score blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EPassageDenied)]
    fun test_enemy_score_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ 0,                    // enemy
                /*expiration_epoch=*/ EPOCH_FUTURE,
                /*revoked=*/ false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 4. Expired attestation blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EExpiredAttestation)]
    fun test_expired_attestation_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            // expiration_epoch == 0, current epoch == 0  =>  0 > 0 is false  =>  invalid
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH,
                /*expiration_epoch=*/ 0,         // already expired at epoch 0
                /*revoked=*/ false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 5. Revoked attestation blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::ERevokedAttestation)]
    fun test_revoked_attestation_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH,
                /*expiration_epoch=*/ EPOCH_FUTURE,
                /*revoked=*/ true,               // revoked
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 6. Wrong subject blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EWrongSubject)]
    fun test_wrong_subject_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        // TRAVELER calls check_passage but attestation.subject == OTHER
        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE,
                /*subject=*/ OTHER,              // subject is someone else
                ALLY_THRESH,
                EPOCH_FUTURE, false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 7. Wrong schema blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EWrongSchema)]
    fun test_wrong_schema_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                b"PIRATE_INDEX_V1",              // wrong schema
                ORACLE, TRAVELER, ALLY_THRESH,
                EPOCH_FUTURE, false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 8. Paused gate blocked ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EGatePaused)]
    fun test_paused_gate_blocked() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        // Admin pauses the gate
        test_scenario::next_tx(&mut s, OWNER);
        {
            let cap  = test_scenario::take_from_sender<GateAdminCap>(&s);
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            reputation_gate::pause(&cap, &mut gate);
            test_scenario::return_to_sender(&s, cap);
            test_scenario::return_shared(gate);
        };

        // Traveler (ally score) still blocked
        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER, ALLY_THRESH, EPOCH_FUTURE, false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(0, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 9. Insufficient payment for neutral toll ===
    #[test]
    #[expected_failure(abort_code = reputation_gate::EInsufficientPayment)]
    fun test_insufficient_payment_rejected() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH - 1,      // neutral tier
                EPOCH_FUTURE, false,
                test_scenario::ctx(&mut s),
            );
            let underpayment = BASE_TOLL - 1;    // one mist short
            let pay = payment(underpayment, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }

    // === 10. Admin withdraw_tolls drains treasury ===
    #[test]
    fun test_withdraw_tolls() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        // Two neutral passages to accumulate tolls
        let mut i = 0u64;
        while (i < 2) {
            test_scenario::next_tx(&mut s, TRAVELER);
            {
                let mut gate = test_scenario::take_shared<GatePolicy>(&s);
                let attest = attestation::create_for_testing(
                    SCHEMA, ORACLE, TRAVELER,
                    ALLY_THRESH - 1, EPOCH_FUTURE, false,
                    test_scenario::ctx(&mut s),
                );
                let pay = payment(BASE_TOLL, &mut s);
                reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));
                attestation::destroy_for_testing(attest);
                test_scenario::return_shared(gate);
            };
            i = i + 1;
        };

        // Verify treasury holds 2x toll
        test_scenario::next_tx(&mut s, OWNER);
        {
            let gate = test_scenario::take_shared<GatePolicy>(&s);
            assert!(reputation_gate::treasury_balance(&gate) == BASE_TOLL * 2, 0);
            test_scenario::return_shared(gate);
        };

        // Admin drains
        test_scenario::next_tx(&mut s, OWNER);
        {
            let cap  = test_scenario::take_from_sender<GateAdminCap>(&s);
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            reputation_gate::withdraw_tolls(&cap, &mut gate, test_scenario::ctx(&mut s));
            assert!(reputation_gate::treasury_balance(&gate) == 0, 1);
            test_scenario::return_to_sender(&s, cap);
            test_scenario::return_shared(gate);
        };

        // Payout coin lands in OWNER's inventory
        test_scenario::next_tx(&mut s, OWNER);
        {
            let payout = test_scenario::take_from_sender<sui::coin::Coin<SUI>>(&s);
            assert!(coin::value(&payout) == BASE_TOLL * 2, 2);
            test_scenario::return_to_sender(&s, payout);
        };

        test_scenario::end(s);
    }

    // === 11. update_thresholds takes effect immediately ===
    #[test]
    fun test_update_thresholds_takes_effect() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        let new_threshold: u64 = 200;
        let new_toll:      u64 = 1_000_000;

        // Admin updates thresholds
        test_scenario::next_tx(&mut s, OWNER);
        {
            let cap  = test_scenario::take_from_sender<GateAdminCap>(&s);
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            reputation_gate::update_thresholds(&cap, &mut gate, new_threshold, new_toll);
            assert!(reputation_gate::get_ally_threshold(&gate) == new_threshold, 0);
            assert!(reputation_gate::get_base_toll(&gate) == new_toll, 1);
            test_scenario::return_to_sender(&s, cap);
            test_scenario::return_shared(gate);
        };

        // Score that was ally under old threshold (ALLY_THRESH) is now neutral
        // under new_threshold (200). New toll (1_000_000) must be paid.
        test_scenario::next_tx(&mut s, TRAVELER);
        {
            let mut gate = test_scenario::take_shared<GatePolicy>(&s);
            let attest = attestation::create_for_testing(
                SCHEMA, ORACLE, TRAVELER,
                /*value=*/ ALLY_THRESH,          // 50: ally before, neutral now (threshold=200)
                EPOCH_FUTURE, false,
                test_scenario::ctx(&mut s),
            );
            let pay = payment(new_toll, &mut s);
            reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));

            // Treasury should hold the new toll
            assert!(reputation_gate::treasury_balance(&gate) == new_toll, 2);
            attestation::destroy_for_testing(attest);
            test_scenario::return_shared(gate);
        };

        test_scenario::end(s);
    }
}
