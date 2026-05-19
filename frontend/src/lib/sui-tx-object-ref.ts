// sui-tx-object-ref.ts — Resolve Sui object refs for tx builders.
//
// Mode-switched: uses fetchSuiObjectRaw (jsonrpc/graphql/shadow) under the
// hood. Replaces direct SuiJsonRpcClient.getObject() calls in tx-*.ts files.
// Replaces makeSuiJsonRpcClient — all tx builders use these helpers.
//
// The valibot constraint is preserved: these are standalone pre-fetches,
// never wired into tx.build(). See tx-check-passage.ts header comment.

import { fetchSuiObjectRaw, fetchOwnedObjectsByType } from './sui-object-fetcher';
import type { SuiObjectData } from './sui-object-fetcher';
import { recordTxClient } from './sui-fetcher-telemetry';

// ── Public types ─────────────────────────────────────────────────────────────

/** Minimal object ref data needed by tx builders for Inputs.ObjectRef / SharedObjectRef. */
export interface ObjectRefData {
  objectId: string;
  version: string;
  digest: string;
  /** JSON-RPC-compatible owner shape (AddressOwner / Shared / etc). */
  owner: unknown;
}

// ── resolveObjectRef ─────────────────────────────────────────────────────────

/**
 * Fetch a single object's ref data (version, digest, owner) via the current
 * object-fetcher mode (jsonrpc / graphql / shadow).
 *
 * Throws if the object is not found or missing version/digest.
 * Records a tx-client telemetry event for backward-compatible counters.
 */
export async function resolveObjectRef(
  objectId: string,
  label: string,
): Promise<ObjectRefData> {
  const start = Date.now();
  try {
    const data = await fetchSuiObjectRaw(objectId);
    if (!data?.version || !data.digest) {
      throw new Error(`${label}: object ${objectId} not found or missing version/digest`);
    }
    const ref: ObjectRefData = {
      objectId: data.objectId ?? objectId,
      version: String(data.version),
      digest: String(data.digest),
      owner: data.owner ?? null,
    };
    recordTxClient({
      ts: Date.now(), label, event: 'method_call',
      method: 'getObject', durationMs: Date.now() - start, ok: true,
    });
    return ref;
  } catch (err) {
    recordTxClient({
      ts: Date.now(), label, event: 'method_call',
      method: 'getObject', durationMs: Date.now() - start, ok: false,
      errorClass: err instanceof Error ? err.name : 'unknown',
    });
    throw err;
  }
}

// ── extractSharedVersion ─────────────────────────────────────────────────────

/**
 * Extract `initial_shared_version` from a JSON-RPC-compatible owner field.
 * Works with both JSON-RPC and GraphQL-mapped owner shapes.
 *
 * Throws if the object is not shared or the version is invalid.
 */
export function extractSharedVersion(owner: unknown, label: string): number {
  if (typeof owner === 'object' && owner !== null && 'Shared' in owner) {
    const shared = (owner as { Shared: { initial_shared_version: string | number } }).Shared;
    const v = Number(shared.initial_shared_version);
    if (Number.isFinite(v) && v > 0) return v;
  }
  throw new Error(`${label}: object is not shared or initial_shared_version not found`);
}

// ── resolvePaymentCoin ───────────────────────────────────────────────────────

/** Resolved payment coin ref for tx builders. */
export interface PaymentCoinRef {
  objectId: string;
  version: string;
  digest: string;
  balance: bigint;
}

const SUI_COIN_TYPE = '0x2::coin::Coin<0x2::sui::SUI>';

/**
 * Select a SUI coin owned by `owner` with at least `minBalance` MIST.
 * Uses fetchOwnedObjectsByType (mode-switched: jsonrpc/graphql/shadow).
 *
 * Selection strategy (matches prior selectPaymentCoin):
 *   sort ascending by balance → pick the smallest coin >= minBalance.
 *
 * Throws if no coin meets the minimum balance requirement.
 */
export async function resolvePaymentCoin(
  owner: string,
  minBalance: bigint,
  label: string,
): Promise<PaymentCoinRef> {
  const start = Date.now();
  try {
    const objects = await fetchOwnedObjectsByType(owner, SUI_COIN_TYPE);

    const coins: PaymentCoinRef[] = [];
    for (const obj of objects) {
      if (!obj.objectId || !obj.version || !obj.digest) continue;
      const balance = extractCoinBalance(obj);
      if (balance === null) continue;
      coins.push({
        objectId: obj.objectId,
        version: String(obj.version),
        digest: String(obj.digest),
        balance,
      });
    }

    // Sort ascending by balance, pick smallest coin that satisfies minBalance.
    coins.sort((a, b) => Number(a.balance - b.balance));
    const selected = coins.find(c => c.balance >= minBalance);

    if (!selected) {
      throw new Error(`No traveler-owned SUI coin has at least ${minBalance} MIST.`);
    }

    recordTxClient({
      ts: Date.now(), label, event: 'method_call',
      method: 'getCoins', durationMs: Date.now() - start, ok: true,
    });
    return selected;
  } catch (err) {
    recordTxClient({
      ts: Date.now(), label, event: 'method_call',
      method: 'getCoins', durationMs: Date.now() - start, ok: false,
      errorClass: err instanceof Error ? err.name : 'unknown',
    });
    throw err;
  }
}

/** Extract balance from a SUI coin's content.fields (works with both JSON-RPC and GraphQL shapes). */
function extractCoinBalance(obj: SuiObjectData): bigint | null {
  const fields = obj.content?.fields;
  if (!fields || typeof fields !== 'object') return null;
  const balance = (fields as Record<string, unknown>).balance;
  if (typeof balance === 'string' || typeof balance === 'number') {
    try { return BigInt(balance); } catch { return null; }
  }
  return null;
}
