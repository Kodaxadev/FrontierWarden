#[allow(duplicate_alias)]
module reputation::vouch {
    use sui::object;
    use sui::transfer;

    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::event;
    use reputation::profile::{Self, ReputationProfile};

    // === Errors ===
    const EInsufficientReputation: u64 = 1;
    const EProfileOwnerMismatch: u64 = 5;
    const ENotExpired: u64 = 6;
    const EVouchInactive: u64 = 7;

    // === Constants ===
    const MIN_VOUCHER_SCORE: u64 = 500;
    const VOUCH_DURATION_EPOCHS: u64 = 30;

    // === Events ===
    public struct VouchCreated has copy, drop {
        vouch_id: address,
        voucher: address,
        vouchee: address,
        stake: u64,
    }

    public struct VouchRedeemed has copy, drop {
        vouch_id: address,
        voucher: address,
        amount_returned: u64,
    }

    // === Structs ===
    public struct Vouch has key, store {
        id: UID,
        voucher: address,
        vouchee: address,
        stake_amount: u64,
        staked_balance: Balance<SUI>,
        expires_at: u64,
        active: bool,
    }

    // === Public Functions ===

    public fun create_vouch(
        voucher_profile: &ReputationProfile,
        vouchee_address: address,
        stake: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        let voucher = tx_context::sender(ctx);
        assert!(profile::get_owner(voucher_profile) == voucher, EProfileOwnerMismatch);
        assert!(
            profile::get_score(voucher_profile, b"CREDIT") >= MIN_VOUCHER_SCORE,
            EInsufficientReputation
        );

        let amount = balance::value(&stake);
        let vouch = Vouch {
            id: object::new(ctx),
            voucher,
            vouchee: vouchee_address,
            stake_amount: amount,
            staked_balance: stake,
            expires_at: tx_context::epoch(ctx) + VOUCH_DURATION_EPOCHS,
            active: true,
        };

        let vouch_address = object::id_address(&vouch);
        transfer::public_transfer(vouch, vouchee_address);

        event::emit(VouchCreated { vouch_id: vouch_address, voucher, vouchee: vouchee_address, stake: amount });
    }

    // Package-internal: only lending.move calls this on default
    public(package) fun slash_for_default(vouch: &mut Vouch, _ctx: &mut TxContext): Balance<SUI> {
        assert!(vouch.active, EVouchInactive);
        vouch.active = false;
        vouch.stake_amount = 0;
        balance::withdraw_all(&mut vouch.staked_balance)
    }

    // FIX: sends stake back to voucher (not sender), captures vouch_id before destructure
    public fun redeem_expired(vouch: Vouch, ctx: &mut TxContext) {
        assert!(tx_context::epoch(ctx) > vouch.expires_at || !vouch.active, ENotExpired);

        let voucher_addr = vouch.voucher;
        let amount = vouch.stake_amount;
        let vouch_id = object::id_address(&vouch);

        let Vouch { id, voucher: _, vouchee: _, stake_amount: _, staked_balance, expires_at: _, active: _ } = vouch;
        object::delete(id);

        transfer::public_transfer(coin::from_balance(staked_balance, ctx), voucher_addr);

        event::emit(VouchRedeemed { vouch_id, voucher: voucher_addr, amount_returned: amount });
    }

    // === Use-site Helpers ===

    public fun verify_vouch_coverage(
        vouch: &Vouch,
        loan_amount: u64,
        min_collateral_pct: u64,
        borrower: address,
    ): bool {
        if (!vouch.active) return false;
        if (vouch.vouchee != borrower) return false;
        let required_stake = (loan_amount * min_collateral_pct) / 100;
        vouch.stake_amount >= required_stake
    }

    public fun get_stake_amount(vouch: &Vouch): u64 { vouch.stake_amount }
    public fun is_active(vouch: &Vouch): bool { vouch.active }
    public fun get_voucher(vouch: &Vouch): address { vouch.voucher }
    public fun get_vouchee(vouch: &Vouch): address { vouch.vouchee }
}
