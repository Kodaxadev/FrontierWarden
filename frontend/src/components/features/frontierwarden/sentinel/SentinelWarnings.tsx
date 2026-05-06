// SentinelWarnings — Live warnings feed for the node trust perimeter.
// Shows missing data, stale signals, fraud challenges, policy gaps.

import type { RiskFinding, RiskSeverity } from '../../../../types/node-sentinel.types';

interface Props {
  warnings: RiskFinding[];
}

const SEVERITY_ICON: Record<RiskSeverity, string> = {
  critical: '◆',
  high:     '▲',
  medium:   '●',
  low:      '○',
  info:     '·',
};

const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  critical: 'ns-warn--critical',
  high:     'ns-warn--high',
  medium:   'ns-warn--medium',
  low:      'ns-warn--low',
  info:     'ns-warn--info',
};

export function SentinelWarnings({ warnings }: Props) {
  const sorted = [...warnings].sort((a, b) => {
    const order: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">LIVE WARNINGS</span>
        <span className="ns-count">
          {warnings.length === 0 ? 'CLEAR' : `${warnings.length} ACTIVE`}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="ns-empty ns-empty--ok">No active warnings</div>
      ) : (
        <div className="ns-warn-list">
          {sorted.map((w, i) => (
            <div key={w.id ?? i} className={`ns-warn-row ${SEVERITY_CLASS[w.severity]}`}>
              <span className="ns-warn-icon">
                {SEVERITY_ICON[w.severity]}
              </span>
              <div className="ns-warn-body">
                <span className="ns-warn-title">{w.title}</span>
                <span className="ns-warn-detail">{w.detail}</span>
              </div>
              <span className="ns-warn-category">{w.category.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
