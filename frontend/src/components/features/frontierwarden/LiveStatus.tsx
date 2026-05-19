export type Provenance = 'LIVE' | 'EMPTY' | 'ERROR';

interface LiveStatusProps {
  loading?: boolean;
  live?: boolean;
  error?: string | null;
  provenance?: Provenance;
  liveText: string;
  emptyText?: string;
}

const PROVENANCE_CSS: Record<Provenance, string> = {
  LIVE: 'c-live-note--live',
  EMPTY: 'c-live-note--empty',
  ERROR: 'c-live-note--error',
};

function resolveProvenance({
  provenance,
  loading,
  live,
  error,
}: Pick<LiveStatusProps, 'provenance' | 'loading' | 'live' | 'error'>): Provenance | 'SYNC' {
  if (provenance) return provenance;
  if (loading) return 'SYNC';
  if (error) return 'ERROR';
  if (live) return 'LIVE';
  return 'EMPTY';
}

function provenanceLabel(state: Provenance | 'SYNC'): string {
  if (state === 'SYNC') return 'SYNCING';
  return state;
}

export function LiveStatus({
  loading = false,
  live = false,
  error = null,
  provenance,
  liveText,
  emptyText,
}: LiveStatusProps) {
  const state = resolveProvenance({ provenance, loading, live, error });
  const badgeClass = PROVENANCE_CSS[state as Provenance] ?? 'c-live-note--sync';
  const text = state === 'SYNC'
    ? 'SYNCING'
    : state === 'LIVE'
      ? liveText
      : state === 'ERROR'
        ? `API ERROR — ${error ?? 'unknown'}`
        : emptyText ?? 'NO LIVE DATA';

  return (
    <div className={`c-live-note ${badgeClass}`}>
      {provenanceLabel(state)} — {text}
    </div>
  );
}
