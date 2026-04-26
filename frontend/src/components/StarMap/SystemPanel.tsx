import { useStore } from '../../store'
import { threatColor, threatLevel, type SystemIntelResponse } from '../../types'

function IntelRow({ label, entry }: { label: string; entry: { value: number; issuer: string; issued_at: string } | null }) {
  if (!entry) return null
  const ago = timeSince(entry.issued_at)
  return (
    <div className="border-b border-eve-border pb-2 mb-2">
      <div className="flex justify-between items-center">
        <span className="text-eve-cyan text-xs font-mono">{label}</span>
        <span className="text-eve-muted text-xs">{ago}</span>
      </div>
      <div className="text-eve-text text-xs mt-1 truncate">
        {entry.issuer.slice(0, 20)}…
      </div>
      {entry.value !== 0 && (
        <div className="text-eve-yellow text-xs">{entry.value.toLocaleString()} SUI</div>
      )}
    </div>
  )
}

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ThreatBadge({ intel }: { intel: SystemIntelResponse | undefined }) {
  const level = threatLevel(intel)
  const color = threatColor(level)
  const labels: Record<string, string> = {
    hostile:   '⚠ HOSTILE',
    camped:    '⚠ GATE CAMPED',
    contested: '~ CONTESTED',
    clear:     '✓ ROUTE CLEAR',
    unknown:   '? NO INTEL',
  }
  return (
    <div
      className="text-sm font-mono font-bold px-3 py-1 border mb-4 text-center"
      style={{ color, borderColor: color, background: `${color}18` }}
    >
      {labels[level]}
    </div>
  )
}

export default function SystemPanel() {
  const selectedSystem = useStore((s) => s.selectedSystem)
  const systemIntel    = useStore((s) => s.systemIntel)
  const fetchIntel     = useStore((s) => s.fetchIntel)

  if (!selectedSystem) {
    return (
      <div className="w-72 bg-eve-surface border-l border-eve-border p-4 flex items-center justify-center">
        <p className="text-eve-muted text-xs font-mono text-center">
          CLICK A SYSTEM<br />TO VIEW INTEL
        </p>
      </div>
    )
  }

  const intel = systemIntel[selectedSystem]

  return (
    <div className="w-72 bg-eve-surface border-l border-eve-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-eve-border">
        <div className="text-eve-muted text-xs font-mono mb-1">SYSTEM</div>
        <div className="text-eve-cyan text-lg font-mono font-bold">{selectedSystem}</div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <ThreatBadge intel={intel} />

        {!intel && (
          <button
            onClick={() => fetchIntel(selectedSystem)}
            className="w-full text-xs font-mono py-2 border border-eve-cyan text-eve-cyan hover:bg-eve-cyan hover:text-eve-bg transition-colors mb-4"
          >
            FETCH INTEL
          </button>
        )}

        {intel && (
          <>
            <IntelRow label="GATE HOSTILE"    entry={intel.gate_hostile}     />
            <IntelRow label="GATE CAMPED"     entry={intel.gate_camped}      />
            <IntelRow label="GATE CLEAR"      entry={intel.gate_clear}       />
            <IntelRow label="GATE TOLL"       entry={intel.gate_toll}        />
            <IntelRow label="HEAT TRAP"       entry={intel.heat_trap}        />
            <IntelRow label="ROUTE VERIFIED"  entry={intel.route_verified}   />
            <IntelRow label="CONTESTED"       entry={intel.system_contested} />
          </>
        )}

        <div className="mt-4 space-y-2">
          <button className="w-full text-xs font-mono py-2 bg-eve-red text-white hover:opacity-80 transition-opacity">
            REPORT INCIDENT
          </button>
          <button className="w-full text-xs font-mono py-2 border border-eve-yellow text-eve-yellow hover:bg-eve-yellow hover:text-eve-bg transition-colors">
            ROUTE AVOID
          </button>
        </div>
      </div>
    </div>
  )
}
