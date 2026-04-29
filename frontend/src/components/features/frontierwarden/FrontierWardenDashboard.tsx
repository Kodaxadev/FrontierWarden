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

export type FwTab = 'gates' | 'trust' | 'killboard' | 'reputation' | 'contracts' | 'policy' | 'oracle' | 'social' | 'disputes';

export function FrontierWardenDashboard() {
  const [tab, setTab] = useState<FwTab>('gates');
  const { data, live, loading, reputationLive, killboardLive, policyLive, contractsLive, error } = useFrontierWardenData();

  return (
    <div className="c-shell">
      <FwHeader data={data} />
      <FwNav active={tab} onChange={setTab} alerts={data.alerts} />
      <div className="c-view">
        {tab === 'gates'      && <GateIntelView  data={data} live={live} loading={loading} error={error} />}
        {tab === 'trust'      && <TrustConsoleView data={data} />}
        {tab === 'killboard'  && <KillboardView  data={data} live={killboardLive} loading={loading} error={error} />}
        {tab === 'reputation' && <ReputationView data={data} live={reputationLive} loading={loading} error={error} />}
        {tab === 'contracts'  && <ContractsView  data={data} live={contractsLive} loading={loading} error={error} />}
        {tab === 'policy'     && <PolicyView     data={data} live={policyLive} loading={loading} error={error} />}
        {tab === 'oracle'     && <OracleView />}
        {tab === 'social'     && <SocialView />}
        {tab === 'disputes'   && <DisputesView />}
      </div>
    </div>
  );
}
