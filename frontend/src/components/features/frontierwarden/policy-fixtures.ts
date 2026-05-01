export const FALLBACK_POLICIES = [
  {
    label: 'Standing Threshold',
    value: 62,
    pct: 0.062,
    min: 'Enemy  -1000',
    max: 'Ally 1000+',
    note: 'Pass at +247 or above - neutral bracket',
    unit: '62',
  },
  {
    label: 'Pirate Index Cap',
    value: 73,
    pct: 0.73,
    min: 'Clean  0',
    max: 'Wanted  100',
    note: 'Deny transit above 73 - override: CRIT contract',
    unit: '73',
  },
  {
    label: 'Toll Bracket',
    value: 28,
    pct: 0.28,
    min: 'Free  (Ally)',
    max: '10x  (Enemy)',
    note: 'Neutral pass at 2.0x base - approx 14M LUX / transit',
    unit: '2.0x',
  },
];
