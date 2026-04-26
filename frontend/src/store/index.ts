import { create } from 'zustand'
import { api } from '../api/client'
import type { Tab, IntelFilter, SystemIntelResponse, AttestationRow } from '../types'

interface AppState {
  // Navigation
  activeTab:      Tab
  setTab:         (tab: Tab) => void

  // Star map
  selectedSystem: string | null
  selectSystem:   (id: string | null) => void
  systemIntel:    Record<string, SystemIntelResponse>
  fetchIntel:     (systemId: string) => Promise<void>

  // Intel feed
  intelFilter:    IntelFilter
  setIntelFilter: (f: IntelFilter) => void
  feedItems:      AttestationRow[]
  fetchFeed:      (subject: string, schema?: string) => Promise<void>

  // Wallet
  walletAddress:  string | null
  setWallet:      (addr: string | null) => void
}

export const useStore = create<AppState>((set, get) => ({
  activeTab:   'map',
  setTab:      (tab) => set({ activeTab: tab }),

  selectedSystem: null,
  selectSystem: (id) => {
    set({ selectedSystem: id })
    if (id) get().fetchIntel(id)
  },
  systemIntel: {},
  fetchIntel: async (systemId) => {
    if (get().systemIntel[systemId]) return   // already hydrated, skip
    try {
      const intel = await api.intel(systemId)
      set((s) => ({ systemIntel: { ...s.systemIntel, [systemId]: intel } }))
    } catch {
      // non-fatal — system stays at unknown threat level
    }
  },

  intelFilter:    'ALL',
  setIntelFilter: (f) => set({ intelFilter: f }),
  feedItems:      [],
  fetchFeed: async (subject, schema) => {
    try {
      const items = await api.attestations(subject, schema)
      set({ feedItems: items })
    } catch {
      // leave stale feed rather than clearing
    }
  },

  walletAddress: null,
  setWallet:     (addr) => set({ walletAddress: addr }),
}))
