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
    <div className="c-context-cell">
      <span className="c-context-cell__label">
        {item.protocol ? (
          <abbr title={item.protocol} style={{ textDecoration: 'none' }}>{item.label}</abbr>
        ) : item.label}
      </span>
      <span className="c-context-cell__value" style={{ color: TONE_COLOR[item.tone ?? 'idle'] }}>
        {item.value}
      </span>
      {item.action && (
        <span className="c-context-cell__action">
          Next: {item.action}
        </span>
      )}
    </div>
  );
}

export function OperatorContextBar({ signals }: OperatorContextBarProps) {
  return (
    <section
      className="c-context-bar"
      aria-label="Operator context"
    >
      {signals.items.map((item) => (
        <ContextCell key={`${item.label}:${item.value}`} item={item} />
      ))}
    </section>
  );
}
