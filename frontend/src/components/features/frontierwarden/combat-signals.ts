import type { KillMailItem } from '../../../types/api.types';

export interface CombatSignal {
  label: string;
  value: string;
  /** neutral: grey | advisory: amber (worth noting, not good/bad) | info: hi (positive context) */
  type: 'neutral' | 'advisory' | 'info';
  note?: string;
}

export function deriveCombatSignals(
  kills: KillMailItem[],
  losses: KillMailItem[],
  killsMore: boolean,
  lossesMore: boolean,
  shipKillAttestationCount: number,
): CombatSignal[] {
  const signals: CombatSignal[] = [];
  const totalKills  = kills.length;
  const totalLosses = losses.length;
  const totalCombat = totalKills + totalLosses;

  signals.push({
    label: 'Kills on Record',
    value: killsMore  ? `${totalKills}+`  : String(totalKills),
    type:  'neutral',
    note:  'most recent indexed',
  });
  signals.push({
    label: 'Losses on Record',
    value: lossesMore ? `${totalLosses}+` : String(totalLosses),
    type:  'neutral',
    note:  'most recent indexed',
  });

  // Ratio only when the full window is visible (no truncation) and there's enough data
  if (totalCombat >= 3 && !killsMore && !lossesMore) {
    const ratio = totalLosses === 0
      ? (totalKills > 0 ? '∞' : '—')
      : (totalKills / totalLosses).toFixed(2);
    signals.push({
      label: 'Kill / Loss Ratio',
      value: ratio,
      type:  'info',
      note:  `${totalKills} kills · ${totalLosses} losses (full recent window)`,
    });
  }

  // Profile characterisation — advisory label only, no value judgment
  if (totalCombat === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'No combat evidence indexed',
      type:  'neutral',
    });
  } else if (totalKills >= 3 && totalLosses === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'Combat-heavy · no losses on record',
      type:  'advisory',
      note:  'Advisory only — tenant policy decides relevance',
    });
  } else if (totalLosses >= 3 && totalKills === 0) {
    signals.push({
      label: 'Combat Profile',
      value: 'High recent loss activity',
      type:  'advisory',
      note:  'Advisory only — may be relevant for collateral context',
    });
  } else if (totalLosses >= 3) {
    signals.push({
      label: 'Combat Profile',
      value: 'High recent loss activity',
      type:  'advisory',
      note:  'Advisory only — tenant policy decides relevance',
    });
  } else {
    signals.push({
      label: 'Combat Profile',
      value: 'Active combat record',
      type:  'neutral',
    });
  }

  // Layer 2: SHIP_KILL oracle attestations
  signals.push({
    label: 'SHIP_KILL Attested',
    value: shipKillAttestationCount > 0
      ? `${shipKillAttestationCount} oracle attestation${shipKillAttestationCount !== 1 ? 's' : ''}`
      : 'None on record',
    type: shipKillAttestationCount > 0 ? 'info' : 'neutral',
    note: shipKillAttestationCount > 0
      ? 'Layer 2: oracle-interpreted kill evidence — separate from telemetry'
      : 'No SHIP_KILL oracle attestations found for this address',
  });

  return signals;
}
