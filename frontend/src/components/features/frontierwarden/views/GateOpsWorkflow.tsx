// GateOpsWorkflow — "Operate a gate"
// Wraps GateIntelView with a workflow header.
// Single-view workflow (no sub-tabs needed — GateIntelView is already a full surface).

import { GateIntelView } from './GateIntelView';
import type { FwData } from '../fw-data';
import type { Provenance } from '../LiveStatus';

interface Props {
  data: FwData;
  live: boolean;
  loading: boolean;
  error: string | null;
  provenance: Provenance;
}

export function GateOpsWorkflow(props: Props) {
  return (
    <div>
      <p className="c-section-header">Operate a gate</p>
      <GateIntelView
        data={props.data} live={props.live} loading={props.loading}
        error={props.error} provenance={props.provenance}
      />
    </div>
  );
}
