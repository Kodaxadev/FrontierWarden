import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const GRPC_URLS = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
};

type SupportedNetwork = keyof typeof GRPC_URLS;

const SUPPORTED_NETWORKS = Object.keys(GRPC_URLS) as SupportedNetwork[];

export const dAppKit = createDAppKit({
  networks: SUPPORTED_NETWORKS,
  defaultNetwork: 'testnet',
  // Disable the Slush web fallback. Browser/native wallets still register
  // through Wallet Standard; this only removes the my.slush.app popup path.
  slushWalletConfig: null,
  createClient(network) {
    return new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[network as SupportedNetwork],
    });
  },
});
