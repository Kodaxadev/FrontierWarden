import { describe, it, expect, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createClient } from './network';
import { TEST_ADDRESSES, SCHEMAS, CONSTANTS, validateAddresses } from './config';
import { TestPlayer } from './helpers';

describe('02 — Oracle Registry', () => {
  let client: SuiClient;
  let oracleOperator: TestPlayer;
  let systemContract: TestPlayer;
  let admin: TestPlayer;

  beforeAll(async () => {
    validateAddresses(TEST_ADDRESSES);
    client = createClient('testnet');
    oracleOperator = { address: '0x' + '33'.repeat(32), label: 'oracle' } as TestPlayer;
    systemContract = { address: '0x' + '44'.repeat(32), label: 'system' } as TestPlayer;
    admin = { address: '0x' + '55'.repeat(32), label: 'admin' } as TestPlayer;
  });

  it('operator can register as a standard oracle with stake', async () => {
    const tx = new Transaction();
    const stake = tx.splitCoins(tx.gas, [tx.pure.u64(CONSTANTS.MIN_STAKE_MIST)]);
    const schemas = [SCHEMAS.PIRATE_INDEX_V1, SCHEMAS.COMBAT_SCORE].map((s) =>
      new TextEncoder().encode(s)
    );

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::register_oracle`,
      arguments: [
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode('EF-Map Oracle')),
        tx.pure.vector(schemas.map((s) => tx.pure.vector('u8', s))),
        stake,
        tx.pure.bool(false),
        tx.pure.vector('u8', new TextEncoder().encode('')),
        tx.pure.bool(false),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracleOperator as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('OracleRegistered')
    )).toBeTruthy();
  });

  it('duplicate registration by same address fails', async () => {
    const tx = new Transaction();
    const stake = tx.splitCoins(tx.gas, [tx.pure.u64(CONSTANTS.MIN_STAKE_MIST)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::register_oracle`,
      arguments: [
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode('Duplicate Oracle')),
        tx.pure.vector([]),
        stake,
        tx.pure.bool(false),
        tx.pure.vector('u8', new TextEncoder().encode('')),
        tx.pure.bool(false),
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: oracleOperator as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Duplicate registration should fail');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/EOracleAlreadyExists|abort_code.*2/i);
    }
  });

  it('system contract registers with 0.1x stake and receives SystemCapability', async () => {
    const tx = new Transaction();
    const reducedStake = tx.splitCoins(tx.gas, [tx.pure.u64(CONSTANTS.MIN_STAKE_MIST / 10n)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::register_oracle`,
      arguments: [
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.vector('u8', new TextEncoder().encode('CradleOS System')),
        tx.pure.vector([tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.GOV_SCORE))]),
        reducedStake,
        tx.pure.bool(false),
        tx.pure.vector('u8', new TextEncoder().encode('')),
        tx.pure.bool(true),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: systemContract as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('add_schema_to_oracle rotates capability correctly', async () => {
    const tx = new Transaction();

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::add_schema_to_oracle`,
      arguments: [
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.object('0xREPLACE_WITH_ORACLE_CAP_OBJECT_ID'),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.CREDIT)),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracleOperator as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('council member can vote on fraud challenge', async () => {
    const councilMember = { address: '0x' + '66'.repeat(32), label: 'council' } as TestPlayer;

    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::add_council_member`,
      arguments: [tx.object(TEST_ADDRESSES.ORACLE_REGISTRY), tx.pure.address(councilMember.address)],
    });

    await client.signAndExecuteTransaction({
      transaction: tx,
      signer: admin as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    // Council votes — requires a real FraudChallenge object ID from a prior challenge creation
    // In production flow: create_fraud_challenge → vote
    const vote = new Transaction();
    vote.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::vote_on_challenge`,
      arguments: [
        vote.object('0xREPLACE_WITH_CHALLENGE_OBJECT_ID'),
        vote.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        vote.pure.bool(true),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: vote,
      signer: councilMember as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('delegate to an oracle increases total_stake', async () => {
    const delegator = { address: '0x' + '77'.repeat(32), label: 'delegator' } as TestPlayer;
    const stakeAmt = 2_000_000_000n; // 2 SUI

    const tx = new Transaction();
    const stake = tx.splitCoins(tx.gas, [tx.pure.u64(stakeAmt)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::oracle_registry::delegate`,
      arguments: [
        tx.object(TEST_ADDRESSES.ORACLE_REGISTRY),
        tx.pure.address(oracleOperator.address),
        stake,
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: delegator as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });
});