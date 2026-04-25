#[test_only]
module reputation::schema_registry_tests {
    use std::option;
    use sui::test_scenario;
    use reputation::schema_registry::{Self, SchemaRegistry};

    const ADMIN: address = @0xAD;
    const NON_ADMIN: address = @0xBB;
    const GOVERNANCE: address = @0xDA0;

    // --- Happy path: admin registers a schema ---
    #[test]
    fun test_register_schema_success() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(
                &mut registry,
                b"PIRATE_INDEX_V1",
                1,
                option::none(),
                true,
                test_scenario::ctx(scenario)
            );
            let schema = schema_registry::get_schema(&registry, b"PIRATE_INDEX_V1");
            assert!(!schema_registry::is_deprecated(schema), 0);
            assert!(schema_registry::is_revocable(schema), 1);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Non-admin cannot register ---
    #[test]
    #[expected_failure(abort_code = schema_registry::ENotAuthorized)]
    fun test_register_schema_unauthorized() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, NON_ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(
                &mut registry,
                b"PIRATE_INDEX_V1",
                1,
                option::none(),
                true,
                test_scenario::ctx(scenario)
            );
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Duplicate schema rejected ---
    #[test]
    #[expected_failure(abort_code = schema_registry::ESchemaAlreadyExists)]
    fun test_register_schema_duplicate() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(&mut registry, b"SCHEMA_A", 1, option::none(), false, test_scenario::ctx(scenario));
            schema_registry::register_schema(&mut registry, b"SCHEMA_A", 1, option::none(), false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Schema deprecation points old to new ---
    #[test]
    fun test_deprecate_schema() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(&mut registry, b"PIRATE_INDEX_V1", 1, option::none(), true, test_scenario::ctx(scenario));
            schema_registry::register_schema(&mut registry, b"PIRATE_INDEX_V2", 2, option::none(), true, test_scenario::ctx(scenario));
            schema_registry::deprecate_schema(&mut registry, b"PIRATE_INDEX_V1", b"PIRATE_INDEX_V2", test_scenario::ctx(scenario));

            let v1 = schema_registry::get_schema(&registry, b"PIRATE_INDEX_V1");
            assert!(schema_registry::is_deprecated(v1), 0);

            let v2 = schema_registry::get_schema(&registry, b"PIRATE_INDEX_V2");
            assert!(!schema_registry::is_deprecated(v2), 1);

            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Governance transfer removes admin ---
    #[test]
    fun test_transfer_to_governance() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::transfer_to_governance(&mut registry, GOVERNANCE, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        // Governance address can now register schemas
        test_scenario::next_tx(scenario, GOVERNANCE);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::register_schema(&mut registry, b"NEW_SCHEMA", 1, option::none(), false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }

    // --- Old admin cannot register after governance transfer ---
    #[test]
    #[expected_failure(abort_code = schema_registry::ENotAuthorized)]
    fun test_admin_locked_out_after_governance_transfer() {
        let mut scenario_val = test_scenario::begin(ADMIN);
        let scenario = &mut scenario_val;

        test_scenario::next_tx(scenario, ADMIN);
        { schema_registry::init_for_testing(test_scenario::ctx(scenario)); };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            schema_registry::transfer_to_governance(&mut registry, GOVERNANCE, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::next_tx(scenario, ADMIN);
        {
            let mut registry = test_scenario::take_shared<SchemaRegistry>(scenario);
            // Old admin is locked out — should abort
            schema_registry::register_schema(&mut registry, b"DENIED", 1, option::none(), false, test_scenario::ctx(scenario));
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario_val);
    }
}
