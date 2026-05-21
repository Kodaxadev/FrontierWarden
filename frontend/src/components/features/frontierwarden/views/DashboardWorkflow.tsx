// DashboardWorkflow — Node status + onboarding setup checklist.
// Combines NodeSentinelView (operational overview) with OnboardingWizardShell
// (setup progress). Operator sees both in one place.

import { useState } from 'react';
import { NodeSentinelView } from './NodeSentinelView';
import { OnboardingWizardShell } from '../OnboardingWizardShell';
import { AlertFeed } from '../AlertFeed';
import { WorkflowSubNav } from '../WorkflowSubNav';
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
      <AlertFeed
        alerts={props.data.alerts}
        onNavigateGateOps={() => props.onWorkflowNavigate('gate-ops')}
      />
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
