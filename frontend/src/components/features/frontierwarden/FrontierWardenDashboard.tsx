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
import { useDemoFallback } from '../../../hooks/useDemoFallback';

/** @deprecated Use WorkflowTab. Kept for OnboardingWizardShell compatibility. */
export type FwTab = 'onboarding' | 'sentinel' | 'gates' | 'trust' | 'killboard' | 'reputation' | 'contracts' | 'policy' | 'oracle' | 'social' | 'disputes';

export function FrontierWardenDashboard() {
  const [tab, setTab] = useState<WorkflowTab>('dashboard');
  const { demoEnabled, toggleDemo } = useDemoFallback();
  const {
    data, live, loading, reputationLive, killboardLive, policyLive,
    contractsLive, provenance, error, eveIdentity, eveIdentityMap,
  } = useFrontierWardenData({ demoEnabled });
  const operatorSignals = useOperatorContextSignals(data, eveIdentity);

  return (
    <div className="c-shell">
      <FwHeader data={data} />
      <FwWorkflowNav active={tab} onChange={setTab} alerts={data.alerts} />
      <OperatorContextBar signals={operatorSignals} />
      <div className="c-view">
        {/* Demo toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button
            className={`c-filter${demoEnabled ? ' c-filter--active' : ''}`}
            onClick={toggleDemo}
            title={demoEnabled ? 'Showing demo fallback data when live data is empty' : 'Showing only live data — empty when no rows'}
          >
            {demoEnabled ? 'DEMO ON' : 'DEMO OFF'}
          </button>
          <span className="c-sub">{demoEnabled ? 'Mock data shown when live API returns no rows' : 'Only live indexer data — no fallback'}</span>
        </div>

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
