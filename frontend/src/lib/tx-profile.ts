// tx-profile.ts — PTB builder for profile::create_profile.
// No arguments required: the profile is created for tx sender and transferred to them.

import { Transaction } from '@mysten/sui/transactions';

function req(key: 'VITE_PKG_ID'): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  if (!v) throw new Error('profile tx: missing VITE_PKG_ID');
  return v;
}

export function buildCreateProfileTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${req('VITE_PKG_ID')}::profile::create_profile`, arguments: [] });
  return tx;
}
