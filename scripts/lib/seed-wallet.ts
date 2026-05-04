/**
 * seed-wallet.ts — Keypair loading, SuiJsonRpcClient factory, TX execution wrapper.
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
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
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
    const { scheme, secretKey } = decodeSuiPrivateKey(raw);
    if (scheme !== 'ED25519') {
      throw new Error(`Key schema must be ED25519, got: ${scheme}`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Fall back to local Sui keystore, preferring the active_address in client.yaml.
  // Keystore format: base64(flag_byte || secret_key_32_bytes).
  // flag 0 = ED25519, 1 = Secp256k1, 2 = Secp256r1.
  // This is different from the bech32 suiprivkey1... format — do NOT use
  // decodeSuiPrivateKey here; it only handles bech32 input.
  const suiConfigDir = resolve(homedir(), '.sui', 'sui_config');
  const keystorePath = resolve(suiConfigDir, 'sui.keystore');
  const clientConfigPath = resolve(suiConfigDir, 'client.yaml');
  try {
    const entries = JSON.parse(readFileSync(keystorePath, 'utf8')) as string[];
    if (entries.length === 0) throw new Error('Keystore is empty');

    const activeAddress = readActiveAddress(clientConfigPath);
    let firstEd25519: Ed25519Keypair | null = null;

    for (const entry of entries) {
      const raw = Buffer.from(entry, 'base64');
      const flag = raw[0];
      if (flag !== 0) continue;

      const keypair = Ed25519Keypair.fromSecretKey(raw.subarray(1));
      firstEd25519 ??= keypair;

      if (activeAddress && keypair.getPublicKey().toSuiAddress() === activeAddress) {
        return keypair;
      }
    }

    if (activeAddress) {
      throw new Error(`Active address ${activeAddress} was not found as an Ed25519 key in sui.keystore`);
    }
    if (!firstEd25519) {
      throw new Error('No Ed25519 entries found in sui.keystore');
    }
    return firstEd25519;
  } catch (err) {
    throw new Error(
      'No DEPLOYER_KEY env var set and keystore load failed: ' +
      `${(err as Error).message}. ` +
      'Set DEPLOYER_KEY=suiprivkey1... or ensure ~/.sui/sui_config/sui.keystore exists.',
    );
  }
}

function readActiveAddress(clientConfigPath: string): string | null {
  try {
    const yaml = readFileSync(clientConfigPath, 'utf8');
    const match = yaml.match(/active_address:\s*"?([^"\r\n]+)"?/);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function makeClient(): SuiJsonRpcClient {
  const network = (process.env.SUI_NETWORK ?? 'testnet') as 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  return new SuiJsonRpcClient({ url: RPC_URL, network });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function execute(
  client: SuiJsonRpcClient,
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
