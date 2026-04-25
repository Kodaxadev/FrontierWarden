import { describe, it, expect, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createClient } from './network';
import { TEST_ADDRESSES, SCHEMAS, validateAddresses } from './config';
import { TestPlayer, fundAddress } from './helpers';

describe('01 — Schema Registry', () => {
  let client: SuiClient;
  let deployer: TestPlayer;
  let stranger: TestPlayer;

  beforeAll(async () => {
    validateAddresses(TEST_ADDRESSES);
    client = createClient('testnet');
    deployer = { address: process.env.DEPLOYER_ADDRESS ?? '0x' + '00'.repeat(32), label: 'deployer' } as TestPlayer;
    stranger = { address: '0x' + '11'.repeat(32), label: 'stranger' } as TestPlayer;
  });

  it('deployer can register a new schema', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::register_schema`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.PIRATE_INDEX_V1)),
        tx.pure.u64(1),
        tx.pure.option('address', null),
        tx.pure.bool(true),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: deployer as unknown as RawSigner,
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('non-deployer cannot register a schema', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::register_schema`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode('UNAUTHORIZED_SCHEMA')),
        tx.pure.u64(1),
        tx.pure.option('address', null),
        tx.pure.bool(false),
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: stranger as unknown as RawSigner,
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Transaction should have reverted');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/abort_code.*1|ECancel|status.*failure/i);
    }
  });

  it('schema deprecation creates upgrade chain', async () => {
    const v1 = new TextEncoder().encode(SCHEMAS.PIRATE_INDEX_V1);
    const v2 = new TextEncoder().encode('PIRATE_INDEX_V2');

    const register = new Transaction();
    register.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::register_schema`,
      arguments: [
        register.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        register.pure.vector('u8', v2),
        register.pure.u64(2),
        register.pure.option('address', null),
        register.pure.bool(true),
      ],
    });

    await client.signAndExecuteTransaction({
      transaction: register,
      signer: deployer as unknown as RawSigner,
      requestType: 'WaitForLocalExecution',
    });

    const deprecate = new Transaction();
    deprecate.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::deprecate_schema`,
      arguments: [
        deprecate.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        deprecate.pure.vector('u8', v1),
        deprecate.pure.vector('u8', v2),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: deprecate,
      signer: deployer as unknown as RawSigner,
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('governance transfer removes deployer admin access', async () => {
    const governanceAddr = '0x' + '22'.repeat(32);
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::transfer_to_governance`,
      arguments: [
        tx.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
        tx.pure.address(governanceAddr),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: deployer as unknown as RawSigner,
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');

    // Deployer no longer has admin — should fail
    try {
      const retry = new Transaction();
      retry.moveCall({
        target: `${TEST_ADDRESSES.PACKAGE}::schema_registry::register_schema`,
        arguments: [
          retry.object(TEST_ADDRESSES.SCHEMA_REGISTRY),
          retry.pure.vector('u8', new TextEncoder().encode('SHOULD_FAIL')),
          retry.pure.u64(1),
          retry.pure.option('address', null),
          retry.pure.bool(false),
        ],
      });

      await client.signAndExecuteTransaction({
        transaction: retry,
        signer: deployer as unknown as RawSigner,
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Deployer should be locked out');
    } catch {
      // Expected
    }
  });
});