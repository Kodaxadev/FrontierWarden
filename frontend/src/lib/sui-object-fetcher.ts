// sui-object-fetcher.ts — Adapter layer: all Sui JSON-RPC construction, object
// resolution, and owned-object listing lives here. No other file should build
// raw RPC fetch calls or construct a SuiJsonRpcClient directly.
//
// Two fetch paths share the same URL source:
//   1. SuiJsonRpcClient — used by tx builders for .getObject() / .getCoins()
//   2. Raw fetch — used by operator-gate-authority.ts for suix_getOwnedObjects /
//      sui_getObject with custom wire shapes
//
// TODO: Both paths are GraphQL cutover points (~Jul 2026).
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md, Phase 2.

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

type SuiNetworkType = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function suiNetwork(): SuiNetworkType {
  return ((import.meta.env.VITE_SUI_NETWORK as string | undefined) ?? 'testnet') as SuiNetworkType;
}

// Returns the Sui RPC URL for the current network.
// VITE_SUI_RPC_URL overrides if set (for custom endpoints or local nodes).
// TODO: Remove when GraphQL migration is complete.
export function suiRpcUrl(): string {
  const override = (import.meta.env as Record<string, string | undefined>).VITE_SUI_RPC_URL;
  return override ?? getJsonRpcFullnodeUrl(suiNetwork());
}

// Returns a SuiJsonRpcClient for object and coin pre-resolution.
// Must NOT be passed into tx.build() — see tx-check-passage.ts for the constraint.
// TODO: Replace with GraphQL client at Phase 2 cutover.
export function makeSuiJsonRpcClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: suiRpcUrl(),
    network: suiNetwork(),
  });
}

// ── Raw JSON-RPC wire types ───────────────────────────────────────────────────
// Shared with operator-gate-authority.ts parsers. Exported so consumers do not
// need to redeclare them. Shapes match Sui JSON-RPC 2.0 responses.

export interface SuiObjectData {
  objectId?: string;
  type?: string;
  owner?: unknown;
  content?: { fields?: unknown };
}

interface SuiObjectEnvelope {
  data?: SuiObjectData;
}

interface SuiOwnedObjectsPage {
  data?: SuiObjectEnvelope[];
  nextCursor?: string | null;
  hasNextPage?: boolean;
}

interface JsonRpcEnvelope<T> {
  result?: T;
  error?: { message?: string; code?: number };
}

// Internal raw JSON-RPC fetch. Uses suiRpcUrl() so URL derivation is centralised.
// TODO: Replace body of this function with GraphQL fetch at Phase 2 cutover.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md.
async function suiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(suiRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`Sui RPC ${method} -> ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as JsonRpcEnvelope<T>;
  if (body.error) throw new Error(body.error.message ?? `Sui RPC ${method} failed`);
  return body.result as T;
}

// Fetch all owned objects of a specific struct type, paginating automatically.
// TODO: Replace with GraphQL address.objects filter at Phase 2 cutover.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md.
export async function fetchOwnedObjectsByType(
  owner: string,
  type: string,
): Promise<SuiObjectData[]> {
  const objects: SuiObjectData[] = [];
  let cursor: string | null = null;
  do {
    const page: SuiOwnedObjectsPage = await suiRpc<SuiOwnedObjectsPage>('suix_getOwnedObjects', [
      owner,
      {
        filter: { StructType: type },
        options: { showContent: true, showOwner: true, showType: true },
      },
      cursor,
      50,
    ]);
    objects.push(...((page.data ?? []).map((e: SuiObjectEnvelope) => e.data).filter(Boolean) as SuiObjectData[]));
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);
  return objects;
}

// Fetch a single object by ID with content, owner, and type fields populated.
// TODO: Replace with GraphQL object query at Phase 2 cutover.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md.
export async function fetchSuiObjectRaw(objectId: string): Promise<SuiObjectData | null> {
  const envelope = await suiRpc<SuiObjectEnvelope>('sui_getObject', [
    objectId,
    { showContent: true, showOwner: true, showType: true },
  ]);
  return envelope.data ?? null;
}
