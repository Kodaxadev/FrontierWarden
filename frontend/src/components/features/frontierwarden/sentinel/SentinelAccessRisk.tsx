// SentinelAccessRisk — Per-assembly-type risk assessment grid.
// Storage, Gate Policy, Trade, Counterparty Risk — each with severity.

import type { AccessRiskSummary, RiskLevel } from '../../../../types/node-sentinel.types';

interface Props {
  accessRisk: AccessRiskSummary;
}

const RISK_DISPLAY: Record<string, { label: string; cls: string }> = {
  low:      { label: 'LOW',      cls: 'ns-risk--low' },
  medium:   { label: 'MEDIUM',   cls: 'ns-risk--medium' },
  high:     { label: 'HIGH',     cls: 'ns-risk--high' },
  unknown:  { label: 'UNKNOWN',  cls: 'ns-risk--unknown' },
  unlinked: { label: 'UNLINKED', cls: 'ns-risk--unlinked' },
};

function riskDisplay(level: RiskLevel | 'unlinked') {
  return RISK_DISPLAY[level] ?? RISK_DISPLAY.unknown;
}

export function SentinelAccessRisk({ accessRisk }: Props) {
  const risks = [
    { label: 'STORAGE',          level: accessRisk.storage },
    { label: 'GATE POLICY',      level: accessRisk.gatePolicy },
    { label: 'TRADE',            level: accessRisk.trade },
    { label: 'COUNTERPARTY',     level: accessRisk.counterpartyRisk },
  ];

  const overall = riskDisplay(accessRisk.overallRisk);

  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">ACCESS RISK</span>
        <span className={`ns-overall-badge ${overall.cls}`}>
          {overall.label}
        </span>
      </div>

      <div className="ns-risk-grid">
        {risks.map(r => {
          const d = riskDisplay(r.level);
          return (
            <div key={r.label} className="ns-risk-row">
              <span className="ns-risk-row__label">{r.label}</span>
              <span className={`ns-risk-row__level ${d.cls}`}>
                <span className="ns-risk-dot" />
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
