// Tribe Reputation Dashboard — Screen 3 from mockups.
// Left: member rep list | Center: syndicate matrix | Right: active tactical marks.
// Data sourced from /scores/:profile_id and /leaderboard/:schema_id once profiles are known.

const MOCK_MEMBERS = [
  { name: 'Anthragan_Prime', rep: 4218, delta: +24 },
  { name: 'Cypex Corp',      rep: 3871, delta: -12 },
  { name: 'Synthrax',        rep: 3204, delta: +88 },
  { name: 'Narun_Corp',      rep: 2990, delta: 0   },
  { name: 'Taylor_Corp',     rep: 2741, delta: +5  },
  { name: 'Nyx 2.0',         rep: 2100, delta: -44 },
  { name: 'Thane_Corp',      rep: 1950, delta: +11 },
  { name: 'Astral_Corp',     rep: 1720, delta: 0   },
]

const SYNDICATES = ['Anthragan', 'Cypex', 'Star Cat', 'One Star', 'Total Workers', 'Iron Star']

const MATRIX: number[][] = [
  [ 0,  1,  1, -1,  0,  1],
  [ 1,  0,  0,  0, -1,  0],
  [ 1,  0,  0,  1,  0, -1],
  [-1,  0,  1,  0,  1,  0],
  [ 0, -1,  0,  1,  0,  1],
  [ 1,  0, -1,  0,  1,  0],
]

const MARKS = [
  { type: 'BOUNTY',    target: 'Synthrax',    value: '25,000 SUI' },
  { type: 'WARMARK',   target: 'Nyx 2.0',     value: 'ACTIVE'    },
  { type: 'CONTESTED', target: 'P-U19X',      value: 'ZONE'      },
  { type: 'BOUNTY',    target: 'Iron Star',   value: '10,500 SUI' },
]

const MARK_COLORS: Record<string, string> = {
  BOUNTY:    '#ff8c00',
  WARMARK:   '#ff2222',
  CONTESTED: '#ffcc00',
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-eve-muted text-xs">—</span>
  const color = delta > 0 ? '#00ff88' : '#ff2222'
  return <span className="text-xs font-mono" style={{ color }}>{delta > 0 ? '+' : ''}{delta}</span>
}

function MatrixCell({ value }: { value: number }) {
  const bg = value > 0 ? '#00ff8833' : value < 0 ? '#ff222233' : '#1a2a3a'
  return (
    <td className="w-8 h-8 border border-eve-border text-center" style={{ background: bg }} />
  )
}

export default function TribeDashboard() {
  return (
    <div className="flex h-full bg-eve-bg gap-0 overflow-hidden">
      {/* Left — member list */}
      <div className="w-64 border-r border-eve-border flex flex-col">
        <div className="px-4 py-3 border-b border-eve-border">
          <span className="text-eve-cyan text-sm font-mono font-bold">// TRIBE MEMBER REPUTATION</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MOCK_MEMBERS.map((m) => (
            <div key={m.name} className="flex items-center justify-between px-4 py-2 border-b border-eve-border hover:bg-white/5">
              <span className="text-eve-text text-xs font-mono truncate">{m.name}</span>
              <div className="flex items-center gap-3 ml-2 shrink-0">
                <span className="text-eve-cyan text-xs font-mono">{m.rep.toLocaleString()}</span>
                <DeltaBadge delta={m.delta} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center — relationship matrix */}
      <div className="flex-1 border-r border-eve-border flex flex-col">
        <div className="px-4 py-3 border-b border-eve-border">
          <span className="text-eve-cyan text-sm font-mono font-bold">// SYNDICATE RELATIONSHIP MATRIX</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-24" />
                {SYNDICATES.map((s) => (
                  <th key={s} className="w-8 h-8 text-center">
                    <span className="text-eve-muted text-xs font-mono" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', display: 'block' }}>
                      {s}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SYNDICATES.map((row, i) => (
                <tr key={row}>
                  <td className="pr-2 text-right">
                    <span className="text-eve-muted text-xs font-mono whitespace-nowrap">{row}</span>
                  </td>
                  {MATRIX[i].map((val, j) => (
                    <MatrixCell key={j} value={val} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right — tactical marks */}
      <div className="w-56 flex flex-col">
        <div className="px-4 py-3 border-b border-eve-border">
          <span className="text-eve-cyan text-sm font-mono font-bold">// ACTIVE TACTICAL MARKS</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MARKS.map((m, i) => {
            const color = MARK_COLORS[m.type] ?? '#5a7a9a'
            return (
              <div key={i} className="px-4 py-3 border-b border-eve-border">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono font-bold" style={{ color }}>{m.type}</span>
                  <span className="text-eve-muted text-xs font-mono">{m.value}</span>
                </div>
                <span className="text-eve-text text-xs font-mono">{m.target}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
