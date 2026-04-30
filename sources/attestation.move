module reputation::attestation {

    use sui::event;
    // FIX: missing imports -- schema and oracle registries are same-package dependencies
    use reputation::schema_registry::{Self, SchemaRegistry};
    use reputation::oracle_registry::{Self, OracleRegistry};

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const ESchemaNotFound: u64 = 3;
    const EInvalidOracle: u64 = 4;

    // === Events ===
    public struct AttestationIssued has copy, drop {
        attestation_id: ID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
    }

    public struct AttestationRevoked has copy, drop {
        attestation_id: ID,
        revoker: address,
    }

    // === Structs ===
    public struct Attestation has key, store {
        id: UID,
        schema_id: vector<u8>,
        issuer: address,
        subject: address,
        value: u64,
        expiration_epoch: u64,
        revoked: bool,
        issued_at: u64,
    }

    // === Public Functions ===

    public fun issue(
        schema_registry: &SchemaRegistry,
        oracle_registry: &OracleRegistry,
        schema_id: vector<u8>,
        subject: address,
        value: u64,
        expiration_epochs: u64,
        ctx: &mut TxContext
    ): Attestation {
        let sender = tx_context::sender(ctx);

        assert!(
            oracle_registry::is_valid_oracle_for_schema(oracle_registry, sender, schema_id),
            EInvalidOracle
        );

        let schema = schema_registry::get_schema(schema_registry, schema_id);
        assert!(!schema_registry::is_deprecated(schema), ESchemaNotFound);

        let attestation = Attestation {
            id: object::new(ctx),
            schema_id,
            issuer: sender,
            subject,
            value,
            expiration_epoch: tx_context::epoch(ctx) + expiration_epochs,
            revoked: false,
            issued_at: tx_context::epoch(ctx),
        };

        event::emit(AttestationIssued {
            attestation_id: object::id(&attestation),
            schema_id,
            issuer: sender,
            subject,
            value,
        });

        attestation
    }

    public fun revoke(
        attestation: &mut Attestation,
        schema_registry: &SchemaRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let schema = schema_registry::get_schema(schema_registry, attestation.schema_id);

        // FIX: use public accessors instead of direct private field access
        let resolver = schema_registry::get_resolver(schema);
        assert!(
            sender == attestation.issuer ||
            (option::is_some(resolver) && option::borrow(resolver) == &sender),
            ENotAuthorized
        );

        assert!(schema_registry::is_revocable(schema), ENotAuthorized);
        attestation.revoked = true;

        event::emit(AttestationRevoked {
            attestation_id: object::id(attestation),
            revoker: sender,
        });
    }

    // === View Functions ===

    public fun is_valid(attestation: &Attestation, current_epoch: u64): bool {
        !attestation.revoked && attestation.expiration_epoch > current_epoch
    }

    public fun get_value(attestation: &Attestation): u64 {
        attestation.value
    }

    public fun get_issuer(attestation: &Attestation): address {
        attestation.issuer
    }

    public fun get_subject(attestation: &Attestation): address {
        attestation.subject
    }

    public fun get_schema_id(attestation: &Attestation): vector<u8> {
        attestation.schema_id
    }

    public fun is_revoked(attestation: &Attestation): bool {
        attestation.revoked
    }

    // === Test Helpers ===

    /// Bypass oracle validation and construct an Attestation with explicit fields.
    /// Allows unit tests to inject expired, revoked, or wrong-subject attestations
    /// without wiring up a full oracle/schema registry.
    #[test_only]
    public fun create_for_testing(
        schema_id:        vector<u8>,
        issuer:           address,
        subject:          address,
        value:            u64,
        expiration_epoch: u64,
        revoked:          bool,
        ctx:              &mut TxContext,
    ): Attestation {
        Attestation {
            id: object::new(ctx),
            schema_id,
            issuer,
            subject,
            value,
            expiration_epoch,
            revoked,
            issued_at: tx_context::epoch(ctx),
        }
    }

    /// Destroy an Attestation in tests (needed to clean up owned objects that
    /// were not consumed by check_passage or transfer).
    #[test_only]
    public fun destroy_for_testing(attestation: Attestation) {
        let Attestation { id, schema_id: _, issuer: _, subject: _, value: _,
                          expiration_epoch: _, revoked: _, issued_at: _ } = attestation;
        object::delete(id);
    }

}
