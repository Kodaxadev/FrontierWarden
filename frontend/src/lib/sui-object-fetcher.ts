// sui-object-fetcher.ts — Adapter layer: all SuiJsonRpcClient construction and
// object/coin resolution lives here. No other file should construct a
// SuiJsonRpcClient directly.
//
// TODO: GraphQL cutover point — replace SuiJsonRpcClient with GraphQL queries
// when suix_queryEvents and related JSON-RPC methods are removed (~Jul 2026).
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
