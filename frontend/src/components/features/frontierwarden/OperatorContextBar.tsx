// OperatorContextBar — P1/P2: actionable + collapsible context strip.
// "Next:" actions are now clickable, navigating to the correct workflow.
// Collapses to a single status line when all signals are green.

import { useState } from 'react';
import type { OperatorContextItem, OperatorContextSignals, OperatorTone } from './operator-context-signals';
import type { WorkflowTab } from './FwWorkflowNav';

interface OperatorContextBarProps {
  signals: OperatorContextSignals;
  onNavigate?: (tab: WorkflowTab) => void;
}

const TONE_COLOR: Record<OperatorTone, string> = {
  good: 'var(--c-green, #5ee28a)',
  warn: 'var(--c-amber, #f59e0b)',
  bad: 'var(--c-crimson, #ff5568)',
  idle: 'var(--c-mid)',
};

/** Map action text to the workflow tab it should navigate to. */
function actionTarget(action: string | undefined): WorkflowTab | null {
  if (!action) return null;
  const lower = action.toLowerCase();
  if (lower.includes('gate') || lower.includes('binding')) return 'gate-ops';
  if (lower.includes('policy')) return 'settings';
  if (lower.includes('onboarding') || lower.includes('setup')) return 'dashboard';
  if (lower.includes('trust')) return 'check-trust';
  return null;
}

function ContextCell({
  item,
  onNavigate,
}: {
  item: OperatorContextItem;
  onNavigate?: (tab: WorkflowTab) => void;
}) {
  const target = actionTarget(item.action);
  const canClick = Boolean(item.action && target && onNavigate);

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
        canClick ? (
          <button
            className="c-context-cell__action c-context-cell__action--link"
            onClick={() => onNavigate?.(target!)}
          >
            Next: {item.action}
          </button>
        ) : (
          <span className="c-context-cell__action">
            Next: {item.action}
          </span>
        )
      )}
    </div>
  );
}

function allGreen(items: OperatorContextItem[]): boolean {
  return items.every(item => item.tone === 'good' || item.tone === 'idle');
}

function statusSummary(items: OperatorContextItem[]): string {
  const warns = items.filter(i => i.tone === 'warn').length;
  const bads = items.filter(i => i.tone === 'bad').length;
  if (bads > 0) return `${bads} need recovery · ${warns} need action`;
  if (warns > 0) return `${warns} need action`;
  return 'All systems ready';
}

export function OperatorContextBar({ signals, onNavigate }: OperatorContextBarProps) {
  const isAllGreen = allGreen(signals.items);
  const [collapsed, setCollapsed] = useState(isAllGreen);

  if (collapsed) {
    return (
      <section
        className="c-context-bar c-context-bar--collapsed"
        aria-label="Operator context (collapsed)"
      >
        <button
          className="c-context-bar__toggle"
          onClick={() => setCollapsed(false)}
          style={{
            all: 'unset', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '6px 14px',
            fontSize: 10, letterSpacing: '0.08em',
            color: isAllGreen ? 'var(--c-green)' : 'var(--c-amber)',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isAllGreen ? 'var(--c-green)' : 'var(--c-amber)',
          }} />
          <span>{statusSummary(signals.items)}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--c-mid)', fontSize: 9 }}>
            EXPAND ▾
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      className="c-context-bar"
      aria-label="Operator context"
    >
      {signals.items.map((item) => (
        <ContextCell
          key={`${item.label}:${item.value}`}
          item={item}
          onNavigate={onNavigate}
        />
      ))}
      <button
        className="c-context-bar__collapse"
        onClick={() => setCollapsed(true)}
        style={{
          all: 'unset', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 10px',
          fontSize: 9, color: 'var(--c-mid)', letterSpacing: '0.06em',
          borderLeft: '1px solid var(--c-border)',
          minWidth: 44,
        }}
        title="Collapse context bar"
      >
        ▴
      </button>
    </section>
  );
}
