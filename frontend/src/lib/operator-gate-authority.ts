export type OperatorGateAuthorityStatus =
  | "wallet_not_connected"
  | "checking_character"
  | "no_character"
  | "character_found"
  | "checking_gate_caps"
  | "no_gate_authority"
  | "gate_authority_found"
  | "query_failed";

export interface OperatorPlayerProfileCandidate {
  objectId: string;
  characterId: string | null;
  type: string | null;
}

export interface OperatorCharacterCandidate {
  objectId: string;
  name: string | null;
  characterWallet: string | null;
  ownerCapId: string | null;
  tenant: string | null;
  itemId: string | null;
}

export interface OperatorGateOwnerCapCandidate {
  objectId: string;
  authorizedObjectId: string | null;
  owner: string | null;
  source: "wallet" | "character";
  sourceId: string;
  type: string | null;
}

export interface OperatorGateCandidate {
  worldGateId: string;
  ownerCapId: string | null;
  status: string | null;
  linkedGateId: string | null;
  itemId: string | null;
  tenant: string | null;
  type: string | null;
}

export interface OperatorGateAuthorityState {
  status: OperatorGateAuthorityStatus;
  walletAddress: string | null;
  playerProfiles: OperatorPlayerProfileCandidate[];
  characters: OperatorCharacterCandidate[];
  ownerCaps: OperatorGateOwnerCapCandidate[];
  gates: OperatorGateCandidate[];
  errors: string[];
  warnings: string[];
}

import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const STILLNESS_WORLD_PACKAGE_ID =
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

export const EMPTY_CONNECTED_AUTHORITY: OperatorGateAuthorityState = {
  status: "checking_character",
  walletAddress: null,
  playerProfiles: [],
  characters: [],
  ownerCaps: [],
  gates: [],
  errors: [],
  warnings: [],
};

export const WALLET_NOT_CONNECTED_AUTHORITY: OperatorGateAuthorityState = {
  ...EMPTY_CONNECTED_AUTHORITY,
  status: "wallet_not_connected",
};

interface JsonRpcSuccess<T> {
  result: T;
  error?: never;
}

interface JsonRpcFailure {
  result?: never;
  error: { message?: string; code?: number };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

interface SuiOwnedObjectsPage {
  data?: SuiObjectEnvelope[];
  nextCursor?: string | null;
  hasNextPage?: boolean;
}

interface SuiObjectEnvelope {
  data?: SuiObjectData;
}

interface SuiObjectData {
  objectId?: string;
  type?: string;
  owner?: unknown;
  content?: { fields?: unknown };
}

function envValue(key: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

function worldPackageId(): string {
  return envValue("VITE_EVE_WORLD_PACKAGE_ID") ?? STILLNESS_WORLD_PACKAGE_ID;
}

function rpcUrl(): string {
  const override = envValue("VITE_SUI_RPC_URL");
  if (override) return override;
  const network = (envValue("VITE_SUI_NETWORK") ?? "testnet") as
    "mainnet" | "testnet" | "devnet" | "localnet";
  return getJsonRpcFullnodeUrl(network);
}

export function buildPlayerProfileType(packageId = worldPackageId()): string {
  return `${packageId}::character::PlayerProfile`;
}

export function buildGateOwnerCapType(packageId = worldPackageId()): string {
  return `${packageId}::access::OwnerCap<${packageId}::gate::Gate>`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function idValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return typeof record.id === "string" ? record.id : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);
  return null;
}

function optionIdValue(value: unknown): string | null {
  const direct = idValue(value);
  if (direct) return direct;
  const record = asRecord(value);
  const vec = record.vec;
  if (Array.isArray(vec) && vec.length > 0)
    return idValue(vec[0]) ?? stringValue(vec[0]);
  return null;
}

function objectFields(
  object: SuiObjectData | null | undefined,
): Record<string, unknown> {
  return asRecord(object?.content?.fields);
}

function addressOwner(owner: unknown): string | null {
  const record = asRecord(owner);
  const addressOwnerValue = record.AddressOwner;
  return typeof addressOwnerValue === "string" ? addressOwnerValue : null;
}

async function suiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(
      `Sui RPC ${method} -> ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as JsonRpcResponse<T>;
  if (body.error)
    throw new Error(body.error.message ?? `Sui RPC ${method} failed`);
  return body.result;
}

async function listOwnedObjects(
  owner: string,
  type: string,
): Promise<SuiObjectData[]> {
  const objects: SuiObjectData[] = [];
  let cursor: string | null = null;

  do {
    const page: SuiOwnedObjectsPage = await suiRpc<SuiOwnedObjectsPage>(
      "suix_getOwnedObjects",
      [
        owner,
        {
          filter: { StructType: type },
          options: { showContent: true, showOwner: true, showType: true },
        },
        cursor,
        50,
      ],
    );
    objects.push(
      ...((page.data ?? [])
        .map((envelope: SuiObjectEnvelope) => envelope.data)
        .filter(Boolean) as SuiObjectData[]),
    );
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null;
  } while (cursor);

  return objects;
}

async function getObject(objectId: string): Promise<SuiObjectData | null> {
  const envelope = await suiRpc<SuiObjectEnvelope>("sui_getObject", [
    objectId,
    { showContent: true, showOwner: true, showType: true },
  ]);
  return envelope.data ?? null;
}

function parsePlayerProfile(
  object: SuiObjectData,
): OperatorPlayerProfileCandidate | null {
  if (!object.objectId) return null;
  const fields = objectFields(object);
  return {
    objectId: object.objectId,
    characterId: idValue(fields.character_id),
    type: object.type ?? null,
  };
}

function parseCharacter(
  object: SuiObjectData | null,
): OperatorCharacterCandidate | null {
  if (!object?.objectId) return null;
  const fields = objectFields(object);
  const metadata = asRecord(fields.metadata);
  const metadataValue = asRecord(metadata.fields ?? metadata);
  const key = asRecord(fields.key);
  return {
    objectId: object.objectId,
    name: stringValue(metadataValue.name),
    characterWallet: stringValue(fields.character_address),
    ownerCapId: idValue(fields.owner_cap_id),
    tenant: stringValue(key.tenant),
    itemId: stringValue(key.item_id),
  };
}

function parseOwnerCap(
  object: SuiObjectData,
  source: OperatorGateOwnerCapCandidate["source"],
  sourceId: string,
): OperatorGateOwnerCapCandidate | null {
  if (!object.objectId) return null;
  const fields = objectFields(object);
  return {
    objectId: object.objectId,
    authorizedObjectId: idValue(fields.authorized_object_id),
    owner: addressOwner(object.owner),
    source,
    sourceId,
    type: object.type ?? null,
  };
}

function parseGate(object: SuiObjectData | null): OperatorGateCandidate | null {
  if (!object?.objectId) return null;
  const fields = objectFields(object);
  const key = asRecord(fields.key);
  return {
    worldGateId: object.objectId,
    ownerCapId: idValue(fields.owner_cap_id),
    status: stringValue(fields.status),
    linkedGateId: optionIdValue(fields.linked_gate_id ?? fields.linked_id),
    itemId: stringValue(key.item_id ?? fields.item_id),
    tenant: stringValue(key.tenant ?? fields.tenant),
    type: object.type ?? null,
  };
}

function uniqueById<T>(items: T[], getId: (item: T) => string | null): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = getId(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function finalStatus(
  playerProfiles: OperatorPlayerProfileCandidate[],
  characters: OperatorCharacterCandidate[],
  ownerCaps: OperatorGateOwnerCapCandidate[],
): OperatorGateAuthorityStatus {
  if (playerProfiles.length === 0 || characters.length === 0)
    return "no_character";
  if (ownerCaps.length === 0) return "no_gate_authority";
  return "gate_authority_found";
}

export async function discoverOperatorGateAuthority(
  walletAddress: string,
  onProgress?: (state: OperatorGateAuthorityState) => void,
): Promise<OperatorGateAuthorityState> {
  const profileType = buildPlayerProfileType();
  const ownerCapType = buildGateOwnerCapType();
  const warnings: string[] = [];
  const profileObjects = await listOwnedObjects(walletAddress, profileType);
  const playerProfiles = profileObjects
    .map(parsePlayerProfile)
    .filter(Boolean) as OperatorPlayerProfileCandidate[];
  const characterIds = playerProfiles
    .map((profile) => profile.characterId)
    .filter(Boolean) as string[];

  if (characterIds.length === 0) {
    return {
      ...EMPTY_CONNECTED_AUTHORITY,
      status: "no_character",
      walletAddress,
      playerProfiles,
    };
  }

  const characters = (
    await Promise.all(
      characterIds.map(async (characterId) => {
        try {
          return parseCharacter(await getObject(characterId));
        } catch (err) {
          warnings.push(
            `Character ${characterId}: ${err instanceof Error ? err.message : "query failed"}`,
          );
          return null;
        }
      }),
    )
  ).filter(Boolean) as OperatorCharacterCandidate[];

  onProgress?.({
    ...EMPTY_CONNECTED_AUTHORITY,
    status: characters.length > 0 ? "checking_gate_caps" : "no_character",
    walletAddress,
    playerProfiles,
    characters,
    warnings: [...warnings],
  });

  const walletCapObjects =
    characters.length > 0
      ? await listOwnedObjects(walletAddress, ownerCapType)
      : [];
  const walletCaps = walletCapObjects
    .map((object) => parseOwnerCap(object, "wallet", walletAddress))
    .filter(Boolean) as OperatorGateOwnerCapCandidate[];
  const characterCapsNested = await Promise.all(
    characters.map(async (character) => {
      try {
        const capObjects = await listOwnedObjects(
          character.objectId,
          ownerCapType,
        );
        return capObjects
          .map((object) =>
            parseOwnerCap(object, "character", character.objectId),
          )
          .filter(Boolean) as OperatorGateOwnerCapCandidate[];
      } catch (err) {
        warnings.push(
          `OwnerCap query for ${character.objectId}: ${err instanceof Error ? err.message : "query failed"}`,
        );
        return [];
      }
    }),
  );
  const ownerCaps = uniqueById(
    [...walletCaps, ...characterCapsNested.flat()],
    (cap) => cap.objectId,
  );
  const gates = uniqueById(
    (
      await Promise.all(
        ownerCaps.map(async (cap) => {
          if (!cap.authorizedObjectId) return null;
          try {
            return parseGate(await getObject(cap.authorizedObjectId));
          } catch (err) {
            warnings.push(
              `Gate ${cap.authorizedObjectId}: ${err instanceof Error ? err.message : "query failed"}`,
            );
            return null;
          }
        }),
      )
    ).filter(Boolean) as OperatorGateCandidate[],
    (gate) => gate.worldGateId,
  );

  return {
    status: finalStatus(playerProfiles, characters, ownerCaps),
    walletAddress,
    playerProfiles,
    characters,
    ownerCaps,
    gates,
    errors: [],
    warnings,
  };
}
