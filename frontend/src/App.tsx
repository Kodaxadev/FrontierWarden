import { lazy, Suspense } from 'react'
import { useStore } from './store'
import type { Tab } from './types'
import SystemPanel from './components/StarMap/SystemPanel'

const StarMap        = lazy(() => import('./components/StarMap/StarMap'))
const IntelFeed      = lazy(() => import('./components/IntelFeed/IntelFeed'))
const TribeDashboard = lazy(() => import('./components/TribeDashboard/TribeDashboard'))

const TABS: { id: Tab; label: string }[] = [
  { id: 'map',     label: 'MAP'     },
  { id: 'intel',   label: 'INTEL'   },
  { id: 'tribe',   label: 'TRIBE'   },
  { id: 'oracles', label: 'ORACLES' },
]

function TabBar() {
  const activeTab   = useStore((s) => s.activeTab)
  const setTab      = useStore((s) => s.setTab)
  const wallet      = useStore((s) => s.walletAddress)

  return (
    <header className="flex items-center border-b border-eve-border bg-eve-surface px-4 h-10 shrink-0">
      {/* Logo */}
      <span className="text-eve-cyan text-sm font-mono font-bold mr-6">FRONTIER<span className="text-eve-text">WARDEN</span></span>

      {/* Tabs */}
      <nav className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1 text-xs font-mono border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-eve-cyan text-eve-cyan'
                : 'border-transparent text-eve-muted hover:text-eve-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Wallet */}
      <div className="ml-auto text-xs font-mono text-eve-muted">
        {wallet ? (
          <span className="text-eve-text">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
        ) : (
          <button className="text-eve-cyan border border-eve-cyan px-3 py-0.5 hover:bg-eve-cyan hover:text-eve-bg transition-colors">
            CONNECT
          </button>
        )}
      </div>
    </header>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-eve-cyan font-mono text-sm animate-pulse">LOADING…</span>
    </div>
  )
}

export default function App() {
  const activeTab = useStore((s) => s.activeTab)

  return (
    <div className="flex flex-col h-screen bg-eve-bg text-eve-text overflow-hidden">
      <TabBar />

      <main className="flex-1 overflow-hidden">
        <Suspense fallback={<Spinner />}>
          {activeTab === 'map' && (
            <div className="flex h-full">
              <div className="flex-1 relative">
                <StarMap />
              </div>
              <SystemPanel />
            </div>
          )}

          {activeTab === 'intel' && <IntelFeed />}

          {activeTab === 'tribe' && <TribeDashboard />}

          {activeTab === 'oracles' && (
            <div className="flex items-center justify-center h-full">
              <span className="text-eve-muted font-mono text-sm">ORACLE REGISTRY — COMING SOON</span>
            </div>
          )}
        </Suspense>
      </main>
    </div>
  )
}
