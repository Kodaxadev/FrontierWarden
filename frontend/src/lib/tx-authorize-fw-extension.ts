// tx-authorize-fw-extension.ts -- Build PTB to authorize the FrontierWardenAuth
// extension on a world Gate via the borrow/authorize/return pattern.
//
// PTB shape:
//   1. borrow_owner_cap<Gate>(character, Receiving<OwnerCap<Gate>>)
//      -> (OwnerCap<Gate>, ReturnOwnerCapReceipt)
//   2. authorize_extension<FrontierWardenAuth>(gate, &OwnerCap<Gate>)
//   3. return_owner_cap<Gate>(character, OwnerCap<Gate>, ReturnOwnerCapReceipt)
//
// Hard boundary:
//   - Does NOT create GatePolicy or GateAdminCap
//   - Does NOT bind GatePolicy to world Gate
//   - Does NOT change trust settings
//   - Only authorizes the FrontierWardenAuth extension on an already-owned Gate

import { toBase64 } from '@mysten/bcs';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = ['VITE_PKG_ID'] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

// World Gate package published-at ID (used for function calls).
// Defaults to the known Stillness world gate published-at.
const DEFAULT_WORLD_PKG_PUBLISHED_AT =
  '0xd2fd1224f881e7a705dbc211888af11655c315f2ee0f03fe680fc3176e6e4780';

// FrontierWarden auth witness origin package (used for type argument).
const FW_ORIGIN_PKG =
  '0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa';

const FW_AUTH_TYPE = `${FW_ORIGIN_PKG}::reputation_gate::FrontierWardenAuth`;

export interface BuildAuthorizeFWExtensionArgs {
  sender: string;
  worldGateId: string;
  ownerCapId: string;
  characterId: string;
  worldPackagePublishedAt?: string;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingAuthorizeFWExtensionConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function authorizeFWExtensionConfigReady(): boolean {
  return missingAuthorizeFWExtensionConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`authorize fw extension tx: missing env var ${key}`);
  return value;
}

function suiNetwork() {
  return (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as
    'mainnet' | 'testnet' | 'devnet' | 'localnet';
}

export async function buildAuthorizeFWExtensionTxKind(
  args: BuildAuthorizeFWExtensionArgs,
): Promise<string> {
  const pkgId = requiredEnv('VITE_PKG_ID');
  const worldPkgPublishedAt = args.worldPackagePublishedAt ?? DEFAULT_WORLD_PKG_PUBLISHED_AT;

  const network = suiNetwork();
  const rpcClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });

  // Resolve the Gate object to confirm it exists and get its digest.
  const gateObject = await rpcClient.getObject({
    id: args.worldGateId,
    options: { showBcs: false },
  });
  if (!gateObject?.data) {
    throw new Error(`authorize fw extension tx: failed to fetch world Gate ${args.worldGateId}`);
  }

  // Resolve the OwnerCap to get its version/digest (for the Receiving reference).
  const ownerCapObject = await rpcClient.getObject({
    id: args.ownerCapId,
    options: { showBcs: false },
  });
  if (!ownerCapObject?.data) {
    throw new Error(`authorize fw extension tx: failed to fetch OwnerCap ${args.ownerCapId}`);
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  // 1. Borrow OwnerCap<Gate> from Character
  //    borrow_owner_cap<Gate>(character: &mut Character, cap: Receiving<OwnerCap<Gate>>)
  //    -> (OwnerCap<Gate>, ReturnOwnerCapReceipt)
  const [ownerCap, receipt] = tx.moveCall({
    target: `${worldPkgPublishedAt}::character::borrow_owner_cap`,
    typeArguments: [`${worldPkgPublishedAt}::gate::Gate`],
    arguments: [
      tx.object(args.characterId),
      tx.object(args.ownerCapId),
    ],
  });

  // 2. Authorize FrontierWardenAuth extension on the Gate
  //    authorize_extension<FrontierWardenAuth>(gate: &mut Gate, cap: &OwnerCap<Gate>)
  tx.moveCall({
    target: `${worldPkgPublishedAt}::gate::authorize_extension`,
    typeArguments: [FW_AUTH_TYPE],
    arguments: [
      tx.object(args.worldGateId),
      ownerCap,
    ],
  });

  // 3. Return OwnerCap<Gate> back to Character
  //    return_owner_cap<Gate>(character: &Character, cap: OwnerCap<Gate>, receipt: ReturnOwnerCapReceipt)
  tx.moveCall({
    target: `${worldPkgPublishedAt}::character::return_owner_cap`,
    typeArguments: [`${worldPkgPublishedAt}::gate::Gate`],
    arguments: [
      tx.object(args.characterId),
      ownerCap,
      receipt,
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true });
  return toBase64(kindBytes);
}
