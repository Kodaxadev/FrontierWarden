/**
 * debug-build-check-passage.ts
 *
 * Minimal isolated repro for gate passage PTB construction.
 * No React. No providers. No signing. No submission.
 *
 * Usage:
 *   npx tsx scripts/debug-build-check-passage.ts
 *
 * NOTE: packageId below corrects a typo in the prompt (65 hex chars → 64).
 * Prompt had: 0xe41ddd1a2126af8b4baae52ea...  (extra 'a')
 * Railway env has: 0xe41ddd1a2126af8b4bae52ea...  (64 chars — used here)
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction, Inputs } from '@mysten/sui/transactions';

// ── Hardcoded values ──────────────────────────────────────────────────────────

const NETWORK = 'testnet';

const PKG_ID =
  '0xe41ddd1a2126af8b4bae52ea0526959f76b4e4f445c1054a53cbecfb15ac0ea2';

const GATE_REF = {
  objectId:             '0xb63c9939e28db885392e68537336f85453392ac07d4590c029d1f65938733e36',
  initialSharedVersion: 349181609,
  mutable:              true,
} as const;

const ATTESTATION_REF = {
  objectId: '0x7733f5e5fa18892134afdeecd690c5cc607b4ed1f2fa0065238ccc16b83faece',
  version:  '349181631',
  digest:   '4NKLcwEqtZyPGJHQDJMxCqZsmdKhtgtsTeztVB7uKGxo',
} as const;

const SENDER =
  '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Create JSON-RPC client
  const rpcUrl = getJsonRpcFullnodeUrl(NETWORK as 'testnet');
  const client = new SuiJsonRpcClient({ url: rpcUrl, network: NETWORK as 'testnet' });
  console.log(`[1] SuiJsonRpcClient created — ${NETWORK} (${rpcUrl})\n`);

  // 2. Fetch gate object
  console.log('[2] Fetching gate object...');
  const gateObj = await client.getObject({
    id: GATE_REF.objectId,
    options: { showOwner: true, showType: true },
  });
  console.log('    objectId:', GATE_REF.objectId);
  console.log('    owner:  ', JSON.stringify(gateObj.data?.owner));
  console.log('    version:', gateObj.data?.version);
  console.log('    digest: ', gateObj.data?.digest);
  console.log('    error:  ', gateObj.error ?? 'none');

  // 3. Fetch attestation object (get live version/digest in case hardcoded values are stale)
  console.log('\n[3] Fetching attestation object...');
  const attObj = await client.getObject({
    id: ATTESTATION_REF.objectId,
    options: { showOwner: true, showType: true },
  });
  console.log('    objectId:', ATTESTATION_REF.objectId);
  console.log('    owner:  ', JSON.stringify(attObj.data?.owner));
  console.log('    version:', attObj.data?.version, '  (hardcoded:', ATTESTATION_REF.version + ')');
  console.log('    digest: ', attObj.data?.digest, '  (hardcoded:', ATTESTATION_REF.digest + ')');
  console.log('    error:  ', attObj.error ?? 'none');

  // Use live version/digest if available; fall back to hardcoded
  const liveAttRef = {
    objectId: ATTESTATION_REF.objectId,
    version:  attObj.data?.version  ?? ATTESTATION_REF.version,
    digest:   attObj.data?.digest   ?? ATTESTATION_REF.digest,
  };

  // 4. List sender SUI coins
  console.log('\n[4] Listing SUI coins for sender...');
  const coinsResult = await client.getCoins({
    owner:    SENDER,
    coinType: '0x2::sui::SUI',
  });
  console.log(`    Found ${coinsResult.data.length} coin(s):`);
  for (const c of coinsResult.data) {
    console.log(`      ${c.coinObjectId}  version=${c.version}  balance=${c.balance}`);
  }

  // 5. Pick payment coin
  const paymentCoin = coinsResult.data.find(c => BigInt(c.balance) >= 1n);
  if (!paymentCoin) {
    throw new Error('No SUI coins with balance >= 1 found for sender');
  }
  console.log('\n[5] Payment coin selected:');
  console.log('    objectId:', paymentCoin.coinObjectId);
  console.log('    version: ', paymentCoin.version);
  console.log('    digest:  ', paymentCoin.digest);

  // 6–9. Build PTB
  console.log('\n[6] Building transaction...');
  const tx = new Transaction();
  tx.setSender(SENDER);

  const gateArg = tx.object(Inputs.SharedObjectRef(GATE_REF));

  const attestationArg = tx.object(Inputs.ObjectRef(liveAttRef));

  const paymentArg = tx.object(Inputs.ObjectRef({
    objectId: paymentCoin.coinObjectId,
    version:  paymentCoin.version,
    digest:   paymentCoin.digest,
  }));

  tx.moveCall({
    target: `${PKG_ID}::reputation_gate::check_passage`,
    arguments: [gateArg, attestationArg, paymentArg],
  });

  console.log('[7] moveCall added.');
  console.log('[8] tx.getData():');
  console.log(JSON.stringify(tx.getData(), (_k, v) =>
    typeof v === 'bigint' ? v.toString() + 'n' : v, 2));

  // 9. Build kind bytes
  console.log('\n[9] Calling tx.build({ onlyTransactionKind: true })...');
  try {
    const kindBytes = await tx.build({ client, onlyTransactionKind: true });
    console.log('\n✓ BUILD SUCCESS');
    console.log('  Kind bytes length:', kindBytes.length);
  } catch (err: unknown) {
    console.error('\n✗ BUILD FAILED');
    if (err instanceof Error) {
      console.error('  name:   ', err.name);
      console.error('  message:', err.message);
      console.error('  stack:\n', err.stack);
      if ('cause' in err) console.error('  cause:  ', err.cause);
    }
    console.error('\n  serialized error:');
    console.error(JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
