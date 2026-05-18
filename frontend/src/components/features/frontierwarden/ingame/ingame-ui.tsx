// ingame-ui — shared micro-components for the in-game command surface.

/** ATT. OPERATOR warning strip — matches EVE Frontier in-game visual language. */
export function AttOperatorBar({ tone, children }: { tone: 'blue' | 'amber' | 'crimson'; children: React.ReactNode }) {
  const bg = tone === 'crimson'
    ? 'rgba(255,85,104,0.14)'
    : tone === 'amber'
      ? 'rgba(245,158,11,0.14)'
      : 'rgba(0,120,255,0.14)';
  const color = tone === 'crimson'
    ? 'var(--c-crimson, #ff5568)'
    : tone === 'amber'
      ? 'var(--c-amber, #f59e0b)'
      : 'var(--c-hi, #00d2ff)';
  return (
    <div style={{
      background: bg,
      borderLeft: `3px solid ${color}`,
      color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.2,
      padding: '10px 14px',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}
