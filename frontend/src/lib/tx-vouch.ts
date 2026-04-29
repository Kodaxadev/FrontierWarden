// tx-vouch.ts — PTB builders for vouch module entry funs.
//
// create_vouch:   sender (voucher) must own a ReputationProfile with CREDIT ≥ 300.
//                 The resulting Vouch object is transferred to the vouchee.
// redeem_expired: sender must own the Vouch (vouchee) and it must be expired/inactive.

import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = ['VITE_PKG_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

function env(k: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[k];
}

function req(k: ConfigKey): string {
  const v = env(k);
  if (!v) throw new Error(`vouch tx: missing env var ${k}`);
  return v;
}

export function missingVouchConfig(): ConfigKey[] { return CONFIG_KEYS.filter(k => !env(k)); }
export function vouchConfigReady(): boolean       { return missingVouchConfig().length === 0; }

export interface CreateVouchArgs {
  voucherProfileId: string; // sender's owned ReputationProfile object ID
  voucheeAddress:   string;
  stakeMist:        bigint;
}

export interface RedeemVouchArgs {
  vouchId: string; // sender (vouchee) owns this Vouch object
}

export function buildCreateVouchTx(args: CreateVouchArgs): Transaction {
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.stakeMist)]);
  const stakeBalance = tx.moveCall({
    target:        '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments:     [stakeCoin],
  });
  tx.moveCall({
    target: `${req('VITE_PKG_ID')}::vouch::create_vouch`,
    arguments: [
      tx.object(args.voucherProfileId),
      tx.pure.address(args.voucheeAddress),
      stakeBalance,
    ],
  });
  return tx;
}

export function buildRedeemVouchTx(args: RedeemVouchArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target:    `${req('VITE_PKG_ID')}::vouch::redeem_expired`,
    arguments: [tx.object(args.vouchId)],
  });
  return tx;
}
