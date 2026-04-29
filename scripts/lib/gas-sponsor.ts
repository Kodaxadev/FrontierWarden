/**
 * gas-sponsor.ts — Sui sponsored transaction builder.
 *
 * Responsibilities:
 *   - Load sponsor keypair from SPONSOR_PRIVATE_KEY env or active Sui CLI key
 *   - Accept tx kind bytes (base64) + sender + optional gas budget
 *   - Attach gas payment from sponsor's coin objects
 *   - Build and sign the transaction as sponsor
 *   - Return serialized tx bytes + sponsor signature for client co-signing
 *
 * Sponsored tx flow:
 *   Client → kind bytes → gas station → sets gas owner/payment → signs →
 *   returns (txBytes, sponsorSig) → client signs → execute with both sigs
 *
 * Single responsibility: Sui gas sponsorship. No HTTP here.
 */
import { SuiClient }            from '@mysten/sui/client';
import { Ed25519Keypair }        from '@mysten/sui/keypairs/ed25519';
import { Transaction }           from '@mysten/sui/transactions';
import { decodeSuiPrivateKey }   from '@mysten/sui/cryptography';
import { fromBase64, toBase64 }  from '@mysten/sui/utils';
import { loadKeypair }           from './seed-wallet.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const SUI_COIN = '0x2::sui::SUI';

/** Default gas budget (MIST). Callers may override per-request. */
const DEFAULT_GAS_BUDGET = BigInt(
  (process.env.DEFAULT_GAS_BUDGET ?? '50000000').replace(/_/g, ''),
);

/** Safety cap — we never sponsor beyond this regardless of client request. */
const MAX_GAS_BUDGET = BigInt(
  (process.env.MAX_GAS_BUDGET ?? '200000000').replace(/_/g, ''),
);

// ---------------------------------------------------------------------------
// Keypair loading
// ---------------------------------------------------------------------------

export function loadSponsorKeypair(): Ed25519Keypair {
  const raw = process.env.SPONSOR_PRIVATE_KEY ?? process.env.SPONSOR_KEYPAIR;
  if (!raw) return loadKeypair();

  const { schema, secretKey } = decodeSuiPrivateKey(raw);
  if (schema !== 'ED25519') {
    throw new Error(`Sponsor key must be an Ed25519 key, got: ${schema}`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// ---------------------------------------------------------------------------
// Request / response types (shared with gas-station.ts via import)
// ---------------------------------------------------------------------------

export interface SponsorRequest {
  /** Base64-encoded transaction kind bytes (build({ onlyTransactionKind: true })). */
  txKindBytes: string;
  /** Sender address (0x-prefixed hex, 32 bytes). */
  sender: string;
  /** Optional gas budget override in MIST. Capped at MAX_GAS_BUDGET. */
  gasBudget?: number | string;
}

export interface SponsorResponse {
  /** Base64-encoded full transaction bytes ready for client signature. */
  txBytes: string;
  /** Sponsor's bech64 signature over txBytes. */
  sponsorSignature: string;
}

// ---------------------------------------------------------------------------
// Core sponsorship function
// ---------------------------------------------------------------------------

export async function sponsorTransaction(
  req: SponsorRequest,
): Promise<SponsorResponse> {
  const keypair = loadSponsorKeypair();
  const client  = new SuiClient({ url: RPC_URL });
  const sponsor = keypair.toSuiAddress();

  // Clamp gas budget to safety cap
  const requested  = req.gasBudget ? BigInt(req.gasBudget) : DEFAULT_GAS_BUDGET;
  const gasBudget  = requested > MAX_GAS_BUDGET ? MAX_GAS_BUDGET : requested;

  // Fetch sponsor's SUI coins for gas payment
  const { data: coins } = await client.getCoins({
    owner:    sponsor,
    coinType: SUI_COIN,
    limit:    5,
  });

  if (coins.length === 0) {
    throw new Error(
      `Sponsor wallet ${sponsor} has no SUI coins for ${RPC_URL}. ` +
      'Fund it from the matching Sui faucet.',
    );
  }

  // CoinStruct → ObjectRef (objectId / version / digest)
  const gasPayment = coins.map(coin => ({
    objectId: coin.coinObjectId,
    version:  coin.version,
    digest:   coin.digest,
  }));

  // Reconstruct full Transaction from kind-only bytes
  const kindBytes = fromBase64(req.txKindBytes);
  const tx        = Transaction.fromKind(kindBytes);

  tx.setSender(req.sender);
  tx.setGasOwner(sponsor);
  tx.setGasPayment(gasPayment);
  tx.setGasBudget(gasBudget);

  // Build serializes the PTB into BCS bytes for signing
  const built = await tx.build({ client });

  // Sponsor signs — client must co-sign before executeTransactionBlock
  const { signature } = await keypair.signTransaction(built);

  return {
    txBytes:          toBase64(built),
    sponsorSignature: signature,
  };
}
