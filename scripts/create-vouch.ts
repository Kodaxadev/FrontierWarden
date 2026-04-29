/**
 * create-vouch.ts — Backend-signed vouch creation for operator proofs.
 *
 * Usage:
 *   npx tsx scripts/create-vouch.ts <voucher_profile_id> <vouchee_address> [stake_mist]
 */
import { Transaction } from '@mysten/sui/transactions';
import { PKG } from './lib/seed-config.js';
import { execute, loadKeypair, makeClient } from './lib/seed-wallet.js';

function buildCreateVouchTx(
  sender: string,
  voucherProfileId: string,
  voucheeAddress: string,
  stakeMist: bigint,
): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeMist)]);
  const stakeBalance = tx.moveCall({
    target: '0x2::coin::into_balance',
    typeArguments: ['0x2::sui::SUI'],
    arguments: [stakeCoin],
  });

  tx.moveCall({
    target: `${PKG}::vouch::create_vouch`,
    arguments: [
      tx.object(voucherProfileId),
      tx.pure.address(voucheeAddress),
      stakeBalance,
    ],
  });

  return tx;
}

async function main(): Promise<void> {
  const voucherProfileId = process.argv[2];
  const voucheeAddress = process.argv[3];
  const stakeMist = BigInt(process.argv[4] ?? '50000000');

  if (!voucherProfileId || !/^0x[0-9a-fA-F]{64}$/.test(voucherProfileId)) {
    throw new Error('First arg must be voucher profile object ID.');
  }
  if (!voucheeAddress || !/^0x[0-9a-fA-F]{64}$/.test(voucheeAddress)) {
    throw new Error('Second arg must be vouchee 0x address.');
  }

  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = makeClient();

  console.log('=== create-vouch ===');
  console.log(`voucher         : ${sender}`);
  console.log(`voucher_profile : ${voucherProfileId}`);
  console.log(`vouchee         : ${voucheeAddress}`);
  console.log(`stake_mist      : ${stakeMist}`);
  console.log('');

  const result = await execute(
    client,
    keypair,
    buildCreateVouchTx(sender, voucherProfileId, voucheeAddress, stakeMist),
    'TX-VOUCH',
  );

  console.log('');
  console.log(`vouch created: ${result.digest}`);
}

main().catch(err => {
  console.error('[create-vouch] fatal:', err);
  process.exit(1);
});
