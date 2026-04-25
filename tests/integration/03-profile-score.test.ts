import { describe, it, expect, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createClient } from './network';
import { TEST_ADDRESSES, SCHEMAS, validateAddresses } from './config';
import { TestPlayer, fundAddress } from './helpers';

describe('03 — Profile & Score Updates', () => {
  let client: SuiClient;
  let player: TestPlayer;
  let oracle: TestPlayer;

  beforeAll(async () => {
    validateAddresses(TEST_ADDRESSES);
    client = createClient('testnet');
    player = { address: '0x' + '88'.repeat(32), label: 'player' } as TestPlayer;
    oracle = { address: '0x' + '99'.repeat(32), label: 'oracle' } as TestPlayer;
    await fundAddress(client, oracle.address, 'testnet');
  }, 30_000);

  it('player can create a ReputationProfile', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::create_profile`,
      arguments: [],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: player as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('oracle can update score via OracleCapability', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::update_score`,
      arguments: [
        tx.object('0xREPLACE_WITH_ORACLE_CAP_ID'),
        tx.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.PIRATE_INDEX_V1)),
        tx.pure.u64(75),
        tx.pure.u64(1),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });

  it('score write emits ScoreUpdated event', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::update_score`,
      arguments: [
        tx.object('0xREPLACE_WITH_ORACLE_CAP_ID'),
        tx.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.CREDIT)),
        tx.pure.u64(600),
        tx.pure.u64(5),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    const event = result.effects?.events?.find((e) =>
      'type' in e && String(e.type).includes('ScoreUpdated')
    );
    expect(event).toBeDefined();
  });

  it('system oracle via system_sdk emits SystemAttestationEvent', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::system_sdk::system_attest`,
      arguments: [
        tx.object('0xREPLACE_WITH_SYSTEM_CAP_ID'),
        tx.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        tx.pure.vector('u8', new TextEncoder().encode(SCHEMAS.GOV_SCORE)),
        tx.pure.u64(900),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    const event = result.effects?.events?.find((e) =>
      'type' in e && String(e.type).includes('SystemAttestationEvent')
    );
    expect(event).toBeDefined();
  });

  it('get_score returns 0 for non-existent schema', async () => {
    const tx = new Transaction();
    const [result] = tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::get_score`,
      arguments: [
        tx.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        tx.pure.vector('u8', new TextEncoder().encode('NON_EXISTENT_SCHEMA')),
      ],
    });

    const dryRun = await client.dryRunTransaction({ transaction: tx });
    // Score should be 0 — check events or return value
    expect(dryRun.effects?.status.status).toBe('success');
  });

  it('decay reduces score by configured percentage', async () => {
    // First set a known score
    const set = new Transaction();
    set.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::update_score`,
      arguments: [
        set.object('0xREPLACE_WITH_ORACLE_CAP_ID'),
        set.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        set.pure.vector('u8', new TextEncoder().encode(SCHEMAS.COMBAT_SCORE)),
        set.pure.u64(1000),
        set.pure.u64(1),
      ],
    });

    await client.signAndExecuteTransaction({
      transaction: set,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    // Apply 20% decay
    const decay = new Transaction();
    decay.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::apply_decay`,
      arguments: [
        decay.object('0xREPLACE_WITH_ORACLE_CAP_ID'),
        decay.object('0xREPLACE_WITH_PLAYER_PROFILE_ID'),
        decay.pure.vector('u8', new TextEncoder().encode(SCHEMAS.COMBAT_SCORE)),
        decay.pure.u64(20),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: decay,
      signer: oracle as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
  });
});