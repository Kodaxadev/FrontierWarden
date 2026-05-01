// SystemStatus — Left column · top panel.
// Field report: 5 systems, heat dots, sov, gate count, kills/24h.

import { FwPanel, ClsHeader, DocFootC, FwHeat } from './fw-atoms';
import { useEveSystemNames } from '../../../hooks/useEveSystemNames';
import type { FwData } from './fw-data';

interface SystemStatusProps { data: FwData; }

export function SystemStatus({ data }: SystemStatusProps) {
  const { systems, pilot } = data;
  const resolveSystemName = useEveSystemNames();

  return (
    <FwPanel style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
      <ClsHeader
        priority="MED"
        label="FIELD REPORT · SOV TIER-1"
        classification="DOC-A1 · 5 SYS"
        accent="var(--sui-cyan)"
        right={
          <span className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)' }}>
            upd 07:32:14Z
          </span>
        }
      />

      {/* Column header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr 64px 56px 60px',
        gap: 8, padding: '4px 12px',
        borderBottom: '1px solid var(--b-05)',
        flexShrink: 0,
      }}>
        <span />
        <span className="fw-data-label">System</span>
        <span className="fw-data-label" style={{ textAlign: 'right' }}>Sov</span>
        <span className="fw-data-label" style={{ textAlign: 'right' }}>Gates</span>
        <span className="fw-data-label" style={{ textAlign: 'right' }}>Kills/24</span>
      </div>

      {/* Data rows */}
      {systems.map((s, i) => {
        const isHot = s.kills24 > 30;
        const isMid = s.kills24 > 8 && !isHot;
        const killColor = isHot ? 'var(--tribe-crimson)' : isMid ? 'var(--frontier-amber)' : 'var(--t-secondary)';
        const isMine = s.sov === pilot.syndicate;
        const eveName = resolveSystemName(s.id);

        return (
          <div key={s.id} style={{
            display: 'grid',
            gridTemplateColumns: '14px 1fr 64px 56px 60px',
            gap: 8, padding: '6px 12px',
            borderBottom: i < systems.length - 1 ? '1px solid var(--b-05)' : 'none',
            alignItems: 'center',
            background: i === 0 ? 'rgba(239,68,68,0.06)' : 'transparent',
            borderLeft: i === 0 ? '3px solid var(--tribe-crimson)' : '3px solid transparent',
          }}>
            <FwHeat level={s.heat} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="fw-mono" style={{ fontSize: 12, color: 'var(--t-primary)' }}>
                {eveName ?? s.name}
              </span>
              <span className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)', letterSpacing: '0.06em' }}>
                {eveName ? s.id : s.id}
              </span>
            </div>
            <span className="fw-mono" style={{
              fontSize: 9, textAlign: 'right',
              color: isMine ? 'var(--frontier-amber)' : 'var(--t-secondary)',
            }}>
              {s.sov.replace('Compact', '').replace('Vanguard', 'V').slice(0, 9)}
            </span>
            <span className="fw-mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--t-secondary)' }}>
              {s.gates}
            </span>
            <span className="fw-mono" style={{
              fontSize: 12, textAlign: 'right', color: killColor,
              textShadow: isHot ? '0 0 8px var(--tribe-crimson-glow)' : 'none',
            }}>
              {s.kills24}
            </span>
          </div>
        );
      })}

      <DocFootC>
        <span>// section_a1.report</span>
        <span>SHA 0x91…f73c</span>
      </DocFootC>
    </FwPanel>
  );
}
