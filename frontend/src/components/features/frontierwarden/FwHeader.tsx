// FwHeader v3 — slim 44px persistent header
// Brand | Chain status | Pilot | Score | Wallet connect | Crit badge

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import type { FwData } from './fw-data';
import { SUI_NETWORK_LABEL } from '../../../lib/network';

interface FwHeaderProps { data: FwData; }

function latestCheckpoint(data: FwData): number | null {
  const values = [
    data.policy?.checkpoint,
    data.pilot.checkpoint,
    ...data.gates.map(gate => gate.checkpoint),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : null;
}

function shortAddr(v: string): string {
  if (v.length <= 12) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

export function FwHeader({ data }: FwHeaderProps) {
  const account = useCurrentAccount();
  const { pilot, alerts } = data;
  const crits = alerts.filter(a => a.lvl === 'CRIT').length;
  const luxM   = (pilot.walletLux / 1_000_000).toFixed(1);
  const checkpoint = latestCheckpoint(data);

  return (
    <header className="c-header">
      <span className="c-header__brand">
        FRONTIERWARDEN
        <span className="c-header__brand-sub">
          TRUST · REPUTATION · GATE POLICY
        </span>
      </span>

      <div className="c-header__chain">
        <span className="c-header__dot" />
        <span>{SUI_NETWORK_LABEL}</span>
        <span className="c-header__sep">·</span>
        <span>{checkpoint == null ? 'SYNCING' : `CHECKPOINT ${checkpoint.toLocaleString()}`}</span>
        <span className="c-header__sep">·</span>
        <span>{pilot.sessionLat}ms</span>
      </div>

      <span className="c-header__spacer" />

      <span className="c-header__pilot">
        {pilot.characterName ?? pilot.name}
        <span className="c-header__pilot-tag">
          {pilot.syndicateTag}
        </span>
      </span>

      <span className="c-header__score">{pilot.score.toLocaleString()}</span>
      <span className="c-header__delta">+{pilot.scoreDelta}</span>

      <span className="c-header__wallet">
        {account ? (
          <span style={{ fontSize: 10, fontFamily: 'var(--c-mono)', color: 'var(--c-hi)' }}>
            {shortAddr(account.address)}
          </span>
        ) : (
          <span className="c-wallet-connect" style={{ display: 'inline-block' }}>
            <ConnectButton>CONNECT</ConnectButton>
          </span>
        )}
      </span>

      {crits > 0 && (
        <span className="c-header__crit">{crits} CRIT</span>
      )}
    </header>
  );
}
