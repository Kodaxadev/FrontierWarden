import type { SystemIntelResponse, AttestationRow, ScoreRow, LeaderboardEntry } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const api = {
  intel:       (systemId: string) =>
    get<SystemIntelResponse>(`/intel/${encodeURIComponent(systemId)}`),

  attestations: (subject: string, schemaId?: string, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) })
    if (schemaId) params.set('schema_id', schemaId)
    return get<AttestationRow[]>(`/attestations/${encodeURIComponent(subject)}?${params}`)
  },

  scores:      (profileId: string) =>
    get<ScoreRow[]>(`/scores/${encodeURIComponent(profileId)}`),

  leaderboard: (schemaId: string, limit = 50) =>
    get<LeaderboardEntry[]>(`/leaderboard/${encodeURIComponent(schemaId)}?limit=${limit}`),

  health:      () => get<{ status: string; uptime_secs: number }>('/health'),
}
