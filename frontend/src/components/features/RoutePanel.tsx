// RoutePanel.tsx -- Tactical route planner UI.
//
// Ship selector, cargo slider, origin/destination node pickers, avoid-hostile
// toggle. Displays computed route as an ordered hop list with threat badges
// and a jump/cost summary. Feeds highlightedPath up to App for GateMap overlay.
//
// Visual language: amber accent (navigation), monospace data, classified feel.

import { Panel }              from '../ui/Panel';
import { ThreatBadge }        from '../ui/StatusBadge';
import { useRoutePlanner }    from '../../hooks/useRoutePlanner';
import { NODES, threatOf }    from '../../lib/gate-data';
import { SHIP_CLASSES }       from '../../lib/ship-specs';
import type { RouteWarning }  from '../../lib/route-graph';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RoutePanelProps {
  /** Called whenever the computed route path changes. App uses this to
   *  highlight the path on GateMap. */
  onRouteChange: (path: string[]) => void;
}

// ---------------------------------------------------------------------------
// Warning copy
// ---------------------------------------------------------------------------

const WARNING_COPY: Record<RouteWarning, string> = {
  hostile_on_path:   'HOSTILE GATE ON ROUTE',
  camped_on_path:    'CAMPED SYSTEM ON ROUTE',
  heat_trap_warning: 'HEAT TRAP -- SMART GATE ONLY',
};

const WARNING_COLOR: Record<RouteWarning, string> = {
  hostile_on_path:   'text-frontier-crimson',
  camped_on_path:    'text-frontier-amber',
  heat_trap_warning: 'text-frontier-gold',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeSelect({
  label,
  value,
  onChange,
}: {
  label:    string;
  value:    string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex-1">
      <label className="block font-mono text-[9px] text-void-500/55 tracking-widest mb-0.5 uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={[
          'w-full bg-void-700 border border-void-500/60 rounded px-2 py-1',
          'font-mono text-[10px] text-alloy-silver',
          'focus:outline-none focus:border-frontier-amber/50',
        ].join(' ')}
      >
        {NODES.map(n => (
          <option key={n.id} value={n.id}>{n.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RoutePanel({ onRouteChange }: RoutePanelProps) {
  const planner = useRoutePlanner();
  const { result } = planner;

  // Propagate route path to parent on every render where result changed
  const path = result?.path ?? [];

  // Call parent synchronously via effect-free callback pattern:
  // parent receives the path on the next render cycle
  if (path.length !== (result?.path?.length ?? 0) || path.join() !== (result?.path ?? []).join()) {
    onRouteChange(path);
  }
  // Simpler: just call inline -- React batches this render pass
  onRouteChange(path);

  return (
    <Panel
      title="ROUTE PLANNER"
      subtitle="threat-weighted A* pathfinding"
      accent="amber"
      className="shrink-0"
    >
      <div className="px-3 py-2.5 space-y-2.5">

        {/* Ship + cargo row */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block font-mono text-[9px] text-void-500/55 tracking-widest mb-0.5 uppercase">
              Ship Class
            </label>
            <select
              value={planner.ship}
              onChange={e => planner.setShip(e.target.value as typeof planner.ship)}
              className={[
                'w-full bg-void-700 border border-void-500/60 rounded px-2 py-1',
                'font-mono text-[10px] text-alloy-silver',
                'focus:outline-none focus:border-frontier-amber/50',
              ].join(' ')}
            >
              {SHIP_CLASSES.map(s => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="w-20">
            <label className="block font-mono text-[9px] text-void-500/55 tracking-widest mb-0.5 uppercase">
              Cargo %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(planner.cargoFrac * 100)}
              onChange={e => planner.setCargoFrac(Number(e.target.value) / 100)}
              className={[
                'w-full bg-void-700 border border-void-500/60 rounded px-2 py-1',
                'font-mono text-[10px] text-alloy-silver',
                'focus:outline-none focus:border-frontier-amber/50',
              ].join(' ')}
            />
          </div>
        </div>

        {/* Origin / Destination selectors */}
        <div className="flex gap-1.5 items-end">
          <NodeSelect label="Origin"      value={planner.fromId} onChange={planner.setFrom} />
          <button
            onClick={planner.swapEndpoints}
            className="mb-0.5 px-1.5 py-1 font-mono text-[11px] text-void-500/50 hover:text-frontier-amber transition-colors"
            aria-label="Swap origin and destination"
          >
            {'<>'}
          </button>
          <NodeSelect label="Destination" value={planner.toId}   onChange={planner.setTo} />
        </div>

        {/* Options row */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={planner.avoidHostile}
            onChange={planner.toggleAvoid}
            className="accent-frontier-amber"
          />
          <span className="font-mono text-[9px] text-void-500/60 tracking-widest uppercase">
            Avoid Hostile Gates
          </span>
        </label>

        {/* Divider */}
        <div className="border-t border-void-500/30" />

        {/* Route result */}
        {planner.invalid && (
          <p className="font-mono text-[9px] text-void-500/35 tracking-wider text-center py-1">
            SELECT ORIGIN AND DESTINATION
          </p>
        )}

        {!planner.invalid && !result && (
          <p className="font-mono text-[9px] text-frontier-crimson/70 tracking-wider text-center py-1">
            NO ROUTE AVAILABLE -- ALL PATHS BLOCKED
          </p>
        )}

        {result && (
          <div className="space-y-1.5">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-void-500/55 tracking-widest">ROUTE</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-frontier-amber tabular-nums">
                  {result.jumpCount} JUMP{result.jumpCount !== 1 ? 'S' : ''}
                </span>
                <span className="font-mono text-[9px] text-void-500/40 tabular-nums">
                  COST {result.totalCost.toFixed(0)}
                </span>
              </div>
            </div>

            {/* Hop list */}
            <ol className="space-y-0.5" role="list">
              {result.path.map((nodeId, idx) => {
                const node    = NODES.find(n => n.id === nodeId);
                const threat  = threatOf(nodeId);
                const isLast  = idx === result.path.length - 1;
                return (
                  <li
                    key={nodeId}
                    className="flex items-center gap-2"
                  >
                    <span className="font-mono text-[9px] text-void-500/35 w-4 shrink-0 tabular-nums text-right">
                      {idx === 0 ? 'O' : isLast ? 'D' : String(idx)}
                    </span>
                    <span className={[
                      'font-mono text-[11px] flex-1',
                      threat === 'hostile' ? 'text-frontier-crimson' :
                      threat === 'camped'  ? 'text-frontier-amber'   :
                      threat === 'clear'   ? 'text-status-clear'     :
                                              'text-alloy-silver/60',
                    ].join(' ')}>
                      {node?.label ?? nodeId}
                    </span>
                    <ThreatBadge level={threat} />
                    {!isLast && (
                      <span className="font-mono text-[9px] text-void-500/25">v</span>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-0.5 pt-1 border-t border-void-500/25">
                {result.warnings.map(w => (
                  <p key={w} className={'font-mono text-[9px] tracking-widest ' + WARNING_COLOR[w]}>
                    ! {WARNING_COPY[w]}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
