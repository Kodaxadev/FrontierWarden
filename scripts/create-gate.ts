/**
 * create-gate.ts -- Create the live reputation gate for the current package.
 *
 * Usage:
 *   npx tsx scripts/create-gate.ts [admin_owner]
 *
 * Creates reputation_gate::GatePolicy and GateAdminCap. If admin_owner differs
 * from the deployer, the GateAdminCap is transferred in a second transaction.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { PKG } from './lib/seed-config.js';
import { execute, loadKeypair, makeClient } from './lib/seed-wallet.js';

const DEFAULT_ADMIN_OWNER =
  '0x9cc038e5f0045dbf75ce191870fd7c483020d12bc23f3ebaef7a6f4f22d820e1';

function encodeStr(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function addressesPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, 'testnet-addresses.json');
}

function updateAddresses(
  gatePolicyId: string,
  gateInitialVersion: number | undefined,
  gateAdminCapId: string,
  adminOwner: string,
  createDigest: string,
  transferDigest: string | null,
): void {
  const path = addressesPath();
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;

  raw.shared_objects.gate_policy = {
    id: gatePolicyId,
    type: '...::reputation_gate::GatePolicy',
    initial_version: gateInitialVersion,
    create_tx: createDigest,
    config: {
      schema_id: 'TRIBE_STANDING',
      ally_threshold: 500,
      base_toll_mist: 100000000,
    },
  };
  raw.shared_objects.gate_admin_cap = {
    id: gateAdminCapId,
    type: '...::reputation_gate::GateAdminCap',
    owner: adminOwner,
    transfer_tx: transferDigest,
  };

  writeFileSync(path, JSON.stringify(raw, null, 2) + '\n', 'utf8');
}

function buildCreateGateTx(sender: string, adminOwner: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);

  tx.moveCall({
    target: `${PKG}::reputation_gate::create_gate`,
    arguments: [
      tx.pure.vector('u8', encodeStr('TRIBE_STANDING')),
      tx.pure.u64(500),
      tx.pure.u64(100000000),
    ],
  });

  return tx;
}

function buildTransferCapTx(
  sender: string,
  gateAdminCapId: string,
  adminOwner: string,
): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.transferObjects([tx.object(gateAdminCapId)], adminOwner);
  return tx;
}

async function main(): Promise<void> {
  const adminOwner = process.argv[2] ?? DEFAULT_ADMIN_OWNER;
  if (!/^0x[0-9a-fA-F]{64}$/.test(adminOwner)) {
    throw new Error('Admin owner must be a 0x Sui address.');
  }

  const keypair = loadKeypair();
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = makeClient();

  console.log('=== create-gate ===');
  console.log(`sender      : ${sender}`);
  console.log(`admin_owner : ${adminOwner}`);
  console.log(`package     : ${PKG}`);
  console.log('');

  const result = await execute(
    client,
    keypair,
    buildCreateGateTx(sender, adminOwner),
    'TX-CREATE-GATE',
  );

  const gatePolicy = result.objectChanges.find(
    c => c.type === 'created' && c.objectType?.includes('::reputation_gate::GatePolicy'),
  ) as ({ objectId: string; owner?: { Shared?: { initial_shared_version?: number } } } | undefined);
  const adminCap = result.objectChanges.find(
    c => c.type === 'created' && c.objectType?.includes('::reputation_gate::GateAdminCap'),
  )?.objectId;

  if (!gatePolicy?.objectId || !adminCap) {
    throw new Error('GatePolicy or GateAdminCap was not found in object changes.');
  }

  let transferDigest: string | null = null;
  if (adminOwner !== sender) {
    console.log('');
    console.log(`[2/2] transfer GateAdminCap to ${adminOwner}`);
    const transfer = await execute(
      client,
      keypair,
      buildTransferCapTx(sender, adminCap, adminOwner),
      'TX-TRANSFER-GATE-CAP',
    );
    transferDigest = transfer.digest;
  }

  updateAddresses(
    gatePolicy.objectId,
    gatePolicy.owner?.Shared?.initial_shared_version,
    adminCap,
    adminOwner,
    result.digest,
    transferDigest,
  );

  console.log('');
  console.log(`gate_policy    : ${gatePolicy.objectId}`);
  console.log(`initial_version: ${gatePolicy.owner?.Shared?.initial_shared_version ?? '(unknown)'}`);
  console.log(`gate_admin_cap : ${adminCap}`);
  console.log('testnet-addresses.json updated.');
}

main().catch(err => {
  console.error('[create-gate] fatal:', err);
  process.exit(1);
});
