// PolicyView — gate policy editor (static hi-fi)
// Three policy controls: standing threshold, pirate index cap, toll bracket

import type { FwData } from '../fw-data';

const POLICIES = [
  {
    label:  'Standing Threshold',
    value:  62,
    pct:    0.531,    // (62 + 1000) / 2000
    min:    'Enemy  −1000',
    max:    'Ally  +1000',
    note:   'Pass at +247 or above · neutral bracket',
    unit:   '+62',
  },
  {
    label:  'Pirate Index Cap',
    value:  73,
    pct:    0.73,
    min:    'Clean  0',
    max:    'Wanted  100',
    note:   'Deny transit above 73 · override: CRIT contract',
    unit:   '73',
  },
  {
    label:  'Toll Bracket',
    value:  28,
    pct:    0.28,
    min:    'Free  (Ally)',
    max:    '10×  (Enemy)',
    note:   'Neutral pass at 2.0× base · approx 14M ISK / transit',
    unit:   '2.0×',
  },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props { data?: FwData; }

export function PolicyView({ data: _data }: Props = {}) {
  return (
    <>
      <div className="c-view__title">Gate Policy Editor · GATE#7720</div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 48, maxWidth: 900, marginBottom: 48,
      }}>
        {POLICIES.map(p => (
          <div key={p.label} className="c-policy">
            <div className="c-policy__label">{p.label}</div>
            <div className="c-policy__value">{p.unit}</div>
            <div className="c-policy__track">
              <div className="c-policy__fill" style={{ width: `${p.pct * 100}%` }} />
              <div className="c-policy__thumb" style={{ left: `${p.pct * 100}%` }} />
            </div>
            <div className="c-policy__range">
              <span>{p.min}</span>
              <span>{p.max}</span>
            </div>
            <div style={{
              marginTop: 10, fontSize: 9,
              color: 'var(--c-mid)', lineHeight: 1.6,
            }}>
              {p.note}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        paddingTop: 24,
        borderTop: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <button className="c-commit">SEAL & COMMIT</button>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>
          Attestor: WRDN-7 · block 18,402,114 · Editor: Vex Korith
        </span>
      </div>
    </>
  );
}
