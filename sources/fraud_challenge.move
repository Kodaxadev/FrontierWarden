module reputation::fraud_challenge {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::vec_set::{Self, VecSet};
    use sui::event;
    use reputation::oracle_registry::{Self, OracleRegistry};

    // === Errors ===
    // 3 and 4 mirror oracle_registry constants     values must stay in sync.
    const EOracleNotFound: u64 = 3;
    const EInsufficientStake: u64 = 4;
    const ENotCouncilMember: u64 = 6;
    const EChallengeExpired: u64 = 7;
    const EChallengeNotReady: u64 = 8;
    const EAlreadyResolved: u64 = 9;
    const ENoQuorum: u64 = 10;
    const EAlreadyVoted: u64 = 11;
    const ENotResolved: u64 = 14;

    // === Constants ===
    // MIN_STAKE mirrors oracle_registry::MIN_STAKE     keep in sync.
    const MIN_STAKE: u64 = 1_000_000_000; // 1 SUI in MIST
    const CHALLENGE_WINDOW_EPOCHS: u64 = 7;
    const SLASH_PERCENTAGE: u64 = 10;
    const CHALLENGER_REWARD_PERCENTAGE: u64 = 50;

    // === Events ===
    public struct FraudChallengeCreated has copy, drop {
        challenge_id: address,
        attestation_id: ID,
        challenger: address,
        oracle: address,
    }

    public struct FraudChallengeResolved has copy, drop {
        challenge_id: address,
        guilty: bool,
        slash_amount: u64,
    }

    public struct ChallengeVoted has copy, drop {
        challenge_id: address,
        voter: address,
        guilty: bool,
        votes_guilty: u64,
        votes_innocent: u64,
    }

    // === Structs ===
    // voters uses VecSet<address> (has `drop`) rather than Table to prevent resource
    // leaks on object deletion. O(n) membership checks are fine: council is small (~9).
    public struct FraudChallenge has key {
        id: UID,
        attestation_id: ID,
        oracle: address,
        challenger: address,
        evidence_hash: vector<u8>,
        challenger_stake: Balance<SUI>,
        votes_guilty: u64,
        votes_innocent: u64,
        voters: VecSet<address>,
        deadline_epoch: u64,
        resolved: bool,
        slash_amount: u64,
    }

    // === Entry Functions ===

    public entry fun create_fraud_challenge(
        registry: &OracleRegistry,
        attestation_id: ID,
        oracle_address: address,
        evidence_hash: vector<u8>,
        challenger_stake: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(oracle_registry::contains_oracle(registry, oracle_address), EOracleNotFound); // BRIDGE
        assert!(balance::value(&challenger_stake) >= MIN_STAKE / 2, EInsufficientStake);

        let challenge = FraudChallenge {
            id: object::new(ctx),
            attestation_id,
            oracle: oracle_address,
            challenger: tx_context::sender(ctx),
            evidence_hash,
            challenger_stake,
            votes_guilty: 0,
            votes_innocent: 0,
            voters: vec_set::empty(),
            deadline_epoch: tx_context::epoch(ctx) + CHALLENGE_WINDOW_EPOCHS,
            resolved: false,
            slash_amount: 0,
        };
        let challenge_id = object::id_address(&challenge);
        transfer::share_object(challenge);

        event::emit(FraudChallengeCreated {
            challenge_id,
            attestation_id,
            challenger: tx_context::sender(ctx),
            oracle: oracle_address,
        });
    }

    // VecSet prevents double-voting without Table lifecycle management overhead.
    public entry fun vote_on_challenge(
        challenge: &mut FraudChallenge,
        registry: &OracleRegistry,
        guilty: bool,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(oracle_registry::is_council_member(registry, sender), ENotCouncilMember); // BRIDGE
        assert!(tx_context::epoch(ctx) <= challenge.deadline_epoch, EChallengeExpired);
        assert!(!challenge.resolved, EAlreadyResolved);
        assert!(!vec_set::contains(&challenge.voters, &sender), EAlreadyVoted);

        vec_set::insert(&mut challenge.voters, sender);
        if (guilty) {
            challenge.votes_guilty = challenge.votes_guilty + 1;
        } else {
            challenge.votes_innocent = challenge.votes_innocent + 1;
        };

        event::emit(ChallengeVoted {
            challenge_id: object::id_address(challenge),
            voter: sender,
            guilty,
            votes_guilty: challenge.votes_guilty,
            votes_innocent: challenge.votes_innocent,
        });
    }

    // Resolves a challenge after deadline_epoch has passed.
    // Quorum is clamped to minimum 1 so a zero-member council cannot
    // silently pass a challenge with zero votes (integer division gives 0
    // when council_size <= 1 without the clamp).
    public entry fun resolve_challenge(
        challenge: &mut FraudChallenge,
        registry: &mut OracleRegistry,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::epoch(ctx) > challenge.deadline_epoch, EChallengeNotReady);
        assert!(!challenge.resolved, EAlreadyResolved);
        challenge.resolved = true;

        let raw_quorum = oracle_registry::get_council_size(registry) * 2 / 3; // BRIDGE
        let quorum = if (raw_quorum == 0) { 1 } else { raw_quorum };
        let total_votes = challenge.votes_guilty + challenge.votes_innocent;
        assert!(total_votes > 0, ENoQuorum);

        let guilty = total_votes >= quorum && challenge.votes_guilty >= quorum;
        let challenge_addr = object::id_address(challenge);
        let treasury = oracle_registry::get_treasury(registry); // BRIDGE

        if (guilty) {
            let (reward_bal, treasury_bal, slash_total) = oracle_registry::slash_oracle_stake( // BRIDGE
                registry,
                challenge.oracle,
                SLASH_PERCENTAGE,
                CHALLENGER_REWARD_PERCENTAGE,
            );
            challenge.slash_amount = slash_total;

            if (slash_total > 0) {
                transfer::public_transfer(
                    coin::from_balance(reward_bal, ctx), challenge.challenger
                );
                transfer::public_transfer(
                    coin::from_balance(treasury_bal, ctx), treasury
                );
            } else {
                balance::destroy_zero(reward_bal);
                balance::destroy_zero(treasury_bal);
            };

            transfer::public_transfer(
                coin::from_balance(balance::withdraw_all(&mut challenge.challenger_stake), ctx),
                challenge.challenger
            );
        } else {
            let stake_half = balance::value(&challenge.challenger_stake) / 2;
            let penalty = balance::split(&mut challenge.challenger_stake, stake_half);
            transfer::public_transfer(coin::from_balance(penalty, ctx), treasury);
            transfer::public_transfer(
                coin::from_balance(balance::withdraw_all(&mut challenge.challenger_stake), ctx),
                challenge.challenger
            );
        };

        event::emit(FraudChallengeResolved {
            challenge_id: challenge_addr,
            guilty,
            slash_amount: challenge.slash_amount,
        });
    }

    // GC path for resolved challenges. challenger_stake must be empty (drained
    // in resolve_challenge) so balance::destroy_zero enforces correctness.
    public entry fun delete_resolved_challenge(
        challenge: FraudChallenge,
        _ctx: &mut TxContext
    ) {
        assert!(challenge.resolved, ENotResolved);
        let FraudChallenge {
            id, attestation_id: _, oracle: _, challenger: _, evidence_hash: _,
            challenger_stake, votes_guilty: _, votes_innocent: _, voters: _,
            deadline_epoch: _, resolved: _, slash_amount: _,
        } = challenge;
        object::delete(id);
        balance::destroy_zero(challenger_stake);
    }

    // === Test Helpers ===
    #[test_only]
    public fun get_votes_guilty(challenge: &FraudChallenge): u64 { challenge.votes_guilty }

    #[test_only]
    public fun get_votes_innocent(challenge: &FraudChallenge): u64 { challenge.votes_innocent }

    #[test_only]
    public fun is_resolved(challenge: &FraudChallenge): bool { challenge.resolved }
}
