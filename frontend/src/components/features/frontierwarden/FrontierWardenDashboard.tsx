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
import { FW_DATA }            from './fw-data';

export type FwTab = 'gates' | 'killboard' | 'reputation' | 'contracts' | 'policy';

export function FrontierWardenDashboard() {
  const [tab, setTab] = useState<FwTab>('gates');
  const data = FW_DATA;

  return (
    <div className="c-shell">
      <FwHeader data={data} />
      <FwNav active={tab} onChange={setTab} alerts={data.alerts} />
      <div className="c-view">
        {tab === 'gates'      && <GateIntelView  data={data} />}
        {tab === 'killboard'  && <KillboardView  data={data} />}
        {tab === 'reputation' && <ReputationView data={data} />}
        {tab === 'contracts'  && <ContractsView  data={data} />}
        {tab === 'policy'     && <PolicyView     data={data} />}
      </div>
    </div>
  );
}
