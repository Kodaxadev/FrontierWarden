// LoadingSkeleton — reusable shimmer placeholder for loading states.
// Renders a configurable number of animated skeleton bars.

interface Props {
  rows?: number;
  /** Full-width stats grid skeleton instead of table rows */
  variant?: 'rows' | 'stats';
}

function Bar({ width, height = 14 }: { width: string | number; height?: number }) {
  return (
    <div
      className="c-skeleton"
      style={{
        width: typeof width === 'number' ? `${width}%` : width,
        height,
        borderRadius: 3,
        background: 'var(--c-border)',
        opacity: 0.5,
      }}
    />
  );
}

export function LoadingSkeleton({ rows = 5, variant = 'rows' }: Props) {
  if (variant === 'stats') {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 1, border: '1px solid var(--c-border)', background: 'var(--c-border)',
        marginBottom: 24,
      }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ background: 'var(--c-surface)', padding: '14px 16px' }}>
            <Bar width={60} height={10} />
            <div style={{ marginTop: 8 }}><Bar width={40} height={22} /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12, padding: '16px 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Bar width={`${20 + (i % 3) * 10}%`} height={14} />
          <Bar width={`${30 - (i % 2) * 8}%`} height={14} />
          <Bar width={`${15 + (i % 4) * 5}%`} height={14} />
        </div>
      ))}
    </div>
  );
}
