// Focused tests for GatePolicy <-> world Gate binding.

#[test_only]
module reputation::reputation_gate_binding_tests {
    use sui::test_scenario;
    use sui::coin;
    use sui::sui::SUI;
    use reputation::attestation;
    use reputation::reputation_gate::{Self, GateAdminCap, GatePolicy};

    const OWNER: address = @0xA0;
    const TRAVELER: address = @0xBB;
    const OTHER: address = @0xDD;
    const ORACLE: address = @0x0C;
    const WORLD_GATE_1: address = @0x1001;
    const WORLD_GATE_2: address = @0x1002;

    const SCHEMA: vector<u8> = b"TRIBE_STANDING";
    const ALLY_THRESH: u64 = 50;
    const BASE_TOLL: u64 = 500_000;
    const EPOCH_FUTURE: u64 = 100;

    fun setup_gate(scenario: &mut test_scenario::Scenario) {
        test_scenario::next_tx(scenario, OWNER);
        reputation_gate::create_gate(
            SCHEMA,
            ALLY_THRESH,
            BASE_TOLL,
            test_scenario::ctx(scenario),
        );
    }

    fun payment(amount: u64, scenario: &mut test_scenario::Scenario): sui::coin::Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, test_scenario::ctx(scenario))
    }

    #[test]
    fun test_new_gate_starts_unbound() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let gate = test_scenario::take_shared<GatePolicy>(&s);
        assert!(!reputation_gate::is_world_gate_bound(&gate), 0);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    fun test_admin_can_bind_and_unbind_world_gate() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let cap = test_scenario::take_from_sender<GateAdminCap>(&s);
        let mut gate = test_scenario::take_shared<GatePolicy>(&s);
        reputation_gate::bind_world_gate(&cap, &mut gate, object::id_from_address(WORLD_GATE_1), test_scenario::ctx(&mut s));
        assert!(reputation_gate::is_world_gate_bound(&gate), 0);
        assert!(reputation_gate::get_bound_world_gate_id(&gate) == object::id_from_address(WORLD_GATE_1), 1);
        reputation_gate::unbind_world_gate(&cap, &mut gate, test_scenario::ctx(&mut s));
        assert!(!reputation_gate::is_world_gate_bound(&gate), 2);
        test_scenario::return_to_sender(&s, cap);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    #[expected_failure(abort_code = reputation_gate::ENotAdmin)]
    fun test_wrong_admin_cap_cannot_bind() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let gate = test_scenario::take_shared<GatePolicy>(&s);
        let owner_gate_id = object::id(&gate);
        test_scenario::return_shared(gate);

        test_scenario::next_tx(&mut s, OTHER);
        reputation_gate::create_gate(
            SCHEMA,
            ALLY_THRESH,
            BASE_TOLL,
            test_scenario::ctx(&mut s),
        );

        test_scenario::next_tx(&mut s, OWNER);
        let mut gate = test_scenario::take_shared_by_id<GatePolicy>(&s, owner_gate_id);

        test_scenario::next_tx(&mut s, OTHER);
        let wrong_cap = test_scenario::take_from_sender<GateAdminCap>(&s);
        reputation_gate::bind_world_gate(&wrong_cap, &mut gate, object::id_from_address(WORLD_GATE_1), test_scenario::ctx(&mut s));
        test_scenario::return_to_sender(&s, wrong_cap);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    #[expected_failure(abort_code = reputation_gate::EAlreadyBound)]
    fun test_cannot_bind_twice_without_unbind() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let cap = test_scenario::take_from_sender<GateAdminCap>(&s);
        let mut gate = test_scenario::take_shared<GatePolicy>(&s);
        reputation_gate::bind_world_gate(&cap, &mut gate, object::id_from_address(WORLD_GATE_1), test_scenario::ctx(&mut s));
        reputation_gate::bind_world_gate(&cap, &mut gate, object::id_from_address(WORLD_GATE_2), test_scenario::ctx(&mut s));
        test_scenario::return_to_sender(&s, cap);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    #[expected_failure(abort_code = reputation_gate::ENotBound)]
    fun test_cannot_unbind_when_unbound() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let cap = test_scenario::take_from_sender<GateAdminCap>(&s);
        let mut gate = test_scenario::take_shared<GatePolicy>(&s);
        reputation_gate::unbind_world_gate(&cap, &mut gate, test_scenario::ctx(&mut s));
        test_scenario::return_to_sender(&s, cap);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    #[expected_failure(abort_code = reputation_gate::ENotBound)]
    fun test_get_bound_world_gate_id_aborts_when_unbound() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let gate = test_scenario::take_shared<GatePolicy>(&s);
        reputation_gate::get_bound_world_gate_id(&gate);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }

    #[test]
    fun test_binding_does_not_affect_check_passage() {
        let mut s = test_scenario::begin(OWNER);
        setup_gate(&mut s);

        test_scenario::next_tx(&mut s, OWNER);
        let cap = test_scenario::take_from_sender<GateAdminCap>(&s);
        let mut gate = test_scenario::take_shared<GatePolicy>(&s);
        reputation_gate::bind_world_gate(&cap, &mut gate, object::id_from_address(WORLD_GATE_1), test_scenario::ctx(&mut s));
        test_scenario::return_to_sender(&s, cap);
        test_scenario::return_shared(gate);

        test_scenario::next_tx(&mut s, TRAVELER);
        let mut gate = test_scenario::take_shared<GatePolicy>(&s);
        let attest = attestation::create_for_testing(
            SCHEMA, ORACLE, TRAVELER, ALLY_THRESH, EPOCH_FUTURE, false,
            test_scenario::ctx(&mut s),
        );
        let pay = payment(1_000_000, &mut s);
        reputation_gate::check_passage(&mut gate, &attest, pay, test_scenario::ctx(&mut s));
        assert!(reputation_gate::treasury_balance(&gate) == 0, 0);
        attestation::destroy_for_testing(attest);
        test_scenario::return_shared(gate);

        test_scenario::end(s);
    }
}
