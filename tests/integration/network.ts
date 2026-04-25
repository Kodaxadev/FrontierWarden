import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';

export interface NetworkConfig {
  name: string;
  fullnode: string;
  faucet?: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  devnet: {
    name: 'devnet',
    fullnode: 'https://fullnode.devnet.sui.io:443',
    faucet: 'https://faucet.devnet.sui.io/gas',
  },
  local: {
    name: 'local',
    fullnode: 'http://0.0.0.0:9184',
  },
};

export function createClient(network: 'devnet' | 'local' = 'devnet'): SuiClient {
  const config = NETWORKS[network];
  return new SuiClient({
    transport: new SuiHTTPTransport({ url: config.fullnode }),
  });
}

export async function getCurrentEpoch(client: SuiClient): Promise<number> {
  const dynamicFields = await client.getLatestEpochFields();
  return Number(dynamicFields.epoch);
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}