// FrontierWardenDashboard v4 — workflow-based navigation shell
// 5 workflow groups replace the 11 flat tabs. Old FwNav preserved at FwNav.tsx.

import { useState } from 'react';
import { FwHeader }           from './FwHeader';
import { FwWorkflowNav }      from './FwWorkflowNav';
import type { WorkflowTab }   from './FwWorkflowNav';
import { OperatorContextBar } from './OperatorContextBar';
import { useOperatorContextSignals } from './operator-context-signals';
import { DashboardWorkflow }  from './views/DashboardWorkflow';
import { CheckTrustWorkflow } from './views/CheckTrustWorkflow';
import { GateOpsWorkflow }    from './views/GateOpsWorkflow';
import { CreditRiskWorkflow } from './views/CreditRiskWorkflow';
import { SettingsWorkflow }   from './views/SettingsWorkflow';
import { useFrontierWardenData } from '../../../hooks/useFrontierWardenData';

/** @deprecated Use WorkflowTab. Kept for OnboardingWizardShell compatibility. */
export type FwTab = 'onboarding' | 'sentinel' | 'gates' | 'trust' | 'killboard' | 'reputation' | 'contracts' | 'policy' | 'oracle' | 'social' | 'disputes';

export function FrontierWardenDashboard() {
  const [tab, setTab] = useState<WorkflowTab>('dashboard');
  const {
    data, live, loading, reputationLive, killboardLive, policyLive,
    contractsLive, provenance, error, eveIdentity, eveIdentityMap,
  } = useFrontierWardenData();
  const operatorSignals = useOperatorContextSignals(data, eveIdentity);

  return (
    <div className="c-shell">
      <FwHeader data={data} />
      <FwWorkflowNav active={tab} onChange={setTab} alerts={data.alerts} />
      <OperatorContextBar signals={operatorSignals} onNavigate={setTab} />
      <div className="c-view">
        {tab === 'dashboard' && (
          <DashboardWorkflow
            data={data} live={live} loading={loading} error={error}
            eveIdentity={eveIdentity} eveIdentityMap={eveIdentityMap}
            operatorSignals={operatorSignals}
            onWorkflowNavigate={setTab}
          />
        )}
        {tab === 'check-trust' && (
          <CheckTrustWorkflow
            data={data} live={live} loading={loading} error={error}
            reputationLive={reputationLive} killboardLive={killboardLive}
            provenance={{
              gateNetwork: provenance.gateNetwork,
              reputation: provenance.reputation,
              killboard: provenance.killboard,
            }}
          />
        )}
        {tab === 'gate-ops' && (
          <GateOpsWorkflow
            data={data} live={live} loading={loading} error={error}
            provenance={provenance.gateNetwork}
            onNavigateSettings={() => setTab('settings')}
          />
        )}
        {tab === 'credit-risk' && (
          <CreditRiskWorkflow
            data={data} live={live} loading={loading} error={error}
            contractsLive={contractsLive}
            provenance={{
              contracts: provenance.contracts,
              reputation: provenance.reputation,
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsWorkflow
            data={data} live={live} loading={loading} error={error}
            policyLive={policyLive}
            provenance={{
              policy: provenance.policy,
              gateNetwork: provenance.gateNetwork,
              killboard: provenance.killboard,
            }}
          />
        )}
      </div>
    </div>
  );
}
