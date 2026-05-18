import type { OperatorContextItem, OperatorContextSignals, OperatorTone } from './operator-context-signals';

interface OperatorContextBarProps {
  signals: OperatorContextSignals;
}

const TONE_COLOR: Record<OperatorTone, string> = {
  good: 'var(--c-green, #5ee28a)',
  warn: 'var(--c-amber, #f59e0b)',
  bad: 'var(--c-crimson, #ff5568)',
  idle: 'var(--c-mid)',
};

function ContextCell({ item }: { item: OperatorContextItem }) {
  return (
    <div style={{
      borderRight: '1px solid var(--c-border)',
      display: 'grid',
      gap: 4,
      minWidth: 150,
      padding: '10px 14px',
    }}>
      <span className="c-sub" style={{ fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase' }}>
        {item.protocol ? (
          <abbr title={item.protocol} style={{ textDecoration: 'none' }}>{item.label}</abbr>
        ) : item.label}
      </span>
      <span style={{ color: TONE_COLOR[item.tone ?? 'idle'], fontSize: 13, fontWeight: 700 }}>
        {item.value}
      </span>
      {item.action && (
        <span className="c-sub" style={{ fontSize: 11 }}>
          Next: {item.action}
        </span>
      )}
    </div>
  );
}

export function OperatorContextBar({ signals }: OperatorContextBarProps) {
  return (
    <section
      aria-label="Operator context"
      style={{
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        flexWrap: 'wrap',
        margin: '0 0 18px',
        background: 'rgba(255,255,255,0.012)',
      }}
    >
      {signals.items.map((item) => (
        <ContextCell key={`${item.label}:${item.value}`} item={item} />
      ))}
    </section>
  );
}
