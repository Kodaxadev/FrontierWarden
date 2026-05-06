// SentinelChangeFeed — Recent changes timeline for the node.
// Shows: new profiles, attestations, challenges, policy changes, oracle gaps.

import type { RecentChange, RiskSeverity } from '../../../../types/node-sentinel.types';

interface Props {
  changes: RecentChange[];
}

const KIND_LABEL: Record<string, string> = {
  profile_linked:      'PROFILE LINKED',
  attestation_new:     'NEW ATTESTATION',
  attestation_revoked: 'ATTESTATION REVOKED',
  challenge_opened:    'CHALLENGE OPENED',
  challenge_resolved:  'CHALLENGE RESOLVED',
  policy_changed:      'POLICY CHANGED',
  oracle_gap:          'ORACLE GAP',
  object_stale:        'STALE OBJECT',
};

const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  critical: 'ns-change--critical',
  high:     'ns-change--high',
  medium:   'ns-change--medium',
  low:      'ns-change--low',
  info:     'ns-change--info',
};

export function SentinelChangeFeed({ changes }: Props) {
  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">RECENT CHANGES</span>
        <span className="ns-count">{changes.length}</span>
      </div>

      {changes.length === 0 ? (
        <div className="ns-empty">No recent activity</div>
      ) : (
        <div className="ns-change-list">
          {changes.map((change, i) => (
            <div key={i} className={`ns-change-row ${SEVERITY_CLASS[change.severity]}`}>
              <div className="ns-change-time">
                {change.timestamp || '—'}
              </div>
              <div className="ns-change-kind">
                {KIND_LABEL[change.kind] ?? change.kind.toUpperCase()}
              </div>
              <div className="ns-change-summary">
                {change.summary}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
