import { Ed25519Keypair, RawSigner } from '@mysten/sui/keypair/ed25519';
import { SuiClient } from '@mysten/sui/client';

export interface TestPlayer {
  keypair: Ed25519Keypair;
  signer: RawSigner;
  address: string;
  label: string;
}

/**
 * Derives a test keypair from a mnemonic for local testing.
 * DO NOT use in production — test wallets only.
 */
export function deriveTestPlayer(label: string, index: number): TestPlayer {
  // Deterministic test seed: label + index ensures unique keys per test
  const seed = new TextEncoder().encode(`${label}:${index}`);
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(seed.buffer) as unknown as Uint8Array
  );
  const address = keypair.getPublicKey().toSuiAddress();
  return { keypair, address, label } as unknown as TestPlayer;
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