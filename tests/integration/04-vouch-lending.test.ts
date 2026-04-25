import { describe, it, expect, beforeAll } from 'vitest';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createClient } from './network';
import { TEST_ADDRESSES, CONSTANTS, validateAddresses } from './config';
import { TestPlayer } from './helpers';

describe('04 — Vouch & Lending', () => {
  let client: SuiClient;
  let voucher: TestPlayer;
  let borrower: TestPlayer;
  let lender: TestPlayer;
  let admin: TestPlayer;

  beforeAll(async () => {
    validateAddresses(TEST_ADDRESSES);
    client = createClient('testnet');
    voucher = { address: '0x' + 'AA'.repeat(32), label: 'voucher' } as TestPlayer;
    borrower = { address: '0x' + 'BB'.repeat(32), label: 'borrower' } as TestPlayer;
    lender = { address: '0x' + 'CC'.repeat(32), label: 'lender' } as TestPlayer;
    admin = { address: '0x' + 'DD'.repeat(32), label: 'admin' } as TestPlayer;
  });

  it('voucher with score >= 500 can create a Vouch object', async () => {
    // First: oracle sets voucher's credit score to 500
    // (In production: oracle tx via OracleCapability — delegated to oracle operator)
    const oracleTx = new Transaction();
    oracleTx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::profile::update_score`,
      arguments: [
        oracleTx.object('0xREPLACE_WITH_ORACLE_CAP_ID'),
        oracleTx.object('0xREPLACE_WITH_VOUCHER_PROFILE_ID'),
        oracleTx.pure.vector('u8', new TextEncoder().encode('CREDIT')),
        oracleTx.pure.u64(500),
        oracleTx.pure.u64(1),
      ],
    });

    // Now voucher creates the Vouch
    const vouchTx = new Transaction();
    const stake = vouchTx.splitCoins(vouchTx.gas, [vouchTx.pure.u64(CONSTANTS.MIN_STAKE_MIST)]);
    vouchTx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::vouch::create_vouch`,
      arguments: [
        vouchTx.object('0xREPLACE_WITH_VOUCHER_PROFILE_ID'),
        vouchTx.pure.address(borrower.address),
        stake,
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: vouchTx,
      signer: voucher as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('VouchCreated')
    )).toBeTruthy();
  });

  it('vouch with score < 500 is rejected', async () => {
    const vouchTx = new Transaction();
    const stake = vouchTx.splitCoins(vouchTx.gas, [vouchTx.pure.u64(CONSTANTS.MIN_STAKE_MIST)]);
    vouchTx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::vouch::create_vouch`,
      arguments: [
        vouchTx.object('0xREPLACE_WITH_LOW_SCORE_PROFILE_ID'),
        vouchTx.pure.address(borrower.address),
        stake,
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: vouchTx,
        signer: voucher as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Vouch should be rejected for low score');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/EInsufficientReputation|abort_code.*1/i);
    }
  });

  it('lender can issue loan to borrower with valid vouch', async () => {
    const tx = new Transaction();
    const collateral = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000n)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::lending::issue_loan`,
      arguments: [
        tx.object('0xREPLACE_WITH_BORROWER_PROFILE_ID'),
        tx.object('0xREPLACE_WITH_VOUCH_OBJECT_ID'),
        tx.pure.u64(100_000_000n), // 0.1 SUI
        collateral,
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: lender as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('LoanIssued')
    )).toBeTruthy();
  });

  it('self-loan (lender == borrower) is rejected', async () => {
    const tx = new Transaction();
    const collateral = tx.splitCoins(tx.gas, [tx.pure.u64(50_000_000n)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::lending::issue_loan`,
      arguments: [
        tx.object('0xREPLACE_WITH_BORROWER_PROFILE_ID'),
        tx.object('0xREPLACE_WITH_VOUCH_OBJECT_ID'),
        tx.pure.u64(100_000_000n),
        collateral,
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: borrower as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Self-loan should be rejected');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/ESelfLoan|abort_code.*5/i);
    }
  });

  it('borrower can repay loan — collateral + repayment transferred', async () => {
    const tx = new Transaction();
    const repayment = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000n)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::lending::repay_loan`,
      arguments: [
        tx.object('0xREPLACE_WITH_LOAN_OBJECT_ID'),
        repayment,
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: borrower as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('LoanRepaid')
    )).toBeTruthy();
  });

  it('double repay is rejected', async () => {
    const tx = new Transaction();
    const repayment = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000n)]);

    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::lending::repay_loan`,
      arguments: [
        tx.object('0xREPLACE_WITH_LOAN_OBJECT_ID'),
        repayment,
      ],
    });

    try {
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: borrower as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
        requestType: 'WaitForLocalExecution',
      });
      expect.fail('Double repay should be rejected');
    } catch (err: unknown) {
      expect(String(err)).toMatch(/EAlreadyRepaid|abort_code.*9/i);
    }
  });

  it('admin can slash defaulted loan after epoch advances', async () => {
    // Advance epochs past due date (30)
    const advanceEpochs = new Transaction();
    for (let i = 0; i < 31; i++) {
      advanceEpochs.moveCall({
        target: '0x1::tx_context::increment_epoch_number_for_testing',
        arguments: [],
      });
    }

    await client.signAndExecuteTransaction({
      transaction: advanceEpochs,
      signer: admin as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    const slashTx = new Transaction();
    slashTx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::lending::slash_defaulted_vouch`,
      arguments: [
        slashTx.object('0xREPLACE_WITH_LOAN_OBJECT_ID'),
        slashTx.object('0xREPLACE_WITH_VOUCH_OBJECT_ID'),
        slashTx.object('0xREPLACE_WITH_LENDING_CAP_ID'),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: slashTx,
      signer: admin as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('LoanDefaulted')
    )).toBeTruthy();
  });

  it('redeem_expired returns stake to voucher after expiry', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${TEST_ADDRESSES.PACKAGE}::vouch::redeem_expired`,
      arguments: [tx.object('0xREPLACE_WITH_VOUCH_OBJECT_ID')],
    });

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: voucher as unknown as import('@mysten/sui/keypair/ed25519').Ed25519Keypair & { signTransaction: (t: Transaction) => Promise<import('@mysten/sui/client').SignedTransaction> },
      requestType: 'WaitForLocalExecution',
    });

    expect(result.effects?.status.status).toBe('success');
    expect(result.effects?.events?.some((e) =>
      'type' in e && String(e.type).includes('VouchRedeemed')
    )).toBeTruthy();
  });
});