// IntelPanel -- Gate system intel lookup via GET /intel/:systemId.
// Each schema row always has its left border color, regardless of data presence.
// Null entries show a dash (--) rather than a redacted block.

import { useState } from 'react';
import { useIntel } from '../../hooks/useIntel';
import { Panel } from '../ui/Panel';
import { ThreatBadge } from '../ui/StatusBadge';
import { AddressChip } from '../ui/AddressChip';
import { SkeletonRows } from '../ui/Skeleton';
import { RadarIcon } from '../ui/Icons';
import { systemThreatLevel } from '../../types/api.types';
import type { GateIntelEntry } from '../../types/api.types';
import { fmtScore, timeAgo } from '../../lib/format';

const DEFAULT_SYSTEM = '0x0000000000000000000000000000000000000000000000000000000000001111';

const INTEL_SCHEMAS = [
  'gate_hostile', 'gate_camped', 'gate_clear', 'gate_toll',
  'heat_trap', 'route_verified', 'system_contested',
] as const;

type IntelKey = typeof INTEL_SCHEMAS[number];

interface SchemaCfg {
  label:  string;
  color:  string;   // text color for values
  border: string;   // left border class -- always rendered
}

const SCHEMA_DISPLAY: Record<IntelKey, SchemaCfg> = {
  gate_hostile:     { label: 'GATE HOSTILE',   color: 'text-frontier-crimson', border: 'border-l-frontier-crimson/55' },
  gate_camped:      { label: 'GATE CAMPED',    color: 'text-frontier-amber',   border: 'border-l-frontier-amber/50'   },
  gate_clear:       { label: 'GATE CLEAR',     color: 'text-status-clear',     border: 'border-l-status-clear/50'     },
  gate_toll:        { label: 'TOLL  (MIST)',   color: 'text-frontier-gold',    border: 'border-l-frontier-gold/45'    },
  heat_trap:        { label: 'HEAT INDEX',     color: 'text-frontier-amber',   border: 'border-l-frontier-amber/50'   },
  route_verified:   { label: 'ROUTE VERIFIED', color: 'text-standing-ally',    border: 'border-l-standing-ally/50'    },
  system_contested: { label: 'CONTESTED',      color: 'text-alloy-silver',     border: 'border-l-alloy-silver/30'     },
};

export function IntelPanel({ className }: { className?: string }) {
  const [inputVal, setInputVal] = useState(DEFAULT_SYSTEM);
  const [systemId, setSystemId] = useState(DEFAULT_SYSTEM);

  const { data, loading, error, refresh } = useIntel(systemId);
  const threatLevel = data ? systemThreatLevel(data) : 'unknown';

  return (
    <Panel
      className={className}
      title="Gate Intel"
      subtitle={`SYS ${systemId.slice(-8).toUpperCase()}`}
      icon={<RadarIcon className="w-4 h-4" />}
      accent="amber"
      headerRight={
        <button
          onClick={refresh}
          className="px-2 py-0.5 text-[9px] font-mono rounded border border-void-500/50 text-void-500 hover:text-sui-cyan hover:border-sui-cyan/40 transition-colors"
        >
          RESCAN
        </button>
      }
    >
      {/* System ID input */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSystemId(inputVal.trim()); }}
        className="flex gap-1.5 px-4 py-2.5 border-b border-void-700/60"
      >
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="system_id (0x...)"
          className={[
            'flex-1 px-2 py-1 rounded font-mono text-[10px]',
            'bg-void-900 border border-void-500/60 text-alloy-silver/80',
            'focus:outline-none focus:border-sui-cyan/60 placeholder:text-void-500/50',
          ].join(' ')}
        />
        <button
          type="submit"
          className="px-3 py-1 text-[9px] font-mono rounded border border-sui-cyan/30 text-sui-cyan hover:bg-sui-cyan/10 transition-colors"
        >
          SCAN
        </button>
      </form>

      {/* Threat summary bar */}
      {data && !loading && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-void-700/60 bg-void-900/40">
          <ThreatBadge level={threatLevel} compact />
          <span className="font-mono text-[9px] text-void-500/55 ml-auto tracking-wider">
            {data.system_id.slice(-16).toUpperCase()}
          </span>
        </div>
      )}

      {loading && <SkeletonRows cols={[2, 1, 2]} rows={5} />}
      {error && (
        <div className="px-4 py-4 font-mono text-[11px] text-frontier-crimson/70">{error}</div>
      )}

      {data && !loading && (
        <ul className="divide-y divide-void-700/40">
          {INTEL_SCHEMAS.map((key) => {
            const entry = data[key] as GateIntelEntry | null;
            const cfg   = SCHEMA_DISPLAY[key];
            return <IntelRow key={key} cfg={cfg} entry={entry} />;
          })}
        </ul>
      )}
    </Panel>
  );
}

// ── Intel row ─────────────────────────────────────────────────────────────────

function IntelRow({
  cfg,
  entry,
}: {
  cfg:   SchemaCfg;
  entry: GateIntelEntry | null;
}) {
  return (
    <li
      className={[
        'border-l-2 flex items-start justify-between gap-2 px-4 py-2',
        'hover:bg-void-700/35 transition-colors',
        cfg.border,
      ].join(' ')}
    >
      {/* Schema label -- dim when no data */}
      <span
        className={[
          'font-mono text-[10px] shrink-0 pt-0.5',
          entry ? cfg.color : 'text-void-500/40',
        ].join(' ')}
      >
        {cfg.label}
      </span>

      {entry ? (
        <div className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-[12px] font-semibold tabular-nums ${cfg.color}`}>
            {fmtScore(entry.value)}
          </span>
          <div className="flex items-center gap-1.5">
            <AddressChip address={entry.issuer} chars={3} />
            <span className="font-mono text-[8px] text-void-500/40">
              {timeAgo(entry.issued_at)}
            </span>
          </div>
        </div>
      ) : (
        /* Dash -- distinguishable from active data, not a mystery block */
        <span className="font-mono text-[13px] text-void-500/25 leading-none mt-0.5">
          &mdash;
        </span>
      )}
    </li>
  );
}
