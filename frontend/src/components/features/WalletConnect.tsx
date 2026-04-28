// WalletConnect -- live EVE Vault connection via @evefrontier/dapp-kit.
// useConnection() reads from VaultContext (set up by EveFrontierProvider in main.tsx).
//
// Three states rendered:
//   not installed  -- "INSTALL EVE VAULT" link to vault.evefrontier.com
//   disconnected   -- "CONNECT EVE VAULT" button
//   connected      -- truncated address + disconnect [x]

import { useConnection } from '@evefrontier/dapp-kit';

export function WalletConnect() {
  const {
    isConnected,
    walletAddress,
    hasEveVault,
    handleConnect,
    handleDisconnect,
  } = useConnection();

  // Connected
  if (isConnected && walletAddress) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full bg-status-clear"
          aria-hidden="true"
        />
        <span className="font-mono text-[10px] text-alloy-silver/70">
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </span>
        <button
          onClick={handleDisconnect}
          aria-label="Disconnect wallet"
          className="font-mono text-[9px] text-void-500 hover:text-frontier-crimson/70 transition-colors"
        >
          [×]
        </button>
      </div>
    );
  }

  // EVE Vault not installed in browser
  if (!hasEveVault) {
    return (
      <a
        href="https://vault.evefrontier.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Install EVE Vault browser extension"
        className="font-mono text-[9px] text-void-500/60 hover:text-frontier-amber/70 transition-colors tracking-wider"
      >
        INSTALL EVE VAULT ↗
      </a>
    );
  }

  // Disconnected -- vault present, not yet connected
  return (
    <button
      onClick={handleConnect}
      aria-label="Connect EVE Vault wallet"
      className={[
        'flex items-center gap-1.5 px-3 py-1 rounded',
        'font-mono text-[10px] tracking-wider',
        'border border-sui-cyan/30 text-sui-cyan',
        'hover:bg-sui-cyan/10 transition-colors',
      ].join(' ')}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-sui-cyan/60" aria-hidden="true" />
      CONNECT EVE VAULT
    </button>
  );
}
