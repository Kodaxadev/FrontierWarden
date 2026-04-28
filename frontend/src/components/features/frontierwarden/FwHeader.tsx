// FwHeader v3 — slim 44px persistent header
// Brand | Chain status | Pilot | Score | Wallet | Crit badge

import type { FwData } from './fw-data';

interface FwHeaderProps { data: FwData; }

export function FwHeader({ data }: FwHeaderProps) {
  const { pilot, alerts } = data;
  const crits = alerts.filter(a => a.lvl === 'CRIT').length;
  const iskM   = (pilot.walletIsk / 1_000_000).toFixed(1);

  return (
    <header className="c-header">
      <span className="c-header__brand">FRONTIERWARDEN</span>

      <div className="c-header__chain">
        <span className="c-header__dot" />
        <span>MAINNET</span>
        <span className="c-header__sep">·</span>
        <span>BLOCK 18,402,114</span>
        <span className="c-header__sep">·</span>
        <span>{pilot.sessionLat}ms</span>
      </div>

      <span className="c-header__spacer" />

      <span className="c-header__pilot">
        {pilot.name}
        <span style={{ color: 'var(--c-mid)', marginLeft: 8 }}>
          {pilot.syndicateTag}
        </span>
      </span>

      <span className="c-header__score">{pilot.score.toLocaleString()}</span>
      <span className="c-header__delta">+{pilot.scoreDelta}</span>

      <span className="c-header__wallet">
        <strong>{iskM}M</strong> ISK
      </span>

      {crits > 0 && (
        <span className="c-header__crit">{crits} CRIT</span>
      )}
    </header>
  );
}
