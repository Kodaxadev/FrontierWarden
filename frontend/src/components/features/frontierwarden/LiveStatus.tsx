interface LiveStatusProps {
  loading?: boolean;
  live?: boolean;
  error?: string | null;
  liveText: string;
  emptyText: string;
}

export function LiveStatus({
  loading = false,
  live = false,
  error = null,
  liveText,
  emptyText,
}: LiveStatusProps) {
  const tone = loading ? 'sync' : live ? 'live' : 'fallback';
  const text = loading
    ? 'Syncing'
    : live
      ? liveText
      : error
        ? 'Offline fallback'
        : emptyText;

  return (
    <div className={`c-live-note c-live-note--${tone}`}>
      {text}
    </div>
  );
}
