// sui-tx-object-ref.ts — Resolve Sui object refs for tx builders.
//
// Mode-switched: uses fetchSuiObjectRaw (jsonrpc/graphql/shadow) under the
// hood. Replaces direct SuiJsonRpcClient.getObject() calls in tx-*.ts files.
// getCoins/selectPaymentCoin stays in makeSuiJsonRpcClient for now.
//
// The valibot constraint is preserved: these are standalone pre-fetches,
// never wired into tx.build(). See tx-check-passage.ts header comment.

import { fetchSuiObjectRaw } from './sui-object-fetcher';
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
