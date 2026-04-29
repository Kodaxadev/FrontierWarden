/**
 * oracle-actions.ts — PTB builders for oracle-signed operations.
 *
 * These transactions are submitted DIRECTLY by the oracle key (not sponsored).
 * The oracle signs as both sender and gas payer.
 *
 * Single responsibility: oracle PTB construction.
 * HTTP transport lives in gas-station.ts; key loading in gas-sponsor.ts.
 */
import { Transaction } from '@mysten/sui/transactions';
import {
  PKG,
  SCHEMA_REGISTRY_ID, SCHEMA_REGISTRY_VERSION,
  ORACLE_REGISTRY_ID, ORACLE_REGISTRY_VERSION,
} from './seed-config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeStr(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

// ---------------------------------------------------------------------------
// issue_attestation
// ---------------------------------------------------------------------------

export interface IssueAttestationArgs {
  /** Oracle address (sender). */
  sender: string;
  /** Registered schema ID (oracle must be authorized). */
  schemaId: string;
  /** Subject address — the Attestation object is transferred here. */
  subject: string;
  /** Score/value for this schema (u64). */
  value: bigint;
  /** How many epochs until expiry. */
  expirationEpochs: bigint;
}

/**
 * Build a PTB that issues one attestation and transfers it to the subject.
 * attestation::issue is a public fun (not entry) that returns Attestation;
 * we must transferObjects the result.
 *
 * Caller must setGasBudget and sign with the oracle keypair before submitting.
 */
export function buildIssueAttestationTx(args: IssueAttestationArgs): Transaction {
  const tx = new Transaction();
  tx.setSender(args.sender);

  const schemaReg = tx.sharedObjectRef({
    objectId:             SCHEMA_REGISTRY_ID,
    initialSharedVersion: SCHEMA_REGISTRY_VERSION,
    mutable:              false,
  });
  const oracleReg = tx.sharedObjectRef({
    objectId:             ORACLE_REGISTRY_ID,
    initialSharedVersion: ORACLE_REGISTRY_VERSION,
    mutable:              false,
  });

  const attest = tx.moveCall({
    target: `${PKG}::attestation::issue`,
    arguments: [
      schemaReg,
      oracleReg,
      tx.pure.vector('u8', encodeStr(args.schemaId)),
      tx.pure.address(args.subject),
      tx.pure.u64(args.value),
      tx.pure.u64(args.expirationEpochs),
    ],
  });

  // attestation::issue returns Attestation (not transferred automatically)
  tx.transferObjects([attest], args.subject);

  return tx;
}
