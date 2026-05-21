// CheckTrustWorkflow — "Check a pilot or counterparty"
// Groups: Trust Console (evaluate), Trust Dossier (deep profile), Killboard (evidence).
// Operators start here when they want to look someone up.

import { useState } from 'react';
import { TrustConsoleView } from './TrustConsoleView';
import { ReputationView } from './ReputationView';
import { KillboardView } from './KillboardView';
import { WorkflowSubNav } from '../WorkflowSubNav';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

type SubTab = 'evaluate' | 'dossier' | 'evidence';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  reputationLive: boolean;
  killboardLive: boolean;
  provenance: {
    gateNetwork: Provenance;
    reputation: Provenance;
    killboard: Provenance;
  };
}

export function CheckTrustWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('evaluate');

  return (
    <div>
      <p className="c-section-header">Check a pilot or counterparty</p>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'evaluate', label: 'Evaluate Trust' },
        { id: 'dossier',  label: 'Trust Dossier' },
        { id: 'evidence', label: 'Combat Evidence' },
      ]} />
      {sub === 'evaluate' && (
        <TrustConsoleView
          data={props.data} live={props.live} loading={props.loading}
          error={props.error} provenance={props.provenance.gateNetwork}
        />
      )}
      {sub === 'dossier' && (
        <ReputationView
          data={props.data} live={props.reputationLive} loading={props.loading}
          error={props.error} provenance={props.provenance.reputation}
        />
      )}
      {sub === 'evidence' && (
        <KillboardView
          data={props.data} live={props.killboardLive} loading={props.loading}
          error={props.error} provenance={props.provenance.killboard}
        />
      )}
    </div>
  );
}
