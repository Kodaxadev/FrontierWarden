import { useEffect } from 'react'
import { useStore } from '../../store'
import type { IntelFilter, AttestationRow } from '../../types'

const FILTERS: IntelFilter[] = ['ALL', 'GATE_HOSTILE', 'GATE_CAMPED', 'GATE_CLEAR', 'VERIFIED']

const BADGE_COLORS: Record<string, string> = {
  GATE_HOSTILE:    '#ff2222',
  GATE_CAMPED:     '#ff8c00',
  GATE_CLEAR:      '#00ff88',
  GATE_TOLL:       '#ffcc00',
  HEAT_TRAP:       '#ff4488',
  ROUTE_VERIFIED:  '#00d4ff',
  SYSTEM_CONTESTED:'#ffcc00',
  SHIP_KILL:       '#ff2222',
  PLAYER_BOUNTY:   '#ff8c00',
}

function SchemaBadge({ schema }: { schema: string }) {
  const color = BADGE_COLORS[schema] ?? '#5a7a9a'
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 border whitespace-nowrap"
      style={{ color, borderColor: color, background: `${color}18` }}
    >
      {schema.replace('_', ' ')}
    </span>
  )
}

function FeedRow({ row }: { row: AttestationRow }) {
  const dt = new Date(row.issued_tx).toLocaleString('en-US', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
  return (
    <tr className="border-b border-eve-border hover:bg-white/5 transition-colors">
      <td className="px-3 py-2 text-eve-muted text-xs font-mono whitespace-nowrap">{dt}</td>
      <td className="px-3 py-2"><SchemaBadge schema={row.schema_id} /></td>
      <td className="px-3 py-2 text-eve-text text-xs font-mono">
        {row.subject.slice(0, 10)}…
      </td>
      <td className="px-3 py-2 text-eve-muted text-xs font-mono">
        {row.issuer.slice(0, 10)}…
      </td>
      <td className="px-3 py-2 text-eve-yellow text-xs font-mono text-right">
        {row.value.toLocaleString()}
      </td>
    </tr>
  )
}

export default function IntelFeed() {
  const filter       = useStore((s) => s.intelFilter)
  const setFilter    = useStore((s) => s.setIntelFilter)
  const feedItems    = useStore((s) => s.feedItems)
  const fetchFeed    = useStore((s) => s.fetchFeed)

  // Load a broad feed on mount using the zero address (returns all recent attestations)
  useEffect(() => {
    fetchFeed('0x0000000000000000000000000000000000000000000000000000000000000000')
  }, [fetchFeed])

  const visible = feedItems.filter((r) => {
    if (filter === 'ALL')          return true
    if (filter === 'VERIFIED')     return r.schema_id === 'ROUTE_VERIFIED'
    return r.schema_id === filter
  })

  return (
    <div className="flex flex-col h-full bg-eve-bg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-eve-border flex items-center gap-4">
        <span className="text-eve-cyan text-sm font-mono font-bold">INTELLIGENCE FEED</span>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-mono px-3 py-1 border transition-colors ${
                filter === f
                  ? 'bg-eve-cyan text-eve-bg border-eve-cyan'
                  : 'text-eve-muted border-eve-border hover:border-eve-cyan hover:text-eve-cyan'
              }`}
            >
              {f.replace('GATE_', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-eve-surface z-10">
            <tr className="border-b border-eve-border">
              {['TIMESTAMP', 'SCHEMA', 'SYSTEM', 'ORACLE', 'VALUE'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-mono text-eve-muted font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-eve-muted text-xs font-mono">
                  NO INTEL AVAILABLE
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <FeedRow key={row.attestation_id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
