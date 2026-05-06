// SentinelRecommendations — Policy recommendations for the node operator.
// Each recommendation is clearly labeled advisory-only when enforcement is unavailable.

import type { PolicyRecommendation, EnforcementStatus } from '../../../../types/node-sentinel.types';

interface Props {
  recommendations: PolicyRecommendation[];
  enforcement: EnforcementStatus;
}

const ACTION_LABEL: Record<string, { text: string; cls: string }> = {
  allow:                  { text: 'ALLOW',               cls: 'ns-action--allow' },
  deny:                   { text: 'DENY',                cls: 'ns-action--deny' },
  manual_review:          { text: 'MANUAL REVIEW',       cls: 'ns-action--review' },
  raise_threshold:        { text: 'RAISE THRESHOLD',     cls: 'ns-action--review' },
  require_attestation:    { text: 'REQUIRE ATTESTATION', cls: 'ns-action--review' },
  require_tribe_approval: { text: 'TRIBE APPROVAL',      cls: 'ns-action--review' },
};

const TARGET_LABEL: Record<string, string> = {
  storage: 'STORAGE',
  gate: 'GATE',
  trade: 'TRADE',
  defense: 'DEFENSE',
  tribe: 'TRIBE',
};

export function SentinelRecommendations({ recommendations, enforcement }: Props) {
  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">RECOMMENDED ACTIONS</span>
        {!enforcement.canEnforce && (
          <span className="ns-advisory-badge">ADVISORY ONLY</span>
        )}
      </div>

      {!enforcement.canEnforce && (
        <div className="ns-advisory-notice">
          ADVISORY ONLY — no confirmed world-gate binding. Recommendations cannot be enforced on-chain.
        </div>
      )}

      {recommendations.length === 0 ? (
        <div className="ns-empty">No active recommendations</div>
      ) : (
        <div className="ns-rec-list">
          {recommendations.map((rec, i) => {
            const action = ACTION_LABEL[rec.action] ?? ACTION_LABEL.manual_review;
            return (
              <div key={i} className="ns-rec-row">
                <div className="ns-rec-header">
                  <span className="ns-rec-target">
                    {TARGET_LABEL[rec.targetType] ?? rec.targetType.toUpperCase()}
                  </span>
                  <span className={`ns-rec-action ${action.cls}`}>
                    {action.text}
                  </span>
                  <span className="ns-rec-confidence">
                    {Math.round(rec.confidence * 100)}%
                  </span>
                </div>

                <div className="ns-rec-reasons">
                  {rec.reasonCodes.map((code, j) => (
                    <span key={j} className="ns-rec-code">{code}</span>
                  ))}
                </div>

                {rec.evidence.length > 0 && (
                  <div className="ns-rec-evidence">
                    {rec.evidence.map((e, j) => (
                      <div key={j} className="ns-rec-evidence-line">▸ {e}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
