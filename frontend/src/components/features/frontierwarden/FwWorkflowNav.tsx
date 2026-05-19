// FwWorkflowNav — operator workflow navigation (replaces flat 11-tab FwNav).
// 5 workflow groups. Sub-tab routing is handled inside each workflow view.
// Old FwNav preserved at FwNav.tsx for reference / advanced mode.

import type { FwAlert } from './fw-data';

/** Top-level workflow groups visible to operators. */
export type WorkflowTab =
  | 'dashboard'
  | 'check-trust'
  | 'gate-ops'
  | 'credit-risk'
  | 'settings';

const WORKFLOW_TABS: { id: WorkflowTab; label: string; desc: string }[] = [
  { id: 'dashboard',   label: 'DASHBOARD',   desc: 'Node status & setup' },
  { id: 'check-trust', label: 'CHECK TRUST', desc: 'Check a pilot or counterparty' },
  { id: 'gate-ops',    label: 'GATE OPS',    desc: 'Operate a gate' },
  { id: 'credit-risk', label: 'CREDIT RISK', desc: 'Review credit risk' },
  { id: 'settings',    label: 'SETTINGS',    desc: 'Configure trust domain' },
];

interface Props {
  active: WorkflowTab;
  onChange: (tab: WorkflowTab) => void;
  alerts: FwAlert[];
}

export function FwWorkflowNav({ active, onChange, alerts }: Props) {
  const warnCount = alerts.filter(a => a.lvl === 'WARN').length;

  return (
    <nav className="c-nav" aria-label="Operator workflow navigation">
      {WORKFLOW_TABS.map(t => (
        <button
          key={t.id}
          className={`c-tab${active === t.id ? ' c-tab--active' : ''}`}
          onClick={() => onChange(t.id)}
          title={t.desc}
        >
          {t.label}
          {t.id === 'gate-ops' && warnCount > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 8,
              color: 'var(--c-crimson)',
              verticalAlign: 'super',
            }}>
              {warnCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
