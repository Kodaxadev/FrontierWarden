// Item-level reputation: ship provenance, combat history, ownership chain.
// Addresses the "Singleton attestations" gap -- CCP whitepaper explicitly calls for
// "proving a ship was owned by a famous fleet commander or fought in a battle."
module reputation::singleton {

    use sui::event;
    use reputation::schema_registry::{Self, SchemaRegistry};
    use reputation::oracle_registry::{Self, OracleRegistry};

    // === Errors ===
    const ENotAuthorized: u64 = 1;
    const ESchemaNotFound: u64 = 2;
    const EInvalidOracle: u64 = 3;
    const ENotRevocable: u64 = 4;

    // === Events ===
    public struct SingletonAttestationIssued has copy, drop {
        attestation_id: ID,
        schema_id: vector<u8>,
        item_id: address,
        issuer: address,
        value: u64,
    }

    public struct SingletonAttestationRevoked has copy, drop {
        attestation_id: ID,
        revoker: address,
    }

    // === Structs ===

    // Attached to an in-game object (ship, module, blueprint), not a player profile.
    // Has `store` so it can be wrapped inside item objects or transferred alongside them.
    public struct SingletonAttestation has key, store {
        id: UID,
        schema_id: vector<u8>,
        item_id: address,        // on-chain object ID of the attested item
        issuer: address,
        value: u64,
        metadata: vector<u8>,   // BCS-encoded provenance payload (kills, owner history, etc.)
        expiration_epoch: u64,
        revoked: bool,
        issued_at: u64,
    }

    // === Public Functions ===

    // Returns attestation to caller -- caller transfers to item owner or wraps in item object
    public fun issue_singleton_attestation(
        schema_registry: &SchemaRegistry,
        oracle_registry: &OracleRegistry,
        schema_id: vector<u8>,
        item_id: address,
        value: u64,
        metadata: vector<u8>,
        expiration_epochs: u64,
        ctx: &mut TxContext
    ): SingletonAttestation {
        let sender = tx_context::sender(ctx);

        assert!(
            oracle_registry::is_valid_oracle_for_schema(oracle_registry, sender, schema_id),
            EInvalidOracle
        );

        let schema = schema_registry::get_schema(schema_registry, schema_id);
        assert!(!schema_registry::is_deprecated(schema), ESchemaNotFound);

        let attestation = SingletonAttestation {
            id: object::new(ctx),
            schema_id,
            item_id,
            issuer: sender,
            value,
            metadata,
            expiration_epoch: tx_context::epoch(ctx) + expiration_epochs,
            revoked: false,
            issued_at: tx_context::epoch(ctx),
        };

        event::emit(SingletonAttestationIssued {
            attestation_id: object::id(&attestation),
            schema_id,
            item_id,
            issuer: sender,
            value,
        });

        attestation
    }

    public fun revoke_singleton_attestation(
        attestation: &mut SingletonAttestation,
        schema_registry: &SchemaRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let schema = schema_registry::get_schema(schema_registry, attestation.schema_id);

        assert!(schema_registry::is_revocable(schema), ENotRevocable);

        let resolver = schema_registry::get_resolver(schema);
        assert!(
            sender == attestation.issuer ||
            (option::is_some(resolver) && option::borrow(resolver) == &sender),
            ENotAuthorized
        );

        attestation.revoked = true;

        event::emit(SingletonAttestationRevoked {
            attestation_id: object::id(attestation),
            revoker: sender,
        });
    }

    // === View Functions ===

    public fun is_valid(attestation: &SingletonAttestation, current_epoch: u64): bool {
        !attestation.revoked && attestation.expiration_epoch > current_epoch
    }

    public fun get_value(attestation: &SingletonAttestation): u64 { attestation.value }
    public fun get_item_id(attestation: &SingletonAttestation): address { attestation.item_id }
    public fun get_metadata(attestation: &SingletonAttestation): vector<u8> { attestation.metadata }
    public fun get_issuer(attestation: &SingletonAttestation): address { attestation.issuer }
}
