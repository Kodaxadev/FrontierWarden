// tx-lending.ts — PTB builders for lending module entry funs.
//
// repay_loan:          borrower passes loan object + repayment amount.
// mark_loan_defaulted: anyone can call once loan.due_epoch has passed.
//
// issue_loan is intentionally omitted: it is a public fun (not entry) that
// requires the lender to pass the borrower's owned Vouch object — not possible
// in a single-signer PTB. Call it from a custom contract or multi-party flow.

import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = ['VITE_PKG_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

function env(k: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[k];
}

function req(k: ConfigKey): string {
  const v = env(k);
  if (!v) throw new Error(`lending tx: missing env var ${k}`);
  return v;
}

export function missingLendingConfig(): ConfigKey[] { return CONFIG_KEYS.filter(k => !env(k)); }
export function lendingConfigReady(): boolean       { return missingLendingConfig().length === 0; }

export interface RepayLoanArgs {
  loanId:        string;
  repaymentMist: bigint;
}

export interface MarkDefaultArgs {
  loanId: string;
}

export function buildRepayLoanTx(args: RepayLoanArgs): Transaction {
  const tx = new Transaction();
  const [repaymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.repaymentMist)]);
  const repaymentBalance = tx.moveCall({
    target:        '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments:     [repaymentCoin],
  });
  tx.moveCall({
    target:    `${req('VITE_PKG_ID')}::lending::repay_loan`,
    arguments: [tx.object(args.loanId), repaymentBalance],
  });
  return tx;
}

export function buildMarkDefaultTx(args: MarkDefaultArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target:    `${req('VITE_PKG_ID')}::lending::mark_loan_defaulted`,
    arguments: [tx.object(args.loanId)],
  });
  return tx;
}
