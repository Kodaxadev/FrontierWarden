/**
 * seed-wallet.ts — Keypair loading, SuiClient factory, TX execution wrapper.
 *
 * Key loading priority:
 *   1. DEPLOYER_KEY env var (suiprivkey1... format)
 *   2. SUI_PRIVATE_KEY env var (same format, legacy compat)
 *   3. ~/.sui/sui_config/sui.keystore (first entry, Ed25519 only)
 *
 * Single responsibility: wallet/client utilities. No PTB construction here.
 */
import { readFileSync } from 'node:fs';
import { homedir }      from 'node:os';
import { resolve }      from 'node:path';
import { SuiClient }    from '@mysten/sui/client';
import { Ed25519Keypair }         from '@mysten/sui/keypairs/ed25519';
import { Transaction }            from '@mysten/sui/transactions';
import { decodeSuiPrivateKey }    from '@mysten/sui/cryptography';
import { RPC_URL, GAS_BUDGET }    from './seed-config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of objectChanges we care about for ID extraction. */
export interface ObjectChange {
  type: string;
  objectId: string;
  objectType?: string;
}

export interface TxResult {
  digest: string;
  objectChanges: ObjectChange[];
}

// ---------------------------------------------------------------------------
// Keypair
// ---------------------------------------------------------------------------

export function loadKeypair(): Ed25519Keypair {
  const raw = process.env.DEPLOYER_KEY ?? process.env.SUI_PRIVATE_KEY;

  if (raw) {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== 'ED25519') {
      throw new Error(`Key schema must be ED25519, got: ${schema}`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Fall back to local Sui keystore (first entry).
  // Keystore format: base64(flag_byte || secret_key_32_bytes).
  // flag 0 = ED25519, 1 = Secp256k1, 2 = Secp256r1.
  // This is different from the bech32 suiprivkey1... format — do NOT use
  // decodeSuiPrivateKey here; it only handles bech32 input.
  const keystorePath = resolve(homedir(), '.sui', 'sui_config', 'sui.keystore');
  try {
    const entries = JSON.parse(readFileSync(keystorePath, 'utf8')) as string[];
    if (entries.length === 0) throw new Error('Keystore is empty');
    const raw = Buffer.from(entries[0], 'base64');
    const flag = raw[0];
    if (flag !== 0) {
      throw new Error(
        `Keystore first entry has key scheme flag ${flag} (expected 0 for ED25519). ` +
        'Set DEPLOYER_KEY=suiprivkey1... with an Ed25519 key instead.',
      );
    }
    const secretKey = raw.subarray(1); // bytes 1-32 = 32-byte Ed25519 secret
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch (err) {
    throw new Error(
      'No DEPLOYER_KEY env var set and keystore load failed: ' +
      `${(err as Error).message}. ` +
      'Set DEPLOYER_KEY=suiprivkey1... or ensure ~/.sui/sui_config/sui.keystore exists.',
    );
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function makeClient(): SuiClient {
  return new SuiClient({ url: RPC_URL });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function execute(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
  label: string,
): Promise<TxResult> {
  tx.setGasBudget(GAS_BUDGET);

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status.status !== 'success') {
    throw new Error(`[${label}] TX failed: ${result.effects?.status.error}`);
  }

  console.log(`  ✓ digest: ${result.digest}`);
  return {
    digest: result.digest,
    objectChanges: (result.objectChanges ?? []) as ObjectChange[],
  };
}

// ---------------------------------------------------------------------------
// Object ID helpers
// ---------------------------------------------------------------------------

/** Find the objectId of a freshly created object whose type contains typeFragment. */
export function findCreatedObject(
  changes: ObjectChange[],
  typeFragment: string,
): string {
  const found = changes.find(
    c => c.type === 'created' && c.objectType?.includes(typeFragment),
  );
  if (!found) {
    const types = changes
      .filter(c => c.type === 'created')
      .map(c => c.objectType ?? '(no type)')
      .join(', ');
    throw new Error(
      `Expected created object with type fragment "${typeFragment}" — ` +
      `not found in TX changes. Created types: ${types}`,
    );
  }
  return found.objectId;
}
