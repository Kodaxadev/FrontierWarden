// sui-object-fetcher.ts — Adapter layer: all Sui JSON-RPC construction, object
// resolution, and owned-object listing lives here. No other file should build
// raw RPC fetch calls or construct a SuiJsonRpcClient directly.
//
// JSON-RPC is the source of truth. GraphQL shadow fires in parallel (dev only)
// via VITE_SUI_OBJECT_FETCHER_SHADOW_GRAPHQL=true; warns on semantic mismatches.
//
// Phase 2 cutover: flip fetchSuiObjectRaw / fetchOwnedObjectsByType to GraphQL
// variants once shadow confirms parity. See SUI_JSON_RPC_DEPRECATION_SPIKE.md.
//
// tx.build() constraint: no client in tx.build(). See tx-check-passage.ts.

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
        ... on AddressOwner { address { address } __typename }
        ... on ObjectOwner  { address { address } __typename }
        ... on Shared { initialSharedVersion __typename }
        ... on Immutable { __typename }
        ... on ConsensusAddressOwner { address { address } __typename }
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
  return {
    objectId: node.address,
    version: node.version != null ? String(node.version) : undefined,
    digest: node.digest,
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
// Semantic: warns on objectId/type/owner/version/digest mismatches only.
// Expected encoding differences (UID wrapper, vector<u8> base64, nested struct
// flattening) surface as content.fields inequality — logged at debug only.

const _P = '[sui-object-fetcher]';

function _diff(a: unknown, b: unknown, key: string): string[] {
  return JSON.stringify(a) !== JSON.stringify(b) ? [key] : [];
}

function _shadowSingle(label: string, rpc: SuiObjectData | null, gql: SuiObjectData | null): void {
  if (!rpc && !gql) { console.debug(`${_P} ✓ null: ${label}`); return; }
  if (!rpc || !gql) { console.warn(`${_P} ✗ null mismatch: ${label}`, { rpc, gql }); return; }
  const d = [
    ..._diff(rpc.objectId, gql.objectId, 'objectId'),
    ..._diff(rpc.type,     gql.type,     'type'),
    ...(rpc.version && gql.version ? _diff(rpc.version, gql.version, 'version') : []),
    ...(rpc.digest  && gql.digest  ? _diff(rpc.digest,  gql.digest,  'digest')  : []),
    ..._diff(rpc.owner,    gql.owner,    'owner'),
  ];
  if (d.length) {
    console.warn(`${_P} ✗ semantic mismatch [${d.join(',')}]: ${label}`, { rpc, gql });
  } else {
    const enc = JSON.stringify(rpc.content?.fields) !== JSON.stringify(gql.content?.fields);
    console.debug(`${_P} ${enc ? '✓ semantic match (encoding diff)' : '✓ match'}: ${label}`);
  }
}

function _shadowArray(label: string, rpc: SuiObjectData[], gql: SuiObjectData[]): void {
  const rIds = new Set(rpc.map(o => o.objectId).filter((id): id is string => !!id));
  const gIds = new Set(gql.map(o => o.objectId).filter((id): id is string => !!id));
  const missing = [...rIds].filter(id => !gIds.has(id));
  const extra   = [...gIds].filter(id => !rIds.has(id));
  if (missing.length || extra.length) { console.warn(`${_P} ✗ set mismatch: ${label}`, { missing, extra }); return; }
  let warned = false;
  for (const ro of rpc) {
    const go = gql.find(g => g.objectId === ro.objectId);
    if (!go) continue;
    const d = [..._diff(ro.type, go.type, 'type'), ..._diff(ro.owner, go.owner, 'owner')];
    if (d.length) { console.warn(`${_P} ✗ semantic mismatch [${d.join(',')}]: ${label}[${ro.objectId?.slice(0, 10)}…]`, { rpc: ro, gql: go }); warned = true; }
  }
  if (!warned) {
    const enc = rpc.some(ro => { const go = gql.find(g => g.objectId === ro.objectId); return !!go && JSON.stringify(ro.content?.fields) !== JSON.stringify(go.content?.fields); });
    console.debug(`${_P} ${enc ? '✓ semantic match (encoding diffs)' : '✓ match'}: ${label} (${rpc.length})`);
  }
}

function shadowLog(label: string, rpc: SuiObjectData | SuiObjectData[] | null, gql: SuiObjectData | SuiObjectData[] | null): void {
  if (Array.isArray(rpc) && Array.isArray(gql)) _shadowArray(label, rpc, gql);
  else if (!Array.isArray(rpc) && !Array.isArray(gql)) _shadowSingle(label, rpc, gql);
}
