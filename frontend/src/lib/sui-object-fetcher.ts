// sui-object-fetcher.ts — Adapter for all Sui JSON-RPC object/owned reads.
// VITE_SUI_OBJECT_FETCHER_MODE=jsonrpc|graphql|shadow (default jsonrpc).
// Fetches + shadow + tx-client telemetry routed through sui-fetcher-telemetry.
// Inspect: window.__suiFetcherTelemetry.summary(). See SUI_JSON_RPC_DEPRECATION_SPIKE.md.
// tx.build() constraint: no client in tx.build(). See tx-check-passage.ts.

import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import {
  compareArray,
  compareObject,
  recordFetch,
  recordShadowError,
} from './sui-fetcher-telemetry';

// ── Network helpers ───────────────────────────────────────────────────────────

type SuiNetworkType = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function suiNetwork(): SuiNetworkType {
  return ((import.meta.env.VITE_SUI_NETWORK as string | undefined) ?? 'testnet') as SuiNetworkType;
}

// Sui JSON-RPC URL for current network; VITE_SUI_RPC_URL overrides if set.
export function suiRpcUrl(): string {
  const override = (import.meta.env as Record<string, string | undefined>).VITE_SUI_RPC_URL;
  return override ?? getJsonRpcFullnodeUrl(suiNetwork());
}

// ── SuiJsonRpcClient (removed) ───────────────────────────────────────────────
// makeSuiJsonRpcClient and instrumented proxy removed 2026-05-18.
// All tx builders now use resolveObjectRef / resolvePaymentCoin from
// sui-tx-object-ref.ts which routes through fetchSuiObjectRaw /
// fetchOwnedObjectsByType (mode-switched: jsonrpc/graphql/shadow).
// SuiJsonRpcClient import removed; getJsonRpcFullnodeUrl retained for suiRpcUrl().

// ── Raw JSON-RPC wire types (re-used by operator-gate-authority.ts parsers) ──
export interface SuiObjectData {
  objectId?: string;
  version?: string;
  digest?: string;
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

// ── JSON-RPC public helpers (current source of truth) ────────────────────────

// Fetch all owned objects of a struct type. Shadow/graphql mode routes via GraphQL.
export async function fetchOwnedObjectsByType(
  owner: string,
  type: string,
): Promise<SuiObjectData[]> {
  const mode = objectFetcherMode();
  const start = Date.now();
  if (mode === 'graphql') {
    try {
      const result = await fetchOwnedObjectsByTypeGraphQL(owner, type);
      recordFetch({ ts: Date.now(), kind: 'owned', mode, label: type, durationMs: Date.now() - start, resultCount: result.length, ok: true });
      return result;
    } catch (err) {
      recordFetch({ ts: Date.now(), kind: 'owned', mode, label: type, durationMs: Date.now() - start, resultCount: 0, ok: false });
      throw err;
    }
  }
  const objects: SuiObjectData[] = [];
  let cursor: string | null = null;
  try {
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
    recordFetch({ ts: Date.now(), kind: 'owned', mode, label: type, durationMs: Date.now() - start, resultCount: objects.length, ok: true });
  } catch (err) {
    recordFetch({ ts: Date.now(), kind: 'owned', mode, label: type, durationMs: Date.now() - start, resultCount: 0, ok: false });
    throw err;
  }

  if (mode === 'shadow') {
    const label = `fetchOwnedObjectsByType(${type})`;
    fetchOwnedObjectsByTypeGraphQL(owner, type)
      .then((gql) => compareArray(label, 'owned', objects, gql))
      .catch((err) => recordShadowError(label, 'owned', err));
  }

  return objects;
}

// Fetch a single object with content/owner/type. Shadow/graphql mode routes via GraphQL.
export async function fetchSuiObjectRaw(objectId: string): Promise<SuiObjectData | null> {
  const mode = objectFetcherMode();
  const start = Date.now();
  if (mode === 'graphql') {
    try {
      const result = await fetchSuiObjectGraphQL(objectId);
      recordFetch({ ts: Date.now(), kind: 'object', mode, label: objectId, durationMs: Date.now() - start, resultCount: result ? 1 : 0, ok: true });
      return result;
    } catch (err) {
      recordFetch({ ts: Date.now(), kind: 'object', mode, label: objectId, durationMs: Date.now() - start, resultCount: 0, ok: false });
      throw err;
    }
  }
  let result: SuiObjectData | null = null;
  try {
    const envelope = await suiRpc<SuiObjectEnvelope>('sui_getObject', [
      objectId,
      { showContent: true, showOwner: true, showType: true },
    ]);
    result = envelope.data ?? null;
    recordFetch({ ts: Date.now(), kind: 'object', mode, label: objectId, durationMs: Date.now() - start, resultCount: result ? 1 : 0, ok: true });
  } catch (err) {
    recordFetch({ ts: Date.now(), kind: 'object', mode, label: objectId, durationMs: Date.now() - start, resultCount: 0, ok: false });
    throw err;
  }

  if (mode === 'shadow') {
    const label = `fetchSuiObjectRaw(${objectId})`;
    const captured = result;
    fetchSuiObjectGraphQL(objectId)
      .then((gql) => compareObject(label, 'object', captured, gql))
      .catch((err) => recordShadowError(label, 'object', err));
  }

  return result;
}

// ── GraphQL config ────────────────────────────────────────────────────────────
// Phase 2 replacement path. Set VITE_SUI_OBJECT_FETCHER_MODE=graphql to activate.

// Mysten-hosted GraphQL endpoints per network.
const GQL_ENDPOINTS: Record<SuiNetworkType, string> = {
  mainnet:  'https://graphql.mainnet.sui.io/graphql',
  testnet:  'https://graphql.testnet.sui.io/graphql',
  devnet:   'https://graphql.devnet.sui.io/graphql',
  localnet: 'http://localhost:9125/graphql',
};

// Returns the Sui GraphQL URL for the current network.
// VITE_SUI_GRAPHQL_URL overrides if set (e.g. custom node, Utopia endpoint).
export function suiGraphqlUrl(): string {
  const override = (import.meta.env as Record<string, string | undefined>).VITE_SUI_GRAPHQL_URL;
  return override ?? (GQL_ENDPOINTS[suiNetwork()] ?? GQL_ENDPOINTS.testnet);
}

type ObjectFetcherMode = 'jsonrpc' | 'graphql' | 'shadow';

function objectFetcherMode(): ObjectFetcherMode {
  const env = (import.meta.env as Record<string, string | undefined>);
  const explicit = env.VITE_SUI_OBJECT_FETCHER_MODE as ObjectFetcherMode | undefined;
  if (explicit === 'graphql' || explicit === 'shadow') return explicit;
  if (import.meta.env.DEV && env.VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL === 'true') return 'shadow';
  return 'jsonrpc';
}

// ── GraphQL query strings ─────────────────────────────────────────────────────
// Shapes from SUI_JSON_RPC_DEPRECATION_SPIKE.md Phase 2. GetObject includes address+owner; owned nodes are MoveObjects.

const GQL_GET_OBJECT = `
  query GetObject($id: SuiAddress!) {
    object(address: $id) {
      address
      version
      digest
      asMoveObject {
        contents { json type { repr } }
      }
      owner {
        ... on AddressOwner { address { address } __typename }
        ... on ObjectOwner  { address { address } __typename }
        ... on Shared { initialSharedVersion __typename }
        ... on Immutable { __typename }
        ... on ConsensusAddressOwner { address { address } __typename }
      }
    }
  }
`;

// address.objects.nodes returns MoveObject[] — contents/owner are top-level,
// no asMoveObject cast (that's only on the generic Object type from GetObject).
const GQL_GET_OWNED_OBJECTS = `
  query OwnedObjects($owner: SuiAddress!, $type: String, $cursor: String) {
    address(address: $owner) {
      objects(filter: { type: $type }, after: $cursor, first: 50) {
        nodes {
          address
          version
          digest
          contents { json type { repr } }
          owner {
            ... on AddressOwner { address { address } __typename }
            ... on ObjectOwner  { address { address } __typename }
            ... on Shared { initialSharedVersion __typename }
            ... on Immutable { __typename }
            ... on ConsensusAddressOwner { address { address } __typename }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

// ── GraphQL wire types ────────────────────────────────────────────────────────

interface GqlObjectOwner {
  __typename?: string;
  address?: { address: string };   // AddressOwner, ObjectOwner, ConsensusAddressOwner
  initialSharedVersion?: number;   // Shared
}

interface GqlMoveContents {
  json?: unknown;
  type?: { repr?: string };
}

interface GqlObject {
  address?: string;
  version?: string | number;
  digest?: string;
  // GetObject (single, on `Object`): contents nested under asMoveObject cast.
  // OwnedObjects (on `MoveObject`): contents directly on the node.
  asMoveObject?: { contents?: GqlMoveContents | null };
  contents?: GqlMoveContents | null;
  owner?: GqlObjectOwner | null;
}

interface GqlObjectsPage {
  pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
  nodes?: GqlObject[];
}

interface GqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// ── GraphQL fetch helper ──────────────────────────────────────────────────────

async function suiGql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(suiGraphqlUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Sui GraphQL -> ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as GqlEnvelope<T>;
  if (body.errors?.length) {
    throw new Error(`Sui GraphQL error: ${body.errors.map(e => e.message).join('; ')}`);
  }
  return body.data as T;
}

// ── GraphQL → SuiObjectData mapper ───────────────────────────────────────────
// Owner variants mirror JSON-RPC: { AddressOwner: "0x..." } | { Shared: { initial_shared_version: N } }
// content.fields mirrors JSON-RPC: the parsed Move fields object

function mapGqlOwner(owner: GqlObjectOwner | null | undefined): unknown {
  if (!owner) return null;
  switch (owner.__typename) {
    case 'AddressOwner':
    case 'ConsensusAddressOwner':
      return owner.address?.address ? { AddressOwner: owner.address.address } : null;
    case 'ObjectOwner':
      return owner.address?.address ? { ObjectOwner: owner.address.address } : null;
    case 'Shared':
      return owner.initialSharedVersion != null
        ? { Shared: { initial_shared_version: owner.initialSharedVersion } }
        : null;
    case 'Immutable':
      return 'Immutable';
    default:
      return null;
  }
}

function mapGqlObject(node: GqlObject): SuiObjectData | null {
  if (!node.address) return null;
  // OwnedObjects: contents top-level on MoveObject. GetObject: nested under asMoveObject.
  const contents = node.contents ?? node.asMoveObject?.contents ?? null;
  return {
    objectId: node.address,
    version: node.version != null ? String(node.version) : undefined,
    digest: node.digest,
    type: contents?.type?.repr,
    owner: mapGqlOwner(node.owner),
    content: contents?.json != null ? { fields: contents.json } : undefined,
  };
}

// ── GraphQL public helpers ────────────────────────────────────────────────────
// Active sources of truth in graphql mode; shadow-compared in shadow mode.

export async function fetchSuiObjectGraphQL(objectId: string): Promise<SuiObjectData | null> {
  const data = await suiGql<{ object?: GqlObject | null }>(
    GQL_GET_OBJECT,
    { id: objectId },
  );
  return data.object ? mapGqlObject(data.object) : null;
}

export async function fetchOwnedObjectsByTypeGraphQL(
  owner: string,
  type: string,
): Promise<SuiObjectData[]> {
  const objects: SuiObjectData[] = [];
  let cursor: string | null = null;
  do {
    const vars: Record<string, unknown> = { owner, type };
    if (cursor) vars.cursor = cursor;
    const data = await suiGql<{
      address?: { objects?: GqlObjectsPage | null } | null;
    }>(GQL_GET_OWNED_OBJECTS, vars);
    const page = data?.address?.objects;
    if (!page) break;
    for (const node of page.nodes ?? []) {
      const mapped = mapGqlObject(node);
      if (mapped) objects.push(mapped);
    }
    cursor = page.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? null) : null;
  } while (cursor);
  return objects;
}

// Shadow semantic comparison and console output now live in
// `sui-fetcher-telemetry.ts`. This file only routes RPC vs GraphQL results
// into compareObject / compareArray and records fetch-level timing/counts.
