// DashboardWorkflow — Node status + onboarding setup checklist.
// Combines NodeSentinelView (operational overview) with OnboardingWizardShell
// (setup progress). Operator sees both in one place.

import { useState } from 'react';
import { NodeSentinelView } from './NodeSentinelView';
import { OnboardingWizardShell } from '../OnboardingWizardShell';
import type { FwData } from '../fw-data';
import type { EveIdentity, IdentityEnrichmentMap } from '../../../../types/api.types';
import type { OperatorContextSignals } from '../operator-context-signals';
import type { WorkflowTab } from '../FwWorkflowNav';

type SubTab = 'status' | 'setup';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  eveIdentity: EveIdentity | null;
  eveIdentityMap: IdentityEnrichmentMap;
  operatorSignals: OperatorContextSignals;
  onWorkflowNavigate: (tab: WorkflowTab) => void;
}

/** Map onboarding nav targets to workflow tabs. */
function onboardingNavBridge(target: string, navigate: (tab: WorkflowTab) => void) {
  const map: Record<string, WorkflowTab> = {
    gates: 'gate-ops',
    policy: 'settings',
    social: 'credit-risk',
    trust: 'check-trust',
  };
  navigate(map[target] ?? 'dashboard');
}

export function DashboardWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('status');

  return (
    <div>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'status', label: 'Node Status' },
        { id: 'setup',  label: 'Setup Checklist' },
      ]} />
      {sub === 'status' && (
        <NodeSentinelView
          data={props.data} live={props.live} loading={props.loading}
          error={props.error} eveIdentity={props.eveIdentity}
          eveIdentityMap={props.eveIdentityMap}
        />
      )}
      {sub === 'setup' && (
        <OnboardingWizardShell
          signals={props.operatorSignals}
          onNavigate={(target) => onboardingNavBridge(target, props.onWorkflowNavigate)}
        />
      )}
    </div>
  );
}

// ── Reusable sub-tab bar ─────────────────────────────────────────────────────

interface SubNavTab<T extends string> { id: T; label: string }

export function WorkflowSubNav<T extends string>(
  { active, onChange, tabs }: { active: T; onChange: (t: T) => void; tabs: SubNavTab<T>[] },
) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t.id} className={`c-filter${active === t.id ? ' c-filter--active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
