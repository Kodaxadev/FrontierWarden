// SentinelIdentityGraph — Character → Wallet → Reputation Profile → Attestations
// The core identity chain visualization for the trust perimeter.

import type { TrustPerimeter } from '../../../../types/node-sentinel.types';

interface Props {
  perimeter: TrustPerimeter;
}

export function SentinelIdentityGraph({ perimeter }: Props) {
  const { knownCharacters, knownWallets } = perimeter;

  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">IDENTITY GRAPH</span>
        <span className="ns-count">{knownCharacters.length} PROFILES</span>
      </div>

      {knownCharacters.length === 0 ? (
        <div className="ns-empty">No character profiles in trust perimeter</div>
      ) : (
        <div className="ns-identity-list">
          {knownCharacters.map((char, i) => (
            <div key={`${char.wallet}-${i}`} className="ns-identity-row">
              <div className="ns-identity-chain">
                {/* Character */}
                <span className={`ns-chain-node ${char.hasCharacterMapping ? 'ns-chain-node--linked' : 'ns-chain-node--broken'}`}>
                  <span className="ns-chain-label">CHAR</span>
                  <span className="ns-chain-value">
                    {char.characterName ?? '⚠ UNMAPPED'}
                  </span>
                </span>

                <span className="ns-chain-arrow">→</span>

                {/* Wallet */}
                <span className="ns-chain-node ns-chain-node--linked">
                  <span className="ns-chain-label">WALLET</span>
                  <span className="ns-chain-value ns-mono">{shortAddr(char.wallet)}</span>
                </span>

                <span className="ns-chain-arrow">→</span>

                {/* Profile */}
                <span className={`ns-chain-node ${char.profileId ? 'ns-chain-node--linked' : 'ns-chain-node--broken'}`}>
                  <span className="ns-chain-label">PROFILE</span>
                  <span className="ns-chain-value">
                    {char.profileId ? shortAddr(char.profileId) : '⚠ NONE'}
                  </span>
                </span>

                <span className="ns-chain-arrow">→</span>

                {/* Attestations */}
                <span className={`ns-chain-node ${char.attestationCount > 0 ? 'ns-chain-node--linked' : 'ns-chain-node--broken'}`}>
                  <span className="ns-chain-label">ATTESTATIONS</span>
                  <span className="ns-chain-value">{char.attestationCount}</span>
                </span>
              </div>

              <div className="ns-identity-meta">
                {char.tribeId && (
                  <span className="ns-tag">
                    {char.tribeName ?? char.tribeId}
                  </span>
                )}
                {char.score != null && (
                  <span className="ns-tag ns-tag--score">
                    SCORE: {char.score}
                  </span>
                )}
                {!char.hasCharacterMapping && (
                  <span className="ns-tag ns-tag--warn">
                    NO CHARACTER BINDING
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {knownWallets.length > 0 && (
        <div className="ns-wallet-summary">
          <span className="ns-label ns-label--dim">KNOWN WALLETS: {knownWallets.length}</span>
          <span className="ns-label ns-label--dim">
            MAPPED: {knownWallets.filter(w => w.hasCharacterMapping).length} /
            UNMAPPED: {knownWallets.filter(w => !w.hasCharacterMapping).length}
          </span>
        </div>
      )}
    </div>
  );
}

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
