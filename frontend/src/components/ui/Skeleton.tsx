// Skeleton — loading placeholder rows matching panel layout.
// Mirrors the structure of loaded content (same height, column widths).

interface SkeletonRowProps {
  cols?: number[]; // relative widths e.g. [2, 1, 1]
  rows?: number;
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <span
      className="inline-block h-2.5 rounded bg-void-600/60 animate-pulse"
      style={{ width }}
    />
  );
}

export function SkeletonRows({ cols = [2, 1, 1], rows = 5 }: SkeletonRowProps) {
  const total = cols.reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col divide-y divide-void-700/50">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {cols.map((span, j) => (
            <SkeletonBar
              key={j}
              width={`${Math.round((span / total) * 100)}%`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Single-line skeleton for inline use
export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <span
      className={[
        'inline-block h-3 rounded bg-void-600/60 animate-pulse',
        className,
      ].join(' ')}
    />
  );
}
