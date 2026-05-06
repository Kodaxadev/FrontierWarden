// SentinelNodeStatus — Node identity & status header block.
// Shows: Node ID, system, tribe, power, trust fabric status, enforcement mode.

import type { WardenNode, TrustPerimeter, EnforcementStatus } from '../../../../types/node-sentinel.types';

interface Props {
  node: WardenNode;
  perimeter: TrustPerimeter;
  enforcement: EnforcementStatus;
}

const STATUS_COLOR: Record<string, string> = {
  online: 'ns-glow--green',
  offline: 'ns-glow--red',
  unknown: 'ns-glow--amber',
  low: 'ns-glow--amber',
};

const FABRIC_LABEL: Record<string, string> = {
  healthy: 'NOMINAL',
  degraded: 'DEGRADED',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
};

const FABRIC_COLOR: Record<string, string> = {
  healthy: 'ns-val--green',
  degraded: 'ns-val--amber',
  critical: 'ns-val--red',
  unknown: 'ns-val--dim',
};

export function SentinelNodeStatus({ node, perimeter, enforcement }: Props) {
  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">NODE STATUS</span>
        <span className={`ns-dot ${STATUS_COLOR[node.status] ?? 'ns-glow--amber'}`} />
      </div>

      <div className="ns-kv-grid">
        <div className="ns-kv">
          <span className="ns-kv__k">NODE</span>
          <span className="ns-kv__v ns-mono">{shortId(node.nodeId)}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">SYSTEM</span>
          <span className="ns-kv__v">{node.systemName ?? '—'}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">TRIBE</span>
          <span className="ns-kv__v">{node.tribeName ?? 'Unaffiliated'}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">STATUS</span>
          <span className={`ns-kv__v ${STATUS_COLOR[node.status]}`}>
            {node.status.toUpperCase()}
          </span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">POWER</span>
          <span className={`ns-kv__v ${STATUS_COLOR[node.powerStatus]}`}>
            {node.powerStatus.toUpperCase()}
          </span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">TRUST FABRIC</span>
          <span className={`ns-kv__v ${FABRIC_COLOR[perimeter.trustFabricStatus]}`}>
            {FABRIC_LABEL[perimeter.trustFabricStatus]}
          </span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">POLICY MODE</span>
          <span className="ns-kv__v ns-val--amber">
            {enforcement.mode === 'none' ? 'ADVISORY ONLY' : enforcement.mode.toUpperCase()}
          </span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">ASSEMBLIES</span>
          <span className="ns-kv__v ns-mono">{node.connectedAssemblies.length}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">IDENTITY MAP</span>
          <span className="ns-kv__v ns-mono">
            {perimeter.identityCoverage.mapped}/{perimeter.identityCoverage.total}
          </span>
        </div>
      </div>

      {enforcement.blockers.length > 0 && (
        <div className="ns-enforcement-warn">
          <span className="ns-label ns-label--red">ENFORCEMENT BLOCKERS</span>
          {enforcement.blockers.map(b => (
            <div key={b} className="ns-blocker">{formatBlocker(b)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function formatBlocker(b: string): string {
  return b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
