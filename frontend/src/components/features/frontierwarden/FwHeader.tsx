// FwHeader v3 — slim 44px persistent header
// Brand | Chain status | Pilot | Score | Wallet | Crit badge

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

export function FwHeader({ data }: FwHeaderProps) {
  const { pilot, alerts } = data;
  const crits = alerts.filter(a => a.lvl === 'CRIT').length;
  const luxM   = (pilot.walletLux / 1_000_000).toFixed(1);
  const checkpoint = latestCheckpoint(data);

  return (
    <header className="c-header">
      <span className="c-header__brand">
        FRONTIERWARDEN
        <span style={{ fontSize: 8, color: 'var(--c-mid)', letterSpacing: '0.14em', marginLeft: 8 }}>
          NODE SENTINEL
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
        <span style={{ color: 'var(--c-mid)', marginLeft: 8 }}>
          {pilot.syndicateTag}
        </span>
      </span>

      <span className="c-header__score">{pilot.score.toLocaleString()}</span>
      <span className="c-header__delta">+{pilot.scoreDelta}</span>

      <span className="c-header__wallet">
        <strong>{luxM}M</strong> LUX
      </span>

      {crits > 0 && (
        <span className="c-header__crit">{crits} CRIT</span>
      )}
    </header>
  );
}
