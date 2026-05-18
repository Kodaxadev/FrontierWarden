// Smoke comparison: JSON-RPC vs GraphQL field shapes for known testnet objects.
// Run: node scripts/gql-smoke-compare.mjs
// Requires Node 18+ (built-in fetch).

const RPC_URL = "https://fullnode.testnet.sui.io:443";
const GQL_URL = "https://graphql.testnet.sui.io/graphql";

// Known testnet objects from scripts/testnet-addresses.json
const TEST_OBJECTS = [
  { id: "0x7b10f2ee46602382ad8b5a1716f7282a3f6db53b4b6346f85ec27b8308353807", label: "GatePolicy (shared)" },
  { id: "0xcbe4f3a7bdfdcdb3035ccb091729285c5265cfd14e79207145cbde3953912688", label: "OracleRegistry (shared)" },
  { id: "0x7b4c0652836b43bf6409a7fa43fcd0e07e53eb77f7ee7e4ef98119756e8396f5", label: "Attestation (address-owned)" },
  { id: "0x019f53078f1501840c37ce97f3b1d48fe284c5913e8091ed922c313da3f30a7c", label: "World Gate (shared)" },
];

// Known wallet → PlayerProfile type. Exercises the owned-objects path
// (Address.objects.nodes returns MoveObject[] directly — no asMoveObject cast).
const OWNED_TESTS = [
  {
    owner: "0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f",
    type: "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c::character::PlayerProfile",
    label: "PlayerProfile (gate admin wallet)",
  },
];

// ── GraphQL introspection ─────────────────────────────────────────────────────

async function introspectType(typeName) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `{__type(name:"${typeName}"){kind possibleTypes{name} fields{name type{name kind ofType{name kind}}}}}`,
    }),
  });
  const body = await res.json();
  return body.data?.__type ?? null;
}

// ── JSON-RPC fetch ────────────────────────────────────────────────────────────

async function rpcGetObject(objectId) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "sui_getObject",
      params: [objectId, { showContent: true, showOwner: true, showType: true }],
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  return body.result?.data ?? null;
}

// ── GraphQL fetch (current query in sui-object-fetcher.ts) ───────────────────

// BUGGY — what was committed in PR #46 (owner fragments use wrong field names)
const GQL_GET_OBJECT_BUGGY = `
  query GetObject($id: SuiAddress!) {
    object(address: $id) {
      address version digest
      asMoveObject { contents { json type { repr } } }
      owner {
        ... on AddressOwner { owner { address } __typename }
        ... on Shared { initialSharedVersion __typename }
        ... on Immutable { __typename }
        ... on Parent { parent { address } __typename }
      }
    }
  }
`;

// FIXED — corrected owner fragments matching actual Sui GraphQL schema
const GQL_GET_OBJECT_FIXED = `
  query GetObject($id: SuiAddress!) {
    object(address: $id) {
      address version digest
      asMoveObject { contents { json type { repr } } }
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

const GQL_GET_OBJECT_CURRENT = GQL_GET_OBJECT_FIXED;

async function gqlGetObjectCurrent(objectId) {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: GQL_GET_OBJECT_CURRENT, variables: { id: objectId } }),
  });
  const body = await res.json();
  if (body.errors?.length) return { errors: body.errors };
  return body.data?.object ?? null;
}

// ── Mapper (mirrors mapGqlObject in sui-object-fetcher.ts) ───────────────────

function mapGqlOwner(owner) {
  if (!owner) return null;
  switch (owner.__typename) {
    case "AddressOwner":
    case "ConsensusAddressOwner":
      return owner.address?.address ? { AddressOwner: owner.address.address } : null;
    case "ObjectOwner":
      return owner.address?.address ? { ObjectOwner: owner.address.address } : null;
    case "Shared":
      return owner.initialSharedVersion != null
        ? { Shared: { initial_shared_version: owner.initialSharedVersion } }
        : null;
    case "Immutable":
      return "Immutable";
    default:
      return null;
  }
}

function mapGqlObject(node) {
  if (!node?.address) return null;
  return {
    objectId: node.address,
    type: node.asMoveObject?.contents?.type?.repr,
    owner: mapGqlOwner(node.owner),
    content: node.asMoveObject?.contents?.json != null
      ? { fields: node.asMoveObject.contents.json }
      : undefined,
  };
}

// ── Owned-objects fetch helpers ───────────────────────────────────────────────

async function rpcGetOwnedObjects(owner, type) {
  const all = [];
  let cursor = null;
  do {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "suix_getOwnedObjects",
        params: [owner, { filter: { StructType: type }, options: { showContent: true, showOwner: true, showType: true } }, cursor, 50],
      }),
    });
    const body = await res.json();
    if (body.error) throw new Error(`RPC error: ${body.error.message}`);
    const page = body.result ?? {};
    for (const env of page.data ?? []) if (env.data) all.push(env.data);
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);
  return all;
}

// Mirror of GQL_GET_OWNED_OBJECTS in frontend/src/lib/sui-object-fetcher.ts.
// `contents` is on MoveObject directly. No asMoveObject cast.
const GQL_GET_OWNED = `
  query OwnedObjects($owner: SuiAddress!, $type: String, $cursor: String) {
    address(address: $owner) {
      objects(filter: { type: $type }, after: $cursor, first: 50) {
        nodes {
          address version digest
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

async function gqlGetOwnedObjects(owner, type) {
  const all = [];
  let cursor = null;
  do {
    const vars = { owner, type };
    if (cursor) vars.cursor = cursor;
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: GQL_GET_OWNED, variables: vars }),
    });
    const body = await res.json();
    if (body.errors?.length) throw new Error(`GQL error: ${body.errors.map(e => e.message).join('; ')}`);
    const page = body.data?.address?.objects;
    if (!page) break;
    for (const node of page.nodes ?? []) all.push(node);
    cursor = page.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? null) : null;
  } while (cursor);
  return all;
}

function mapGqlOwnedNode(node) {
  if (!node?.address) return null;
  const contents = node.contents ?? node.asMoveObject?.contents ?? null;
  return {
    objectId: node.address,
    type: contents?.type?.repr,
    owner: mapGqlOwner(node.owner),
    content: contents?.json != null ? { fields: contents.json } : undefined,
  };
}

function extractRpcSuiObjectData(rpcObj) {
  if (!rpcObj) return null;
  return {
    objectId: rpcObj.objectId,
    type: rpcObj.type,
    owner: rpcObj.owner,
    content: rpcObj.content?.fields != null ? { fields: rpcObj.content.fields } : undefined,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Introspect owner union types
  console.log("=== GraphQL Schema: ObjectOwner union ===");
  const ownerType = await introspectType("ObjectOwner");
  if (ownerType) {
    console.log(JSON.stringify(ownerType, null, 2));
  } else {
    console.log("(type not found — may not be named ObjectOwner)");
  }

  console.log("\n=== GraphQL Schema: AddressOwner fields ===");
  const addressOwnerType = await introspectType("AddressOwner");
  console.log(JSON.stringify(addressOwnerType, null, 2));

  // 2. Per-object comparison
  console.log("\n=== Object Comparisons ===\n");
  for (const { id, label } of TEST_OBJECTS) {
    console.log(`--- ${label} (${id.slice(0, 10)}...) ---`);
    try {
      const [rpcRaw, gqlRaw] = await Promise.all([rpcGetObject(id), gqlGetObjectCurrent(id)]);
      if (gqlRaw?.errors) {
        console.log("  GQL ERRORS:", JSON.stringify(gqlRaw.errors));
        console.log("  RPC fields:", JSON.stringify(rpcRaw?.content?.fields, null, 2));
        continue;
      }
      const rpcMapped = extractRpcSuiObjectData(rpcRaw);
      const gqlMapped = mapGqlObject(gqlRaw);
      const fieldsMatch = JSON.stringify(rpcMapped?.content?.fields) === JSON.stringify(gqlMapped?.content?.fields);
      const ownerMatch = JSON.stringify(rpcMapped?.owner) === JSON.stringify(gqlMapped?.owner);
      const typeMatch = rpcMapped?.type === gqlMapped?.type;
      console.log(`  type match:   ${typeMatch}`);
      console.log(`  owner match:  ${ownerMatch}`);
      console.log(`  fields match: ${fieldsMatch}`);
      if (!fieldsMatch) {
        console.log("  RPC fields:", JSON.stringify(rpcMapped?.content?.fields, null, 2));
        console.log("  GQL fields:", JSON.stringify(gqlMapped?.content?.fields, null, 2));
      }
      if (!ownerMatch) {
        console.log("  RPC owner:", JSON.stringify(rpcMapped?.owner));
        console.log("  GQL owner:", JSON.stringify(gqlMapped?.owner));
      }
      if (!typeMatch) {
        console.log("  RPC type:", rpcMapped?.type);
        console.log("  GQL type:", gqlMapped?.type);
      }
    } catch (err) {
      console.log("  ERROR:", err.message);
    }
    console.log();
  }
}

// ── Owned-objects comparison ─────────────────────────────────────────────────

async function compareOwned() {
  console.log("\n=== Owned Object Comparisons ===\n");
  for (const { owner, type, label } of OWNED_TESTS) {
    console.log(`--- ${label} ---`);
    console.log(`  owner: ${owner.slice(0, 10)}...`);
    console.log(`  type:  ${type.split("::").slice(-2).join("::")}`);
    try {
      const [rpcList, gqlList] = await Promise.all([rpcGetOwnedObjects(owner, type), gqlGetOwnedObjects(owner, type)]);
      const rpcIds = new Set(rpcList.map(o => o.objectId).filter(Boolean));
      const gqlIds = new Set(gqlList.map(n => n.address).filter(Boolean));
      const missing = [...rpcIds].filter(id => !gqlIds.has(id));
      const extra   = [...gqlIds].filter(id => !rpcIds.has(id));
      console.log(`  rpc count:    ${rpcList.length}`);
      console.log(`  gql count:    ${gqlList.length}`);
      console.log(`  set match:    ${missing.length === 0 && extra.length === 0}`);
      if (missing.length) console.log(`    missing in gql: ${missing.length}`);
      if (extra.length)   console.log(`    extra in gql:   ${extra.length}`);
      // Per-object semantic check
      let semanticMismatches = 0;
      for (const ro of rpcList) {
        const go = gqlList.find(n => n.address === ro.objectId);
        if (!go) continue;
        const rm = extractRpcSuiObjectData(ro);
        const gm = mapGqlOwnedNode(go);
        if (rm.type !== gm.type || JSON.stringify(rm.owner) !== JSON.stringify(gm.owner)) {
          semanticMismatches += 1;
          console.log(`    semantic mismatch on ${ro.objectId?.slice(0, 10)}…: rpc=${JSON.stringify({t: rm.type, o: rm.owner})} gql=${JSON.stringify({t: gm.type, o: gm.owner})}`);
        }
      }
      console.log(`  semantic match: ${semanticMismatches === 0 ? "all" : `${rpcList.length - semanticMismatches}/${rpcList.length}`}`);
    } catch (err) {
      console.log("  ERROR:", err.message);
    }
    console.log();
  }
}

main()
  .then(compareOwned)
  .catch(console.error);
