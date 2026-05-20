// GateOpsWorkflow — "Operate a gate"
// P0 fix: adds Network Overview sub-tab alongside Gate Detail.
// Network Overview shows all gates at a glance; Gate Detail is the full GateIntelView.

import { useState } from 'react';
import { GateIntelView } from './GateIntelView';
import { GateNetworkGrid } from './GateNetworkGrid';
import { WorkflowSubNav } from './DashboardWorkflow';
import { useGateGroups } from '../../../../hooks/useGateGroups';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

type SubTab = 'network' | 'detail';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  provenance: Provenance;
  onNavigateSettings?: () => void;
}

export function GateOpsWorkflow(props: Props) {
  const [sub, setSub] = useState<SubTab>('network');
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const { groups, labels: groupLabels, setGroup } = useGateGroups();

  function drillIntoGate(gateId: string) {
    setSelectedGateId(gateId);
    setSub('detail');
  }

  return (
    <div>
      <p className="c-section-header">Operate a gate</p>
      <WorkflowSubNav active={sub} onChange={setSub} tabs={[
        { id: 'network', label: 'Network Overview' },
        { id: 'detail',  label: 'Gate Detail' },
      ]} />
      {sub === 'network' && (
        <GateNetworkGrid
          data={props.data}
          selectedGateId={selectedGateId}
          onSelectGate={drillIntoGate}
          groups={groups}
          groupLabels={groupLabels}
          onSetGroup={setGroup}
        />
      )}
      {sub === 'detail' && (
        <GateIntelView
          data={props.data} live={props.live} loading={props.loading}
          error={props.error} provenance={props.provenance}
          initialGateId={selectedGateId}
          onNavigatePolicy={props.onNavigateSettings}
        />
      )}
    </div>
  );
}
