// DiplomacyPanel.tsx -- Per-syndicate territorial intelligence and standings.
//
// Shows each syndicate's controlled node count, live TRIBE_STANDING score,
// and disposition toward every other syndicate.
// Data: useTribeStandings (live API) + tribe-data.ts (static topology).

import { useTribeStandings }  from '../../hooks/useTribeStandings';
import { Panel }              from '../ui/Panel';
import { SkeletonRows }       from '../ui/Skeleton';
import { TribeIcon }          from '../ui/Icons';
import {
  SYNDICATES,
  SYNDICATE_IDS,
  dispositionBetween,
  DISPOSITION_LABEL,
  DISPOSITION_COLOR,
  type SyndicateId,
}                             from '../../lib/tribe-data';
import { fmtScore }           from '../../lib/format';
import type { SyndicateStanding } from '../../hooks/useTribeStandings';

interface DiplomacyPanelProps {
  className?: string;
  /** Highlight this syndicate's row (e.g. the selected map node's controller). */
  highlightId?: SyndicateId | null;
}

export function DiplomacyPanel({ className, highlightId }: DiplomacyPanelProps) {
  const { syndicates, loading, error } = useTribeStandings();
  const maxScore = Math.max(...syndicates.map(s => s.totalScore), 1);

  return (
    <Panel
      title="Diplomatic Map"
      subtitle="/tribe/standings"
      icon={<TribeIcon className="w-4 h-4" />}
      live
      className={className}
    >
      {/* Column headers */}
      <div className="grid grid-cols-[26px_1fr_56px] px-4 py-1.5 border-b border-void-700/60">
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest" />
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest">SYNDICATE</span>
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest text-right">SCORE</span>
      </div>

      {loading && <SkeletonRows cols={[1, 3, 1]} rows={4} />}

      {error && (
        <div className="px-4 py-6 text-center font-mono text-[11px] text-frontier-crimson/70">
          {error}
        </div>
      )}

      {!loading && !error && (
        <ul role="list" className="divide-y divide-void-700/40">
          {syndicates.map((s) => (
            <SyndicateRow
              key={s.id}
              standing={s}
              maxScore={maxScore}
              highlighted={highlightId === s.id}
            />
          ))}
        </ul>
      )}

      {/* Standing matrix footer */}
      {!loading && !error && (
        <div className="px-4 py-3 border-t border-void-700/60">
          <span className="font-mono text-[9px] text-void-500/55 tracking-widest block mb-2">
            DISPOSITION MATRIX
          </span>
          <DispositionMatrix />
        </div>
      )}
    </Panel>
  );
}

// ── Syndicate row ─────────────────────────────────────────────────────────────

interface RowProps {
  standing:    SyndicateStanding;
  maxScore:    number;
  highlighted: boolean;
}

function SyndicateRow({ standing, maxScore, highlighted }: RowProps) {
  const syn  = SYNDICATES[standing.id];
  const pct  = Math.max((standing.totalScore / maxScore) * 100, 2);
  const nodeCount = syn.nodes.length;

  return (
    <li
      className={[
        'grid grid-cols-[26px_1fr_56px] items-center px-4 py-2.5',
        'border-l-2 transition-colors duration-150',
        highlighted
          ? 'bg-void-600/40'
          : 'hover:bg-void-700/40',
      ].join(' ')}
      style={{ borderLeftColor: syn.hexColor + '80' }}
    >
      {/* Color swatch */}
      <span
        className="w-2 h-2 rounded-sm shrink-0 mt-0.5"
        style={{ backgroundColor: syn.hexColor }}
        aria-hidden="true"
      />

      {/* Name + bar + node count */}
      <div className="flex flex-col gap-0.5 min-w-0 pr-3">
        <span
          className="font-mono text-[11px] font-semibold truncate"
          style={{ color: syn.hexColor }}
        >
          {syn.name.toUpperCase()}
        </span>

        {/* Score bar */}
        <div className="h-px bg-void-600/35 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, backgroundColor: syn.hexColor + '55' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-void-500/45">
            {nodeCount} GATE{nodeCount !== 1 ? 'S' : ''}
          </span>
          {standing.memberCount > 0 && (
            <span className="font-mono text-[9px] text-void-500/35">
              {standing.memberCount} OPS
            </span>
          )}
        </div>
      </div>

      {/* Score */}
      <span
        className="font-mono text-[12px] font-semibold tabular-nums text-right"
        style={{ color: syn.hexColor }}
      >
        {fmtScore(standing.totalScore)}
      </span>
    </li>
  );
}

// ── Disposition matrix ────────────────────────────────────────────────────────

function DispositionMatrix() {
  // All 4 syndicates — Unaffiliated rows/cols show neutral disposition (correct: it holds no alliances).
  const all = SYNDICATE_IDS;

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${all.length}, 1fr)` }}>
      {all.map((a) =>
        all.map((b) => {
          if (a === b) {
            return (
              <div
                key={`${a}-${b}`}
                className="h-6 rounded-sm flex items-center justify-center"
                style={{ backgroundColor: SYNDICATES[a].hexColor + '22' }}
                title={SYNDICATES[a].name}
              >
                <span className="font-mono text-[7px]" style={{ color: SYNDICATES[a].hexColor }}>
                  {a.slice(0, 3)}
                </span>
              </div>
            );
          }
          const disp = dispositionBetween(a, b);
          return (
            <div
              key={`${a}-${b}`}
              className="h-6 rounded-sm flex items-center justify-center"
              style={{ backgroundColor: DISPOSITION_COLOR[disp] + '1A' }}
              title={`${SYNDICATES[a].name} → ${SYNDICATES[b].name}: ${DISPOSITION_LABEL[disp]}`}
            >
              <span
                className="font-mono text-[7px] tracking-wider"
                style={{ color: DISPOSITION_COLOR[disp] }}
              >
                {DISPOSITION_LABEL[disp].slice(0, 3)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
