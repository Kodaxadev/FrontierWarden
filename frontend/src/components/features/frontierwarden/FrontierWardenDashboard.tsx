// FrontierWardenDashboard v3 — tab-based navigation shell
// One focused view at a time. No simultaneous panels.

import { useState } from 'react';
import { FwHeader }           from './FwHeader';
import { FwNav }              from './FwNav';
import { GateIntelView }      from './views/GateIntelView';
import { KillboardView }      from './views/KillboardView';
import { ReputationView }     from './views/ReputationView';
import { ContractsView }      from './views/ContractsView';
import { PolicyView }         from './views/PolicyView';
import { OracleView }         from './views/OracleView';
import { SocialView }         from './views/SocialView';
import { DisputesView }       from './views/DisputesView';
import { TrustConsoleView }   from './views/TrustConsoleView';
import { useFrontierWardenData } from '../../../hooks/useFrontierWardenData';
import { useDemoFallback } from '../../../hooks/useDemoFallback';

export type FwTab = 'gates' | 'trust' | 'killboard' | 'reputation' | 'contracts' | 'policy' | 'oracle' | 'social' | 'disputes';

export function FrontierWardenDashboard() {
  const [tab, setTab] = useState<FwTab>('gates');
  const { demoEnabled, toggleDemo } = useDemoFallback();
  const { data, live, loading, reputationLive, killboardLive, policyLive, contractsLive, provenance, error } = useFrontierWardenData({ demoEnabled });

  return (
    <div className="c-shell">
      <FwHeader data={data} />
      <FwNav active={tab} onChange={setTab} alerts={data.alerts} />
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

        {tab === 'gates'      && <GateIntelView  data={data} live={live} loading={loading} error={error} provenance={provenance.gateNetwork} />}
        {tab === 'trust'      && <TrustConsoleView data={data} live={live} loading={loading} error={error} provenance={provenance.gateNetwork} />}
        {tab === 'killboard'  && <KillboardView  data={data} live={killboardLive} loading={loading} error={error} provenance={provenance.killboard} />}
        {tab === 'reputation' && <ReputationView data={data} live={reputationLive} loading={loading} error={error} provenance={provenance.reputation} />}
        {tab === 'contracts'  && <ContractsView  data={data} live={contractsLive} loading={loading} error={error} provenance={provenance.contracts} />}
        {tab === 'policy'     && <PolicyView     data={data} live={policyLive} loading={loading} error={error} provenance={provenance.policy} />}
        {tab === 'oracle'     && <OracleView     provenance={provenance.gateNetwork} />}
        {tab === 'social'     && <SocialView     provenance={provenance.reputation} />}
        {tab === 'disputes'   && <DisputesView   provenance={provenance.killboard} />}
      </div>
    </div>
  );
}
