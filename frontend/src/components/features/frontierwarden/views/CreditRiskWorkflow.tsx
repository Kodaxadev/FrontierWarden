// CreditRiskWorkflow — "Review credit risk"
// Groups: Contracts (loan queue) + Social (vouches, lending, profiles).
// Operators come here for counterparty credit decisions.

import { useState } from 'react';
import { ContractsView } from './ContractsView';
import { SocialView } from './SocialView';
import { WorkflowSubNav } from './DashboardWorkflow';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

type SubTab = 'contracts' | 'social';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  contractsLive: boolean;
  provenance: {
    contracts: Provenance;
    reputation: Provenance;
  };
}

export function CreditRiskWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('contracts');

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--c-hi)', margin: '0 0 12px 0' }}>Review credit risk</p>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'contracts', label: 'Contract Queue' },
        { id: 'social',    label: 'Vouches & Lending' },
      ]} />
      {sub === 'contracts' && (
        <ContractsView
          data={props.data} live={props.contractsLive} loading={props.loading}
          error={props.error} provenance={props.provenance.contracts}
        />
      )}
      {sub === 'social' && (
        <SocialView provenance={props.provenance.reputation} />
      )}
    </div>
  );
}
