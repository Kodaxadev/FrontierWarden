// OperatorWorldGateBindingPanel — tenant/operator world Gate binding UI.
//
// Lets a connected operator bind their FrontierWarden GatePolicy to one of
// their discovered world Gate candidates.
//
// Hard boundary:
//   - Does NOT call authorize_extension
//   - Does NOT borrow OwnerCap<Gate>
//   - Does NOT mutate the world Gate
//   - Does NOT claim BINDING VERIFIED
//   - Only records GatePolicy -> world_gate_id in the policy layer

import { useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useOperatorGatePolicies } from '../../../hooks/useOperatorGatePolicies';
import { useOperatorGateAuthority } from '../../../hooks/useOperatorGateAuthority';
import { useBindOperatorWorldGate } from '../../../hooks/useBindOperatorWorldGate';
import { fetchGateBindingStatus } from '../../../lib/api';
import type { GateBindingStatusResponse } from '../../../types/api.types';
import { GateBindingStatusBadge } from './views/GateBindingStatusBadge';

const shortId = (value: string | null | undefined): string => {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function OperatorWorldGateBindingPanel() {
  const policies = useOperatorGatePolicies();
  const authority = useOperatorGateAuthority();
  const binding = useBindOperatorWorldGate((indexedBinding) => {
    // Refetch binding status for the newly bound policy
    if (indexedBinding.gatePolicyId) {
      fetchGateBindingStatus(indexedBinding.gatePolicyId).catch(() => {});
    }
  });

  const [selectedPolicyIndex, setSelectedPolicyIndex] = useState(0);
  const [selectedWorldGateId, setSelectedWorldGateId] = useState('');

  const selectedPolicy = policies.policies[selectedPolicyIndex] ?? null;

  // Check if the selected policy is already bound
  const [existingBinding, setExistingBinding] = useState<GateBindingStatusResponse | null>(null);
  const [bindingCheckLoading, setBindingCheckLoading] = useState(false);

  // Derive candidate world Gates from operator authority discovery
  const candidateGates = authority.gates;

  // Check if selected world Gate is owned by connected operator
  const selectedGateOwned = useMemo(() => {
    if (!selectedWorldGateId) return false;
    return authority.gates.some(g => sameId(g.worldGateId, selectedWorldGateId));
  }, [selectedWorldGateId, authority.gates]);

  // Check if selected policy already has a binding to the selected gate
  const alreadyBoundToSelected = useMemo(() => {
    if (!existingBinding || !selectedWorldGateId) return false;
    return sameId(existingBinding.worldGateId, selectedWorldGateId);
  }, [existingBinding, selectedWorldGateId]);

  const busy = ['building', 'sponsoring', 'signing', 'executing'].includes(binding.sponsoredState.step);
  const bindSubmitted = binding.bindState.step === 'submitted' || binding.bindState.step === 'indexed';

  const canBind = Boolean(
    authority.walletAddress &&
    selectedPolicy &&
    selectedWorldGateId &&
    !busy &&
    !bindSubmitted &&
    selectedGateOwned &&
    !alreadyBoundToSelected &&
    (!existingBinding || existingBinding.bindingStatus === 'unbound')
  );

  const disabledReason = !authority.walletAddress
    ? 'Connect wallet'
    : !policies.hasAny
      ? 'No GatePolicy provisioned'
      : !selectedPolicy
        ? 'Select a GatePolicy'
        : !selectedWorldGateId
          ? 'Select a world Gate'
          : !selectedGateOwned
            ? 'Selected world Gate is not owned by connected operator'
            : alreadyBoundToSelected
              ? 'Policy already bound to this world Gate'
              : existingBinding && existingBinding.bindingStatus !== 'unbound'
                ? `Policy already ${existingBinding.bindingStatus}`
                : busy
                  ? `Transaction ${binding.sponsoredState.step}`
                  : null;

  const handleBind = () => {
    if (!canBind || !selectedPolicy) return;
    void binding.bindWorldGate({
      gatePolicyId: selectedPolicy.gatePolicyId,
      gateAdminCapId: selectedPolicy.gateAdminCapId,
      worldGateId: selectedWorldGateId,
    });
  };

  // Check existing binding status when policy selection changes
  const checkBinding = async (policyId: string) => {
    setBindingCheckLoading(true);
    try {
      const result = await fetchGateBindingStatus(policyId);
      setExistingBinding(result);
    } catch {
      setExistingBinding(null);
    } finally {
      setBindingCheckLoading(false);
    }
  };

  const handlePolicySelect = (index: number) => {
    setSelectedPolicyIndex(index);
    const policy = policies.policies[index];
    if (policy) {
      void checkBinding(policy.gatePolicyId);
    }
  };

  return (
    <div style={{
      maxWidth: 900, marginBottom: 28, padding: 20,
      border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)',
    }}>
      <div className="c-stat__label" style={{ marginBottom: 12 }}>World Gate Binding</div>

      <div className="c-sub" style={{ marginBottom: 14 }}>
        Binding points your FrontierWarden GatePolicy at a world Gate. It does not authorize the
        FrontierWarden extension on that Gate. BINDING VERIFIED requires a later OwnerCap&lt;Gate&gt;
        authorization step.
      </div>

      {/* Policy selection */}
      <div className="c-kv" style={{ marginBottom: 10 }}>
        <span className="c-kv__k">GatePolicy</span>
        {policies.loading ? (
          <span className="c-kv__v">Scanning...</span>
        ) : policies.policies.length === 0 ? (
          <span className="c-kv__v">No policies found</span>
        ) : (
          <select
            value={selectedPolicyIndex}
            onChange={(e) => handlePolicySelect(Number(e.target.value))}
            style={{
              maxWidth: 520, background: 'var(--c-bg)', color: 'var(--c-hi)',
              border: '1px solid var(--c-border)', padding: '6px 10px', fontSize: 12,
            }}
          >
            {policies.policies.map((entry, i) => (
              <option key={entry.gateAdminCapId} value={i}>
                Policy {shortId(entry.gatePolicyId)} / Cap {shortId(entry.gateAdminCapId)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Current binding status */}
      {selectedPolicy && (
        <div className="c-kv" style={{ marginBottom: 10 }}>
          <span className="c-kv__k">Binding status</span>
          <span className="c-kv__v">
            {bindingCheckLoading ? 'Checking...' : existingBinding ? (
              <GateBindingStatusBadge binding={existingBinding} />
            ) : (
              'UNBOUND'
            )}
          </span>
        </div>
      )}

      {/* World Gate selection */}
      <div className="c-kv" style={{ marginBottom: 10 }}>
        <span className="c-kv__k">World Gate</span>
        {authority.isLoading ? (
          <span className="c-kv__v">Discovering...</span>
        ) : candidateGates.length === 0 ? (
          <span className="c-kv__v">No world Gate candidates found</span>
        ) : (
          <select
            value={selectedWorldGateId}
            onChange={(e) => setSelectedWorldGateId(e.target.value)}
            style={{
              maxWidth: 520, background: 'var(--c-bg)', color: 'var(--c-hi)',
              border: '1px solid var(--c-border)', padding: '6px 10px', fontSize: 12,
            }}
          >
            <option value="">Select a world Gate</option>
            {candidateGates.map(gate => (
              <option key={gate.worldGateId} value={gate.worldGateId}>
                Gate {shortId(gate.worldGateId)} / {gate.status ?? 'unknown'}
                {gate.linkedGateId ? ` / linked ${shortId(gate.linkedGateId)}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Selected gate details */}
      {selectedWorldGateId && (
        <div style={{ marginTop: 8, paddingLeft: 16 }}>
          {!selectedGateOwned && (
            <div className="c-sub" style={{ color: 'var(--c-crimson)', marginTop: 8 }}>
              Warning: Selected world Gate is not owned by the connected operator.
              Binding will fail if you do not control the OwnerCap&lt;Gate&gt; for this Gate.
            </div>
          )}
          {selectedGateOwned && (
            <div className="c-sub" style={{ color: 'var(--c-green)', marginTop: 8 }}>
              Connected operator controls OwnerCap&lt;Gate&gt; for this world Gate.
            </div>
          )}
        </div>
      )}

      {/* Authority summary */}
      {authority.walletAddress && (
        <div style={{ marginTop: 14 }}>
          <div className="c-kv">
            <span className="c-kv__k">Connected wallet</span>
            <span className="c-kv__v">{shortId(authority.walletAddress)}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Character</span>
            <span className="c-kv__v">{authority.characterName ?? shortId(authority.characterId)}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Gate OwnerCaps</span>
            <span className="c-kv__v">{authority.ownerCaps.length}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Candidate Gates</span>
            <span className="c-kv__v">{candidateGates.length}</span>
          </div>
        </div>
      )}

      {/* Transaction status */}
      {binding.bindState.message && (
        <div className="c-sub" style={{ marginTop: 12 }}>
          {binding.bindState.message}
          {binding.bindState.digest && <> Tx {shortId(binding.bindState.digest)}.</>}
        </div>
      )}
      {(binding.bindState.error || binding.sponsoredState.error) && (
        <div className="c-sub" style={{ color: 'var(--c-crimson)', marginTop: 12 }}>
          {binding.bindState.error ?? binding.sponsoredState.error}
        </div>
      )}

      {/* Action */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div className="c-wallet-connect">
          <ConnectButton>CONNECT WALLET</ConnectButton>
        </div>
        <button
          className="c-commit"
          disabled={!canBind}
          title={disabledReason ?? 'Bind policy to world gate'}
          onClick={handleBind}
        >
          {busy ? binding.sponsoredState.step.toUpperCase()
            : bindSubmitted ? (binding.bindState.step === 'indexed' ? 'CLEAR' : 'SUBMITTED')
            : 'BIND POLICY TO WORLD GATE'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>
          GateAdminCap = FrontierWarden policy authority · OwnerCap&lt;Gate&gt; = world Gate extension authority
        </span>
      </div>
    </div>
  );
}
