import type { FwGate } from '../fw-data';
import { GateBindingStatusBadge } from '../views/GateBindingStatusBadge';

interface Props {
  gates: FwGate[];
}

export function SentinelBindingStatus({ gates }: Props) {
  const bindings = gates
    .map(gate => gate.binding)
    .filter(binding => binding != null);
  const verified = bindings.filter(binding => binding.bindingStatus === 'verified').length;
  const bound = bindings.filter(binding => binding.bindingStatus === 'bound').length;
  const unbound = Math.max(0, gates.length - verified - bound);
  const primary = bindings.find(binding => binding.bindingStatus === 'verified')
    ?? bindings.find(binding => binding.bindingStatus === 'bound')
    ?? bindings[0];

  return (
    <div className="ns-block">
      <div className="ns-block__header">
        <span className="ns-label">WORLD BINDING</span>
        <GateBindingStatusBadge binding={primary} compact />
      </div>

      <div className="ns-kv-grid">
        <div className="ns-kv">
          <span className="ns-kv__k">VERIFIED</span>
          <span className="ns-kv__v ns-mono">{verified}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">BOUND</span>
          <span className="ns-kv__v ns-mono">{bound}</span>
        </div>
        <div className="ns-kv">
          <span className="ns-kv__k">UNBOUND</span>
          <span className="ns-kv__v ns-mono">{unbound}</span>
        </div>
      </div>

      <div className="ns-hint">
        Advisory context only. World-gate enforcement requires verified binding
        and active extension evidence.
      </div>
    </div>
  );
}
