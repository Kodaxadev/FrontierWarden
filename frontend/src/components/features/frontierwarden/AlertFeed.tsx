// AlertFeed — P1 fix: visible threat/alert feed with action hints.
// Shows FwAlert items with severity coloring and operator-relevant context.

import type { FwAlert } from './fw-data';

interface Props {
  alerts: FwAlert[];
  onNavigateGateOps?: () => void;
}

const LVL_STYLE: Record<FwAlert['lvl'], { color: string; bg: string; label: string }> = {
  CRIT: { color: 'var(--c-crimson, #ff5568)', bg: 'rgba(255,85,104,0.06)', label: 'CRIT' },
  WARN: { color: 'var(--c-amber, #E8782A)', bg: 'rgba(232,120,42,0.04)', label: 'WARN' },
  INFO: { color: 'var(--c-mid)', bg: 'rgba(255,255,255,0.012)', label: 'INFO' },
};

export function AlertFeed({ alerts, onNavigateGateOps }: Props) {
  if (alerts.length === 0) return null;

  const crits = alerts.filter(a => a.lvl === 'CRIT');
  const warns = alerts.filter(a => a.lvl === 'WARN');
  const infos = alerts.filter(a => a.lvl === 'INFO');
  const sorted = [...crits, ...warns, ...infos];

  return (
    <section style={{
      marginBottom: 20,
      border: '1px solid var(--c-border)',
      background: 'rgba(255,255,255,0.01)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--c-border)',
        fontSize: 10, letterSpacing: '0.1em', color: 'var(--c-mid)',
      }}>
        <span>
          THREAT FEED
          {crits.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--c-crimson)', fontWeight: 700 }}>
              {crits.length} CRITICAL
            </span>
          )}
        </span>
        {onNavigateGateOps && crits.length > 0 && (
          <button
            onClick={onNavigateGateOps}
            style={{
              all: 'unset', cursor: 'pointer',
              fontSize: 10, color: 'var(--c-amber)',
              letterSpacing: '0.06em',
            }}
          >
            OPEN GATE OPS →
          </button>
        )}
      </div>

      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {sorted.map((alert, i) => {
          const style = LVL_STYLE[alert.lvl];
          return (
            <div
              key={`${alert.t}-${i}`}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '6px 14px',
                background: style.bg,
                borderBottom: '1px solid var(--c-border)',
                fontSize: 11,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: style.color, letterSpacing: '0.08em',
                minWidth: 32,
              }}>
                {style.label}
              </span>
              <span style={{ color: 'var(--c-mid)', fontSize: 10, minWidth: 64 }}>
                {alert.t}
              </span>
              <span style={{ color: 'var(--c-hi)', flex: 1 }}>
                {alert.msg}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
