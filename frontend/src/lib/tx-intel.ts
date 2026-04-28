// tx-intel.ts -- Build attestation PTB kind bytes (no gas envelope).
//
// Produces a base64-encoded TransactionKind that can be passed to the gas
// station for sponsorship. All shared objects are referenced by their stable
// devnet IDs; the full tx envelope (gas coin, sponsor sig) is added by the
// gas station before the user signs.
//
// Single responsibility: PTB construction only. No network calls, no hooks.

import { Transaction } from '@mysten/sui/transactions';
import { toBase64 }     from '@mysten/bcs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttestSchema =
  | 'GATE_HOSTILE'
  | 'GATE_CAMPED'
  | 'GATE_CLEAR'
  | 'GATE_TOLL'
  | 'HEAT_TRAP'
  | 'ROUTE_VERIFIED'
  | 'SYSTEM_CONTESTED'
  | 'SHIP_KILL'
  | 'PLAYER_BOUNTY';

export interface BuildAttestArgs {
  /** Sui address of the oracle submitting the attestation */
  sender:  string;
  /** Schema identifier string (e.g. "GATE_HOSTILE") */
  schema:  AttestSchema;
  /** Sui address being attested (the gate/system/player) */
  subject: string;
  /** Numeric value for the attestation (u64) */
  value:   bigint;
  /** Epochs until expiration -- defaults to 7 (approx 1 week on devnet) */
  expirationEpochs?: bigint;
}

// ---------------------------------------------------------------------------
// Shared object refs (populated from Vite env at module load time)
// ---------------------------------------------------------------------------

function requiredEnv(key: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  if (!v) throw new Error(`tx-intel: missing env var ${key}`);
  return v;
}

function sharedRef(idKey: string, versionKey: string) {
  return {
    objectId:       requiredEnv(idKey),
    initialSharedVersion: Number(requiredEnv(versionKey)),
    mutable:        false,
  } as const;
}

// ---------------------------------------------------------------------------
// buildAttestTxKind
//
// Returns a base64-encoded BCS TransactionKind (not a full TransactionData).
// The gas station wraps this into a SponsoredTransaction envelope.
// ---------------------------------------------------------------------------

export async function buildAttestTxKind(args: BuildAttestArgs): Promise<string> {
  const {
    sender,
    schema,
    subject,
    value,
    expirationEpochs = 7n,
  } = args;

  const tx = new Transaction();
  tx.setSender(sender);

  const schemaRegistryRef = sharedRef(
    'VITE_SCHEMA_REGISTRY_ID',
    'VITE_SCHEMA_REGISTRY_VERSION',
  );
  const oracleRegistryRef = sharedRef(
    'VITE_ORACLE_REGISTRY_ID',
    'VITE_ORACLE_REGISTRY_VERSION',
  );

  const pkg = requiredEnv('VITE_PKG_ID');

  // schema_id is vector<u8> in Move -- UTF-8 bytes of the schema string
  const schemaBytes = new TextEncoder().encode(schema);

  const attestation = tx.moveCall({
    target:    `${pkg}::attestation::issue`,
    arguments: [
      tx.sharedObjectRef(schemaRegistryRef),
      tx.sharedObjectRef(oracleRegistryRef),
      tx.pure.vector('u8', Array.from(schemaBytes)),
      tx.pure.address(subject),
      tx.pure.u64(value),
      tx.pure.u64(expirationEpochs),
    ],
  });

  // Transfer the returned Attestation object to the subject
  tx.transferObjects([attestation], subject);

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
