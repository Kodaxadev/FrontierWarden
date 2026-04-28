// LeaderboardPanel -- live score leaderboard.
// Rank 1 gets a StarIcon glyph + gold text.
// Score bars scale relative to the session max -- visual weight, not absolute.
// Schema tabs colour the bar accent (cyan=CREDIT, crimson=SHIP_KILL, blue=TRIBE_STANDING).

import { useState }           from 'react';
import { useLeaderboard }     from '../../hooks/useLeaderboard';
import { Panel }              from '../ui/Panel';
import { AddressChip }        from '../ui/AddressChip';
import { SkeletonRows }       from '../ui/Skeleton';
import { LeaderboardIcon, StarIcon } from '../ui/Icons';
import { fmtScore }           from '../../lib/format';

const SCHEMAS = ['CREDIT', 'SHIP_KILL', 'TRIBE_STANDING'] as const;
type Schema = typeof SCHEMAS[number];

const SCHEMA_TAB: Record<Schema, string> = {
  CREDIT:         'bg-sui-cyan/10 border-sui-cyan/40 text-sui-cyan',
  SHIP_KILL:      'bg-frontier-crimson/10 border-frontier-crimson/40 text-frontier-crimson',
  TRIBE_STANDING: 'bg-standing-ally/10 border-standing-ally/40 text-standing-ally',
};

const SCHEMA_BAR: Record<Schema, string> = {
  CREDIT:         'bg-sui-cyan/35',
  SHIP_KILL:      'bg-frontier-crimson/40',
  TRIBE_STANDING: 'bg-standing-ally/40',
};

export function LeaderboardPanel({ className }: { className?: string }) {
  const [schema, setSchema] = useState<Schema>('CREDIT');
  const { data, loading, error, pulse } = useLeaderboard(schema, 20);
  const maxScore = Math.max(...data.map(e => e.value), 1);

  const headerRight = (
    <div className="flex gap-1">
      {SCHEMAS.map((s) => (
        <button
          key={s}
          onClick={() => setSchema(s)}
          className={[
            'px-2 py-0.5 rounded font-mono text-[9px] tracking-wider border transition-colors',
            schema === s
              ? SCHEMA_TAB[s]
              : 'bg-transparent border-void-500/50 text-alloy-silver/40 hover:text-alloy-silver/70',
          ].join(' ')}
        >
          {s.replace('_', ' ')}
        </button>
      ))}
    </div>
  );

  return (
    <Panel
      title="Leaderboard"
      subtitle={`/leaderboard/${schema}`}
      icon={<LeaderboardIcon className="w-4 h-4" />}
      live
      className={className}
      headerRight={headerRight}
    >
      <div className="grid grid-cols-[36px_1fr_80px] px-4 py-1.5 border-b border-void-700/60">
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest">#</span>
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest">OPERATIVE</span>
        <span className="font-mono text-[9px] text-void-500/70 tracking-widest text-right">SCORE</span>
      </div>

      {loading && <SkeletonRows cols={[1, 4, 2]} rows={8} />}

      {error && (
        <div className="px-4 py-6 text-center font-mono text-[11px] text-frontier-crimson/70">
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="px-4 py-10 flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] text-void-500 tracking-wider">
            NO OPERATIVES REGISTERED
          </span>
          <span className="font-mono text-[9px] text-void-500/35 tracking-widest">. . . . .</span>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ul role="list" className="divide-y divide-void-700/40">
          {data.map((entry, idx) => (
            <LeaderboardRow
              key={entry.profile_id}
              rank={idx + 1}
              entry={entry}
              maxScore={maxScore}
              barColor={SCHEMA_BAR[schema]}
              fresh={pulse && idx < 3}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// -- Row ----------------------------------------------------------------------

interface RowProps {
  rank:     number;
  entry:    { profile_id: string; value: number; issuer: string };
  maxScore: number;
  barColor: string;
  fresh:    boolean;
}

function LeaderboardRow({ rank, entry, maxScore, barColor, fresh }: RowProps) {
  const pct   = Math.max((entry.value / maxScore) * 100, 2);
  const isTop = rank <= 3;
  return (
    <li
      className={[
        'grid grid-cols-[36px_1fr_80px] items-center px-4 py-2.5',
        'border-l-2 hover:bg-void-700/40 transition-colors duration-150',
        isTop ? 'border-l-frontier-amber/50' : 'border-l-void-700/60',
        fresh ? 'animate-scan-in' : '',
      ].join(' ')}
    >
      <RankGlyph rank={rank} />

      <div className="flex flex-col gap-0.5 min-w-0 pr-4">
        <AddressChip address={entry.profile_id} chars={5} />
        <div className="h-px bg-void-600/35 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-[width] duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[9px] text-void-500/45 truncate">
          via {entry.issuer.slice(-6).toUpperCase()}
        </span>
      </div>

      <span className={[
        'font-mono text-[12px] font-semibold tabular-nums text-right',
        rank === 1 ? 'text-frontier-gold'       :
        rank === 2 ? 'text-alloy-silver'         :
        rank === 3 ? 'text-frontier-amber/80'    :
                     'text-sui-cyan/80',
      ].join(' ')}>
        {fmtScore(entry.value)}
      </span>
    </li>
  );
}

// -- Rank glyph ---------------------------------------------------------------

function RankGlyph({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex flex-col items-center gap-0.5" aria-label="Rank 1">
        <StarIcon className="w-3.5 h-3.5 text-frontier-gold" />
        <span className="font-mono text-[8px] text-frontier-gold/60 leading-none">01</span>
      </span>
    );
  }
  return (
    <span
      className={[
        'font-mono text-[11px] font-semibold leading-none',
        rank === 2 ? 'text-alloy-silver/80'    :
        rank === 3 ? 'text-frontier-amber/55'  :
                     'text-void-500/50',
      ].join(' ')}
      aria-label={`Rank ${rank}`}
    >
      {String(rank).padStart(2, '0')}
    </span>
  );
}
