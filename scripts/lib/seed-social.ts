/**
 * seed-social.ts — PTB builder for social-layer seeding (vouch).
 *
 * Exports:
 *   txCreateVouch — deployer vouches for SYNTHETIC.PLAYER_A    (TX-3)
 *
 * Single responsibility: social/trust-layer PTB construction only.
 *
 * ---------------------------------------------------------------------------
 * LOAN_SEEDING_NOTE
 * -----------------
 * lending::issue_loan cannot be seeded with a single deployer key. Two
 * constraints block it:
 *
 * 1. SBT constraint: ReputationProfile has key but NOT store, making it
 *    a non-transferable soul-bound token. oracle_registry::update_score
 *    takes `&mut ReputationProfile`, so only the OWNER of the profile can
 *    include it in a PTB. This means the deployer can update their own
 *    score, but CANNOT write a score to SYNTHETIC.PLAYER_A's profile
 *    (that address has no profile, and if it did, only PLAYER_A could sign).
 *
 * 2. Vouch ownership constraint: after create_vouch, the Vouch object is
 *    transferred to the vouchee (SYNTHETIC.PLAYER_A). The deployer no longer
 *    owns it and cannot include it in a subsequent PTB as `&Vouch`.
 *
 * Together, lending::issue_loan requires:
 *   - A borrower_profile owned by BORROWER address, with CREDIT >= 300
 *   - A Vouch owned by BORROWER, with voucher.CREDIT >= 500
 *   - Lender != Borrower (ESelfLoan guard)
 *   - A second signing key (BORROWER's key) to build the PTB
 *
 * Fix options for sprint 2+:
 *   A. Add `share_profile()` entry fun to profile.move:
 *        public entry fun share_profile(profile: ReputationProfile) {
 *            transfer::share_object(profile);
 *        }
 *      This converts the SBT to a shared object, allowing the oracle's PTB
 *      to borrow it mutably for score writes and the lender's PTB to borrow
 *      it immutably for creditworthiness checks. Trade-off: profile is no
 *      longer soul-bound (review before merging).
 *
 *   B. Two-wallet seed: run a second borrower seed script
 *      signed by a different wallet that holds PLAYER_A's profile.
 *
 * Current status: loans table is intentionally empty post-seed. The indexer
 * LoanProcessor handles zero rows without errors.
 * ---------------------------------------------------------------------------
 */
import { Transaction }  from '@mysten/sui/transactions';
import { PKG, VOUCH_STAKE_MIST, SYNTHETIC } from './seed-config.js';

/**
 * TX-3: create a vouch from deployer → SYNTHETIC.PLAYER_A.
 *
 * Pre-conditions (enforced on-chain):
 *   - deployer's CREDIT score >= 500 (set by txSelfScore to 700)
 *   - profileId is owned by sender
 *
 * The Vouch object is transferred to SYNTHETIC.PLAYER_A by the Move contract.
 * The deployer does not receive or retain it.
 */
export function txCreateVouch(sender: string, profileId: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(VOUCH_STAKE_MIST)]);
  const stakeBalance = tx.moveCall({
    target: '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments: [stakeCoin],
  });

  tx.moveCall({
    target: `${PKG}::vouch::create_vouch`,
    arguments: [
      tx.object(profileId),                    // &ReputationProfile (voucher's)
      tx.pure.address(SYNTHETIC.PLAYER_A),     // vouchee_address
      stakeBalance,                            // stake: Balance<SUI>
    ],
  });

  return tx;
}
