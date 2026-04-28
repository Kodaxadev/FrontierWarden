// AttestationFeed -- live attestation intelligence stream.
// Left border colour tracks schema type (cyan=CREDIT, crimson=SHIP_KILL, etc.)
// Stamp classes (.stamp-verified / .stamp-revoked) from globals.css.

import { useState }            from 'react';
import { useAttestations }     from '../../hooks/useAttestations';
import { Panel }               from '../ui/Panel';
import { SchemaBadge }         from '../ui/StatusBadge';
import { AddressChip }         from '../ui/AddressChip';
import { SkeletonRows }        from '../ui/Skeleton';
import { DataFeedIcon }        from '../ui/Icons';
import { fmtScore, truncAddr } from '../../lib/format';
import type { AttestationRow } from '../../types/api.types';

// Default subject: SYNTHETIC deployer used in devnet seed
const DEFAULT_SUBJECT = '0x0000000000000000000000000000000000000000000000000000000000001111';

interface AttestationFeedProps {
  subject?:   string;
  className?: string;
}

export function AttestationFeed({ subject = DEFAULT_SUBJECT, className }: AttestationFeedProps) {
  const [inputVal,      setInputVal]      = useState(subject);
  const [activeSubject, setActiveSubject] = useState(subject);

  const { data, loading, error } = useAttestations(activeSubject, { limit: 30 });

  return (
    <Panel
      title="Intel Feed"
      subtitle={`/attestations/${truncAddr(activeSubject, 4)}`}
      icon={<DataFeedIcon className="w-4 h-4" />}
      live
      className={className}
      headerRight={
        <form
          onSubmit={(e) => { e.preventDefault(); setActiveSubject(inputVal.trim()); }}
          className="flex gap-1"
        >
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="0x subject..."
            className={[
              'w-32 px-2 py-0.5 rounded font-mono text-[10px]',
              'bg-void-900 border border-void-500/60 text-alloy-silver/80',
              'focus:outline-none focus:border-sui-cyan/60 placeholder:text-void-500/50',
            ].join(' ')}
          />
          <button
            type="submit"
            className="px-2 py-0.5 text-[9px] font-mono rounded border border-sui-cyan/30 text-sui-cyan hover:bg-sui-cyan/10 transition-colors"
          >
            QUERY
          </button>
        </form>
      }
    >
      {loading && <SkeletonRows cols={[2, 1, 1, 1]} rows={6} />}

      {error && (
        <div className="px-4 py-6 text-center font-mono text-[11px] text-frontier-crimson/70">
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="px-4 py-10 flex flex-col items-center gap-2">
          <span className="font-mono text-[10px] text-void-500 tracking-wider">
            NO INTELLIGENCE ON RECORD
          </span>
          <span className="font-mono text-[9px] text-void-500/35 tracking-widest">
            OPERATIVE MAY BE UNREGISTERED
          </span>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ul role="list" className="divide-y divide-void-700/40">
          {data.map((row) => (
            <AttestedCard key={row.attestation_id} row={row} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── Schema border colour map ──────────────────────────────────────────────────

const SCHEMA_BORDER: Record<string, string> = {
  CREDIT:           'border-l-sui-cyan/50',
  SHIP_KILL:        'border-l-frontier-crimson/60',
  PLAYER_BOUNTY:    'border-l-frontier-amber/60',
  TRIBE_STANDING:   'border-l-standing-ally/60',
  GATE_HOSTILE:     'border-l-frontier-crimson/55',
  GATE_CAMPED:      'border-l-frontier-amber/50',
  GATE_CLEAR:       'border-l-status-clear/50',
  ROUTE_VERIFIED:   'border-l-standing-ally/50',
  SYSTEM_CONTESTED: 'border-l-alloy-silver/30',
};
const BORDER_REVOKED = 'border-l-void-500/20';
const BORDER_DEFAULT = 'border-l-void-500/30';

// ── Card ──────────────────────────────────────────────────────────────────────

function AttestedCard({ row }: { row: AttestationRow }) {
  const border = row.revoked
    ? BORDER_REVOKED
    : (SCHEMA_BORDER[row.schema_id] ?? BORDER_DEFAULT);

  const txTail   = row.issued_tx.slice(-10).toUpperCase();
  const idSuffix = row.attestation_id.slice(-6).toUpperCase();

  return (
    <li
      className={[
        'border-l-2 px-4 py-2.5 hover:bg-void-700/30 transition-colors',
        border,
        row.revoked ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Top row: badge + score + stamp */}
      <div className="flex items-center gap-2">
        <SchemaBadge schemaId={row.schema_id} />
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <span className="font-mono text-[13px] font-semibold text-sui-cyan tabular-nums">
            {fmtScore(row.value)}
          </span>
          {row.revoked
            ? <span className="stamp-revoked">REVOKED</span>
            : <span className="stamp-verified">VERIFIED</span>
          }
        </div>
      </div>

      {/* Address row */}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="font-mono text-[9px] text-void-500/55 w-10 shrink-0">ISSUER</span>
        <AddressChip address={row.issuer} chars={4} />
        <span className="font-mono text-[9px] text-void-500/55 w-8 shrink-0">SUBJ</span>
        <AddressChip address={row.subject} chars={4} />
      </div>

      {/* TX footer */}
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-[9px] text-void-500/30 tracking-wider">
          TX ...{txTail}
        </span>
        <span className="font-mono text-[8px] text-void-500/25 tracking-widest">
          #{idSuffix}
        </span>
      </div>
    </li>
  );
}
