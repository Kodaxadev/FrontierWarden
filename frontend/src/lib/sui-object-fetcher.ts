// sui-object-fetcher.ts — Adapter layer: all Sui JSON-RPC construction, object
// resolution, and owned-object listing lives here. No other file should build
// raw RPC fetch calls or construct a SuiJsonRpcClient directly.
//
// Three fetch paths share the same URL source logic:
//   1. SuiJsonRpcClient — tx builders: .getObject() / .getCoins()
//   2. Raw JSON-RPC fetch — operator-gate-authority: suix_getOwnedObjects / sui_getObject
//   3. GraphQL fetch (shadow/Phase 2) — parallel GraphQL calls for parity validation
//
// JSON-RPC is the current source of truth.
// GraphQL is additive: enabled only via VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true (dev builds).
//
// Phase 2 cutover: once shadow logs confirm parity, flip fetchSuiObjectRaw and
// fetchOwnedObjectsByType to call the GraphQL variants and remove JSON-RPC.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md.
//
// tx.build() constraint: MUST be called without a client. Do not pass any
// SuiJsonRpcClient or GraphQL client into tx.build(). See tx-check-passage.ts.

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// ── Network helpers ───────────────────────────────────────────────────────────

type SuiNetworkType = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

function suiNetwork(): SuiNetworkType {
  return ((import.meta.env.VITE_SUI_NETWORK as string | undefined) ?? 'testnet') as SuiNetworkType;
}

// Returns the Sui JSON-RPC URL for the current network.
// VITE_SUI_RPC_URL overrides if set (for custom endpoints or local nodes).
// TODO: Remove when GraphQL migration is complete.
export function suiRpcUrl(): string {
  const override = (import.meta.env as Record<string, string | undefined>).VITE_SUI_RPC_URL;
  return override ?? getJsonRpcFullnodeUrl(suiNetwork());
}

// ── SuiJsonRpcClient (tx builder path) ───────────────────────────────────────

// Returns a SuiJsonRpcClient for object and coin pre-resolution by tx builders.
// Must NOT be passed into tx.build() — see tx-check-passage.ts for the constraint.
// TODO: Replace with GraphQL client at Phase 2 cutover.
export function makeSuiJsonRpcClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: suiRpcUrl(),
    network: suiNetwork(),
  });
}

// ── Raw JSON-RPC wire types ───────────────────────────────────────────────────
// Exported so operator-gate-authority.ts parsers do not redeclare them.
// Shapes match the Sui JSON-RPC 2.0 sui_getObject / suix_getOwnedObjects responses.

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

// ── JSON-RPC public helpers (current source of truth) ────────────────────────

// Fetch all owned objects of a specific struct type, paginating automatically.
// When VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true (dev only), fires a parallel
// GraphQL call and logs any response mismatches to the console.
// TODO: Swap implementation to fetchOwnedObjectsByTypeGraphQL at Phase 2 cutover.
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

  if (shadowEnabled()) {
    fetchOwnedObjectsByTypeGraphQL(owner, type)
      .then(gql => shadowLog(`fetchOwnedObjectsByType(${type})`, objects, gql))
      .catch(err => console.warn('[sui-object-fetcher] shadow GraphQL error (owned):', err));
  }

  return objects;
}

// Fetch a single object by ID with content, owner, and type fields populated.
// When VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true (dev only), fires a parallel
// GraphQL call and logs any response mismatches to the console.
// TODO: Swap implementation to fetchSuiObjectGraphQL at Phase 2 cutover.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md.
export async function fetchSuiObjectRaw(objectId: string): Promise<SuiObjectData | null> {
  const envelope = await suiRpc<SuiObjectEnvelope>('sui_getObject', [
    objectId,
    { showContent: true, showOwner: true, showType: true },
  ]);
  const result = envelope.data ?? null;

  if (shadowEnabled()) {
    fetchSuiObjectGraphQL(objectId)
      .then(gql => shadowLog(`fetchSuiObjectRaw(${objectId})`, result, gql))
      .catch(err => console.warn('[sui-object-fetcher] shadow GraphQL error (object):', err));
  }

  return result;
}

// ── GraphQL config ────────────────────────────────────────────────────────────
// Phase 2 replacement path. JSON-RPC remains default until parity is confirmed.
// See Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md, Phase 2.

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

// Shadow mode: enabled only in Vite dev builds with the flag set to 'true'.
// Never active in production builds.
function shadowEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    (import.meta.env as Record<string, string | undefined>)
      .VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL === 'true'
  );
}

// ── GraphQL query strings ─────────────────────────────────────────────────────
// Query shapes from Documents/SUI_JSON_RPC_DEPRECATION_SPIKE.md, Phase 2.
// `address` added to GetObject so the mapped SuiObjectData.objectId is available.
// `type { repr }` and `owner` added to OwnedObjects nodes to match full SuiObjectData shape.

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
        ... on AddressOwner { owner { address } __typename }
        ... on Shared { initialSharedVersion __typename }
        ... on Immutable { __typename }
        ... on Parent { parent { address } __typename }
      }
    }
  }
`;

const GQL_GET_OWNED_OBJECTS = `
  query OwnedObjects($owner: SuiAddress!, $type: String, $cursor: String) {
    address(address: $owner) {
      objects(filter: { type: $type }, after: $cursor, first: 50) {
        nodes {
          address
          version
          digest
          asMoveObject {
            contents { json type { repr } }
          }
          owner {
            ... on AddressOwner { owner { address } __typename }
            ... on Shared { initialSharedVersion __typename }
            ... on Immutable { __typename }
            ... on Parent { parent { address } __typename }
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
  owner?: { address: string };
  initialSharedVersion?: number;
  parent?: { address: string };
}

interface GqlMoveContents {
  json?: unknown;
  type?: { repr?: string };
}

interface GqlObject {
  address?: string;
  version?: string | number;
  digest?: string;
  asMoveObject?: { contents?: GqlMoveContents | null };
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
// Maps GraphQL response shapes to the SuiObjectData wire format that
// operator-gate-authority.ts parsers expect.
// owner variants mirror JSON-RPC: { AddressOwner: "0x..." } | { Shared: { initial_shared_version: N } }
// content.fields mirrors JSON-RPC: the parsed Move fields object

function mapGqlOwner(owner: GqlObjectOwner | null | undefined): unknown {
  if (!owner) return null;
  switch (owner.__typename) {
    case 'AddressOwner':
      return owner.owner ? { AddressOwner: owner.owner.address } : null;
    case 'Shared':
      return owner.initialSharedVersion != null
        ? { Shared: { initial_shared_version: owner.initialSharedVersion } }
        : null;
    case 'Parent':
      return owner.parent ? { ObjectOwner: owner.parent.address } : null;
    case 'Immutable':
      return 'Immutable';
    default:
      return null;
  }
}

function mapGqlObject(node: GqlObject): SuiObjectData | null {
  if (!node.address) return null;
  return {
    objectId: node.address,
    type: node.asMoveObject?.contents?.type?.repr,
    owner: mapGqlOwner(node.owner),
    content: node.asMoveObject?.contents?.json != null
      ? { fields: node.asMoveObject.contents.json }
      : undefined,
  };
}

// ── GraphQL public helpers (Phase 2 replacement path) ────────────────────────
// These are the future sources of truth. Currently used only in shadow mode.
// Once shadow logs confirm parity, swap fetchSuiObjectRaw and
// fetchOwnedObjectsByType to delegate here.

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

// ── Shadow comparison (dev only) ──────────────────────────────────────────────

function shadowLog(label: string, rpc: unknown, gql: unknown): void {
  const rpcJson = JSON.stringify(rpc);
  const gqlJson = JSON.stringify(gql);
  if (rpcJson === gqlJson) {
    console.debug(`[sui-object-fetcher] ✓ shadow match: ${label}`);
  } else {
    console.warn(`[sui-object-fetcher] ✗ shadow mismatch: ${label}`, {
      rpc,
      graphql: gql,
    });
  }
}
