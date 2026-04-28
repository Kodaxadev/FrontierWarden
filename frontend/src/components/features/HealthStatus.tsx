// HealthStatus -- top-bar system status strip.
// Segment-bordered layout with proper twin-layer animate-ping beacon
// (mirrors Panel's live indicator pattern for visual consistency).

import { useHealth } from '../../hooks/useHealth';
import { fmtUptime, truncAddr } from '../../lib/format';
import type { ReactNode } from 'react';

const PKG_ID = import.meta.env.VITE_PKG_ID ?? '';

export function HealthStatus() {
  const { data, online, loading } = useHealth();

  return (
    <div
      className="flex items-stretch shrink-0 bg-void-800 border-b border-void-500 overflow-x-auto"
      role="status"
      aria-live="polite"
      aria-label="System status"
    >
      {/* Primary status -- beacon dot + label */}
      <StatusSegment>
        <span className="relative flex shrink-0 w-2 h-2">
          {/* Expanding ring -- only when online */}
          {online && !loading && (
            <span className="absolute inset-0 rounded-full bg-status-clear animate-ping opacity-45" />
          )}
          {/* Static core dot */}
          <span
            className={[
              'relative w-2 h-2 rounded-full',
              loading  ? 'bg-void-500 animate-pulse' :
              online   ? 'bg-status-clear' :
                         'bg-frontier-crimson',
            ].join(' ')}
          />
        </span>
        <span
          className={[
            'font-mono text-[10px] tracking-wider whitespace-nowrap',
            loading  ? 'text-void-500' :
            online   ? 'text-status-clear' :
                       'text-frontier-crimson/80',
          ].join(' ')}
        >
          {loading ? 'CONNECTING' : online ? 'INDEXER ONLINE' : 'INDEXER OFFLINE'}
        </span>
      </StatusSegment>

      {/* Uptime -- only when connected */}
      {data && (
        <StatusSegment>
          <StatLabel label="UPTIME" />
          <span className="font-mono text-[10px] text-alloy-silver/70 tabular-nums">
            {fmtUptime(data.uptime_secs)}
          </span>
        </StatusSegment>
      )}

      {/* Package ID */}
      {PKG_ID && (
        <StatusSegment>
          <StatLabel label="PKG" />
          <span
            className="font-mono text-[10px] text-alloy-silver/55 hover:text-sui-cyan transition-colors cursor-default"
            title={PKG_ID}
          >
            {truncAddr(PKG_ID, 6)}
          </span>
        </StatusSegment>
      )}

      {/* Network */}
      <StatusSegment>
        <StatLabel label="NET" />
        <span className="font-mono text-[10px] text-frontier-amber tracking-wider">DEVNET</span>
      </StatusSegment>

      {/* Right spacer -- pushes segments left */}
      <div className="flex-1 border-r border-void-500/0" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusSegment({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-r border-void-500/40 shrink-0">
      {children}
    </div>
  );
}

function StatLabel({ label }: { label: string }) {
  return (
    <span className="font-mono text-[9px] text-void-500/60 tracking-widest">{label}</span>
  );
}
