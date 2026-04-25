module reputation::lending {
    use std::option::{Self, Option};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::coin;
    use sui::event;
    use reputation::profile::{Self, ReputationProfile};
    use reputation::vouch::{Self, Vouch};

    // === Errors ===
    const EInsufficientVouchStake: u64 = 1;
    const EWrongBorrower: u64 = 2;
    const EInsufficientCredit: u64 = 3;
    const ELoanTooLarge: u64 = 4;
    const ESelfLoan: u64 = 5;
    const ELoanNotDefaulted: u64 = 6;
    const EMismatch: u64 = 7;
    const EAlreadyRepaid: u64 = 9;
    const ELoanDefaulted: u64 = 10;

    // === Constants ===
    const MIN_COLLATERAL_PCT: u64 = 20;
    const MAX_LOAN_MULTIPLIER: u64 = 5;

    // === Events ===
    public struct LoanIssued has copy, drop {
        loan_id: address,
        borrower: address,
        lender: address,
        amount: u64,
    }

    public struct LoanRepaid has copy, drop {
        loan_id: address,
        amount: u64,
        borrower: address,
    }

    public struct LoanDefaulted has copy, drop {
        loan_id: address,
        borrower: address,
        vouch_slashed: u64,
    }

    // === Structs ===
    public struct Loan has key, store {
        id: UID,
        borrower: address,
        lender: address,
        amount: u64,
        collateral: Balance<SUI>,
        vouch_id: Option<address>,
        issued_at: u64,
        due_epoch: u64,
        repaid: bool,
        // FIX: prevents repayment after vouch has been slashed for default
        defaulted: bool,
    }

    // Admin capability — minted once at init, held by deployer
    public struct LendingCapability has key, store {
        id: UID,
        lending_module: address,
    }

    // FIX: init mints LendingCapability to deployer so slash_defaulted_vouch can be called
    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            LendingCapability { id: object::new(ctx), lending_module: @reputation },
            tx_context::sender(ctx)
        );
    }

    // === Public Functions ===

    // FIX: returns Loan to caller for PTB composition (no internal transfer)
    // FIX: self-loan prevention, correct borrower derivation from profile
    public fun issue_loan(
        borrower_profile: &ReputationProfile,
        vouch: &Vouch,
        loan_amount: u64,
        collateral: Balance<SUI>,
        ctx: &mut TxContext
    ): Loan {
        let lender = tx_context::sender(ctx);
        let borrower = profile::get_owner(borrower_profile);

        assert!(borrower != lender, ESelfLoan);
        assert!(vouch::verify_vouch_coverage(vouch, loan_amount, MIN_COLLATERAL_PCT, borrower), EInsufficientVouchStake);

        let credit_score = profile::get_score(borrower_profile, b"CREDIT");
        assert!(credit_score >= 300, EInsufficientCredit);

        let max_loan = credit_score * MAX_LOAN_MULTIPLIER * 1_000_000_000;
        assert!(loan_amount <= max_loan, ELoanTooLarge);

        let loan = Loan {
            id: object::new(ctx),
            borrower,
            lender,
            amount: loan_amount,
            collateral,
            vouch_id: option::some(object::id_address(vouch)),
            issued_at: tx_context::epoch(ctx),
            due_epoch: tx_context::epoch(ctx) + 30,
            repaid: false,
            defaulted: false,
        };

        event::emit(LoanIssued {
            loan_id: object::id_address(&loan),
            borrower,
            lender,
            amount: loan_amount,
        });

        loan
    }

    // FIX: emits event for oracle to update credit score (no direct score write)
    // FIX: guards against repayment of already-defaulted loans
    public entry fun repay_loan(
        loan: &mut Loan,
        repayment: Balance<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(!loan.repaid, EAlreadyRepaid);
        assert!(!loan.defaulted, ELoanDefaulted);
        assert!(balance::value(&repayment) >= loan.amount, EInsufficientCredit);

        loan.repaid = true;

        event::emit(LoanRepaid { loan_id: object::id_address(loan), amount: loan.amount, borrower: loan.borrower });

        transfer::public_transfer(
            coin::from_balance(balance::withdraw_all(&mut loan.collateral), ctx),
            loan.borrower
        );
        transfer::public_transfer(coin::from_balance(repayment, ctx), loan.lender);
    }

    // Anyone can mark a loan as defaulted once its due epoch has passed.
    // Separating this from slashing makes the state transition observable on-chain
    // and means slash_defaulted_vouch can stay a pure asset-handling step.
    public entry fun mark_loan_defaulted(
        loan: &mut Loan,
        ctx: &mut TxContext
    ) {
        assert!(!loan.repaid, EAlreadyRepaid);
        assert!(!loan.defaulted, ELoanDefaulted);
        assert!(tx_context::epoch(ctx) > loan.due_epoch, ELoanNotDefaulted);
        loan.defaulted = true;
    }

    // FIX: actually performs vouch slash and marks loan defaulted
    // FIX: uses LendingCapability as access gate
    public entry fun slash_defaulted_vouch(
        loan: &mut Loan,
        vouch: &mut Vouch,
        _cap: &LendingCapability,
        _ctx: &mut TxContext
    ) {
        assert!(loan.borrower == vouch::get_vouchee(vouch), EMismatch);
        assert!(loan.defaulted, ELoanNotDefaulted);

        let slashed = vouch::slash_for_default(vouch, _ctx);
        let slash_amount = balance::value(&slashed);

        transfer::public_transfer(coin::from_balance(slashed, _ctx), loan.lender);

        event::emit(LoanDefaulted {
            loan_id: object::id_address(loan),
            borrower: loan.borrower,
            vouch_slashed: slash_amount,
        });
    }

    // === Test Helpers ===
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test_only]
    public fun expire_loan_for_testing(loan: &mut Loan) {
        loan.due_epoch = 0;
        loan.defaulted = true;
    }
}
