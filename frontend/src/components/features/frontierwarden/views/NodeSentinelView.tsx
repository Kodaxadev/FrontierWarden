// NodeSentinelView — Phase 1 immersive single-screen console.
// Centered on a Network Node: status, trust perimeter, identity graph,
// risk feed, policy recommendations, missing-data warnings.
// No enforcement claims — advisory mode only.

import { useNodeSentinel } from '../../../../hooks/useNodeSentinel';
import { SentinelNodeStatus } from '../sentinel/SentinelNodeStatus';
import { SentinelIdentityGraph } from '../sentinel/SentinelIdentityGraph';
import { SentinelAccessRisk } from '../sentinel/SentinelAccessRisk';
import { SentinelWarnings } from '../sentinel/SentinelWarnings';
import { SentinelRecommendations } from '../sentinel/SentinelRecommendations';
import { SentinelChangeFeed } from '../sentinel/SentinelChangeFeed';
import type { FwData } from '../fw-data';
import type { EveIdentity } from '../../../../types/api.types';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  eveIdentity?: EveIdentity | null;
}

export function NodeSentinelView({ data, live, loading, error, eveIdentity }: Props) {
  const sentinel = useNodeSentinel({ data, live, loading, error, eveIdentity });

  if (sentinel.loading) {
    return (
      <div className="ns-root">
        <div className="ns-loading">
          <span className="ns-loading__dot" />
          INITIALIZING NODE SENTINEL…
        </div>
      </div>
    );
  }

  const { node, perimeter, accessRisk, recommendations, enforcement, recentChanges, warnings } = sentinel;

  return (
    <div className="ns-root">
      {/* Terminal Header */}
      <div className="ns-terminal-header">
        <div className="ns-terminal-header__brand">
          <span className="ns-terminal-header__logo">◈</span>
          <span className="ns-terminal-header__title">FRONTIERWARDEN</span>
          <span className="ns-terminal-header__sep">//</span>
          <span className="ns-terminal-header__subtitle">NODE SENTINEL</span>
        </div>
        <div className="ns-terminal-header__status">
          <span className={`ns-dot ${node.status === 'online' ? 'ns-glow--green' : 'ns-glow--amber'}`} />
          <span className="ns-terminal-header__mode">
            {enforcement.mode === 'none' ? 'ADVISORY ONLY' : enforcement.mode.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {sentinel.error && (
        <div className="ns-error-banner">
          INDEXER ERROR — {sentinel.error}
        </div>
      )}

      {/* Main grid — two columns on wide, stacked on narrow */}
      <div className="ns-grid">
        {/* Left column — Node status + Identity graph + Change feed */}
        <div className="ns-col">
          <SentinelNodeStatus
            node={node}
            perimeter={perimeter}
            enforcement={enforcement}
          />
          <SentinelIdentityGraph perimeter={perimeter} />
          <SentinelChangeFeed changes={recentChanges} />
        </div>

        {/* Right column — Access risk + Warnings + Recommendations */}
        <div className="ns-col">
          <SentinelAccessRisk accessRisk={accessRisk} />
          <SentinelWarnings warnings={warnings} />
          <SentinelRecommendations
            recommendations={recommendations}
            enforcement={enforcement}
          />
        </div>
      </div>

      {/* Terminal footer */}
      <div className="ns-terminal-footer">
        <span className="ns-terminal-footer__text">
          FRONTIERWARDEN v1.0 — NODE SENTINEL
        </span>
        <span className="ns-terminal-footer__sep">·</span>
        <span className="ns-terminal-footer__text">
          {perimeter.knownCharacters.length} PROFILES IN PERIMETER
        </span>
        <span className="ns-terminal-footer__sep">·</span>
        <span className="ns-terminal-footer__text">
          {warnings.length} WARNING{warnings.length !== 1 ? 'S' : ''}
        </span>
        <span className="ns-terminal-footer__spacer" />
        <span className="ns-terminal-footer__text ns-terminal-footer__eyes">
          FOR YOUR EYES ONLY
        </span>
      </div>
    </div>
  );
}
