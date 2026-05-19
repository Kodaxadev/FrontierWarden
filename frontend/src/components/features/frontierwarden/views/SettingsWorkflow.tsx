// SettingsWorkflow — "Configure trust domain"
// Groups: Policy (gate policy editor), Disputes (fraud challenges), Oracle (Advanced).
// Operators configure their domain rules and manage dispute resolution here.

import { useState } from 'react';
import { PolicyView } from './PolicyView';
import { DisputesView } from './DisputesView';
import { OracleView } from './OracleView';
import { WorkflowSubNav } from './DashboardWorkflow';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

type SubTab = 'policy' | 'disputes' | 'oracle';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  policyLive: boolean;
  provenance: {
    policy: Provenance;
    killboard: Provenance;
    gateNetwork: Provenance;
  };
}

export function SettingsWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('policy');

  return (
    <div>
      <p className="c-section-header">Configure trust domain</p>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'policy',   label: 'Gate Policy' },
        { id: 'disputes', label: 'Disputes' },
        { id: 'oracle',   label: 'Oracle (Advanced)' },
      ]} />
      {sub === 'policy' && (
        <PolicyView
          data={props.data} live={props.policyLive} loading={props.loading}
          error={props.error} provenance={props.provenance.policy}
        />
      )}
      {sub === 'disputes' && (
        <DisputesView provenance={props.provenance.killboard} />
      )}
      {sub === 'oracle' && (
        <OracleView provenance={props.provenance.gateNetwork} />
      )}
    </div>
  );
}
