import { createHash } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';

// In @mysten/sui v1 the keypair is the signer — no separate RawSigner type.
export interface TestPlayer {
  keypair: Ed25519Keypair;
  address: string;
  label: string;
}

/**
 * Deterministic test keypair derived from sha256(label:index).
 * DO NOT use in production — test wallets only.
 */
export function deriveTestPlayer(label: string, index: number): TestPlayer {
  const seed = createHash('sha256').update(`${label}:${index}`).digest();
  const keypair = Ed25519Keypair.fromSecretKey(seed);
  const address = keypair.getPublicKey().toSuiAddress();
  return { keypair, address, label };
}

/**
 * Funds a test address from the faucet on testnet.
 */
export async function fundAddress(
  client: SuiClient,
  address: string,
  network: 'testnet' | 'local'
): Promise<void> {
  const config = network === 'testnet'
    ? { name: 'testnet', fullnode: 'https://fullnode.testnet.sui.io:443', faucet: 'https://faucet.testnet.sui.io/gas' }
    : { name: 'local', fullnode: 'http://0.0.0.0:9184' };

  if (config.faucet) {
    await fetch(config.faucet, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
  }
}

export function prettyLog(label: string, obj: unknown): void {
  console.log(`\n[${label}]`, JSON.stringify(obj, null, 2));
}
