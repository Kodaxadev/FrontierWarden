module reputation::schema_registry {
    use std::option::{Self, Option};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::table::{Self, Table};
    use sui::event;

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const ESchemaAlreadyExists: u64 = 2;
    const ESchemaNotFound: u64 = 3;

    // === Events ===
    public struct SchemaRegistered has copy, drop {
        schema_id: vector<u8>,
        version: u64,
        resolver: Option<address>,
    }

    public struct SchemaDeprecated has copy, drop {
        old_schema_id: vector<u8>,
        new_schema_id: vector<u8>,
    }

    public struct GovernanceTransferred has copy, drop {
        old_admin: Option<address>,
        new_governance: address,
    }

    // === Structs ===
    public struct SchemaRegistry has key {
        id: UID,
        schemas: Table<vector<u8>, Schema>,
        admin: Option<address>,
        governance: Option<address>,
    }

    public struct Schema has store {
        schema_id: vector<u8>,
        version: u64,
        superseded_by: Option<vector<u8>>,
        resolver: Option<address>,
        revocable: bool,
        created_at: u64,
    }

    // === Init ===
    fun init(ctx: &mut TxContext) {
        let registry = SchemaRegistry {
            id: object::new(ctx),
            schemas: table::new(ctx),
            admin: option::some(tx_context::sender(ctx)),
            governance: option::none(),
        };
        transfer::share_object(registry);
    }

    // === Authorization ===
    fun is_authorized(registry: &SchemaRegistry, sender: address): bool {
        if (option::is_some(&registry.admin) && option::borrow(&registry.admin) == &sender) {
            return true
        };
        if (option::is_some(&registry.governance) && option::borrow(&registry.governance) == &sender) {
            return true
        };
        false
    }

    // === Entry Functions ===
    public entry fun register_schema(
        registry: &mut SchemaRegistry,
        schema_id: vector<u8>,
        version: u64,
        resolver: Option<address>,
        revocable: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(is_authorized(registry, sender), ENotAuthorized);
        assert!(!table::contains(&registry.schemas, schema_id), ESchemaAlreadyExists);

        let schema = Schema {
            schema_id: copy schema_id,
            version,
            superseded_by: option::none(),
            resolver,
            revocable,
            created_at: tx_context::epoch(ctx),
        };
        table::add(&mut registry.schemas, schema_id, schema);

        event::emit(SchemaRegistered { schema_id, version, resolver });
    }

    public entry fun deprecate_schema(
        registry: &mut SchemaRegistry,
        old_schema_id: vector<u8>,
        new_schema_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(is_authorized(registry, sender), ENotAuthorized);
        assert!(table::contains(&registry.schemas, old_schema_id), ESchemaNotFound);
        assert!(table::contains(&registry.schemas, new_schema_id), ESchemaNotFound);

        let old_schema = table::borrow_mut(&mut registry.schemas, old_schema_id);
        old_schema.superseded_by = option::some(new_schema_id);

        event::emit(SchemaDeprecated { old_schema_id, new_schema_id });
    }

    public entry fun transfer_to_governance(
        registry: &mut SchemaRegistry,
        governance_address: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(option::is_some(&registry.admin), ENotAuthorized);
        assert!(option::borrow(&registry.admin) == &sender, ENotAuthorized);

        let old_admin = registry.admin;
        registry.governance = option::some(governance_address);
        registry.admin = option::none();

        event::emit(GovernanceTransferred { old_admin, new_governance: governance_address });
    }

    // === View Functions ===
    public fun get_schema(registry: &SchemaRegistry, schema_id: vector<u8>): &Schema {
        assert!(table::contains(&registry.schemas, schema_id), ESchemaNotFound);
        table::borrow(&registry.schemas, schema_id)
    }

    public fun is_deprecated(schema: &Schema): bool {
        option::is_some(&schema.superseded_by)
    }

    public fun get_superseded_by(schema: &Schema): Option<vector<u8>> {
        schema.superseded_by
    }

    // FIX: public accessors for Schema private fields — needed by attestation.move and singleton.move
    public fun get_resolver(schema: &Schema): &Option<address> {
        &schema.resolver
    }

    public fun is_revocable(schema: &Schema): bool {
        schema.revocable
    }

    // === Test Helpers ===
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
