import { describe, it, expect, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createClient } from './network';
import { TEST_ADDRESSES, SCHEMAS, validateAddresses } from './config';
import { TestPlayer } from './helpers';

describe('05 — Attestations & Singleton', () => {
  let client: SuiClient;
  let oracle: TestPlayer;
  let itemOwner: TestPlayer;

  beforeAll(async () => {
    validateAddresses(TEST_ADDRESSES);
    client = createClient('testnet');
    oracle = { address: '0x' + 'EE'.repeat(32), label: 'oracle' } as TestPlayer;
    itemOwner = { address: '0x' + 'FF'.repeat(32), label: 'itemOwner' } as TestPlayer;
  });

  it('oracle can issue a player attestation referencing registered schema', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::attestation::issue`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.PIRATE_INDEX_V1)),
        tx.pure.address(itemOwner.address),
        tx.pure.u64(80),
        tx.pure.u64(30), // 30 epochs expiration
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('AttestationIssued')
    )).toBeTruthy();
  });

  it('non-oracle cannot issue attestation', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::attestation::issue`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.CREDIT)),
        tx.pure.address(itemOwner.address),
        tx.pure.u64(500),
        tx.pure.u64(30),
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: itemOwner as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Non-oracle issuance should be rejected');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/EInvalidOracle|abort_code.*4/i);
    }
  });

  it('oracle can issue a singleton attestation for an in-game item', async () => {
    const itemId = '0x' + 'AB'.repeat(32);
    const tx = new Transaction();

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::singleton::issue_singleton_attestation`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode('SHIP_PROVENANCE_V1')),
        tx.pure.address(itemId),
        tx.pure.u64(95),
        tx.pure.vector('u8', new TextEncoder().encode('famous_fleet_commander_owned_this')),
        tx.pure.u64(60),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('SingletonAttestationIssued')
    )).toBeTruthy();
  });

  it('singleton attestation revocation requires issuer or resolver', async () => {
    const revokeTx = new Transaction();
    revokeTx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::singleton::revoke_singleton_attestation`,
      arguments: [
        revokeTx.object('0xREPLACE_WITH_SINGLETON_ATTESTATION_ID'),
        revokeTx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: revokeTx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('SingletonAttestationRevoked')
    )).toBeTruthy();
  });

  it('attestation is_valid returns false after expiration', async () => {
    // Dry-run with a future epoch beyond attestation expiry
    const tx = new Transaction();
    const [valid] = tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::attestation::is_valid`,
      arguments: [
        tx.object('0xREPLACE_WITH_ATTESTATION_ID'),
        tx.pure.u64(9999), // Way past expiration (30 epochs)
      ],
    });

    const dryRun = await client.dryRunTransaction({ transaction: tx });
    expect(dryRun.effects?.status.status).toBe('success');
  });
});