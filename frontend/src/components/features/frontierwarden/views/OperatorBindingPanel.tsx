import { useEffect, useMemo, useState } from 'react';
import { fetchGateBindingStatus, fetchWorldGates } from '../../../../lib/api';
import type {
  GateBindingStatusResponse,
  WorldGateCandidate,
} from '../../../../types/api.types';
import { GateBindingStatusBadge } from './GateBindingStatusBadge';

interface OperatorBindingPanelProps {
  gatePolicyId: string;
}

interface BindingReadState {
  binding: GateBindingStatusResponse | null;
  worldGates: WorldGateCandidate[];
  loading: boolean;
  error: string | null;
}

function shortId(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function gateLabel(gate: WorldGateCandidate): string {
  const linked = gate.linkedGateId ? ` -> ${shortId(gate.linkedGateId)}` : ' -> unlinked';
  return `${shortId(gate.worldGateId)} / item ${gate.itemId}${linked}`;
}

export function OperatorBindingPanel({ gatePolicyId }: OperatorBindingPanelProps) {
  const [state, setState] = useState<BindingReadState>({
    binding: null,
    worldGates: [],
    loading: true,
    error: null,
  });
  const [selectedWorldGateId, setSelectedWorldGateId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    Promise.all([
      fetchGateBindingStatus(gatePolicyId),
      fetchWorldGates('stillness'),
    ])
      .then(([binding, worldGateResponse]) => {
        if (cancelled) return;
        setState({
          binding,
          worldGates: worldGateResponse.gates,
          loading: false,
          error: null,
        });
        setSelectedWorldGateId(binding.worldGateId ?? worldGateResponse.gates[0]?.worldGateId ?? '');
      })
      .catch(err => {
        if (cancelled) return;
        setState({
          binding: null,
          worldGates: [],
          loading: false,
          error: err instanceof Error ? err.message : 'binding preflight fetch failed',
        });
      });

    return () => { cancelled = true; };
  }, [gatePolicyId]);

  const selectedGate = useMemo(
    () => state.worldGates.find(gate => gate.worldGateId === selectedWorldGateId) ?? null,
    [selectedWorldGateId, state.worldGates],
  );

  return (
    <div style={{
      marginTop: 24,
      padding: 20,
      border: '1px solid var(--c-border)',
      background: 'rgba(255,255,255,0.018)',
    }}>
      <div className="c-stat__label" style={{ marginBottom: 12 }}>
        Operator Binding Preflight
      </div>

      <div className="c-sub" style={{ marginBottom: 14 }}>
        Binding proves GatePolicy -&gt; world_gate_id. Extension authorization proves
        world_gate_id -&gt; extension TypeName. Verified requires both.
      </div>

      <div className="c-kv">
        <span className="c-kv__k">GatePolicy</span>
        <span className="c-kv__v">{shortId(gatePolicyId)}</span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Current state</span>
        <span className="c-kv__v">
          {state.binding ? <GateBindingStatusBadge binding={state.binding} /> : 'loading'}
        </span>
      </div>

      <label className="c-kv" style={{ alignItems: 'center' }}>
        <span className="c-kv__k">World Gate candidate</span>
        <select
          value={selectedWorldGateId}
          disabled={state.loading || state.worldGates.length === 0}
          onChange={event => setSelectedWorldGateId(event.target.value)}
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'var(--c-bg)',
            color: 'var(--c-hi)',
            border: '1px solid var(--c-border)',
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          {state.worldGates.length === 0 && <option value="">No indexed world gates</option>}
          {state.worldGates.map(gate => (
            <option key={gate.worldGateId} value={gate.worldGateId}>
              {gateLabel(gate)}
            </option>
          ))}
        </select>
      </label>

      {selectedGate && (
        <div style={{ marginTop: 12 }}>
          <div className="c-kv">
            <span className="c-kv__k">World status</span>
            <span className="c-kv__v">{selectedGate.status.toUpperCase()}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Linked gate</span>
            <span className="c-kv__v">{shortId(selectedGate.linkedGateId)}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Extension evidence</span>
            <span className="c-kv__v">
              {selectedGate.fwExtensionActive ? 'WORLD EXTENSION ACTIVE' : 'NO FW EXTENSION EVIDENCE'}
            </span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Checkpoint</span>
            <span className="c-kv__v">{selectedGate.checkpointUpdated}</span>
          </div>
        </div>
      )}

      {state.error && (
        <div className="c-sub" style={{ color: 'var(--c-crimson)', marginTop: 12 }}>
          {state.error}
        </div>
      )}

      <button className="c-commit" disabled style={{ marginTop: 16 }}>
        Attempt binding unavailable
      </button>
    </div>
  );
}
