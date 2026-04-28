// ThreatFeed — Left column · bottom panel.
// Live alert stream: CRIT / WARN / INFO rows with color-coded left borders.

import { FwPanel, ClsHeader } from './fw-atoms';
import type { FwData, FwAlert } from './fw-data';

function alertColor(lvl: FwAlert['lvl']): string {
  switch (lvl) {
    case 'CRIT': return 'var(--tribe-crimson)';
    case 'WARN': return 'var(--frontier-amber)';
    default:     return 'var(--alloy-silver)';
  }
}

interface ThreatFeedProps { data: FwData; }

export function ThreatFeed({ data }: ThreatFeedProps) {
  return (
    <FwPanel
      accentColor="var(--tribe-crimson)"
      style={{
        borderLeft: 'none', borderRight: 'none',
        boxShadow: '0 -1px 0 var(--tribe-crimson-glow)',
      }}
    >
      <ClsHeader
        priority="CRIT"
        label="THREAT FEED · WS://INTEL"
        classification="LIVE"
        accent="var(--tribe-crimson)"
        right={
          <span className="fw-anno" style={{ fontSize: 9 }}>120ms FADE-IN</span>
        }
      />

      {data.alerts.map((a, i) => {
        const c = alertColor(a.lvl);
        return (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '50px 60px 1fr',
            gap: 10, padding: '8px 12px',
            borderBottom: i < data.alerts.length - 1 ? '1px dashed var(--b-08)' : 'none',
            borderLeft: `3px solid ${c}`,
            background: `${c}08`,
            alignItems: 'center',
          }}>
            <span className="fw-mono" style={{
              fontSize: 9, letterSpacing: '0.12em', color: c, textAlign: 'center',
              padding: '1px 4px', border: `1px solid ${c}80`, background: `${c}20`,
              textShadow: `0 0 8px ${c}40`,
            }}>
              {a.lvl}
            </span>
            <span className="fw-mono" style={{ fontSize: 10, color: 'var(--t-muted)' }}>
              {a.t}
            </span>
            <span className="fw-mono" style={{ fontSize: 11, color: 'var(--t-primary)', lineHeight: 1.3 }}>
              {a.msg}
            </span>
          </div>
        );
      })}
    </FwPanel>
  );
}
