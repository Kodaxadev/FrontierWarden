// OperatorExtensionAuthPanel — tenant/operator world Gate extension authorization UI.
//
// Lets a connected operator authorize the FrontierWardenAuth extension on
// one of their discovered world Gate candidates using the borrow/authorize/return pattern.
//
// Hard boundary:
//   - Does NOT create GatePolicy or GateAdminCap
//   - Does NOT bind GatePolicy to world Gate
//   - Does NOT change trust settings
//   - Only authorizes the FrontierWardenAuth extension on an already-owned Gate
//   - Shows BINDING VERIFIED only after indexer confirms extension evidence

import { useCallback, useMemo, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useOperatorGatePolicies } from '../../../hooks/useOperatorGatePolicies';
import { useOperatorGateAuthority } from '../../../hooks/useOperatorGateAuthority';
import { useAuthorizeFWExtension } from '../../../hooks/useAuthorizeFWExtension';
import { fetchGateBindingStatus } from '../../../lib/api';
import type { GateBindingStatusResponse } from '../../../types/api.types';
import { GateBindingStatusBadge } from './views/GateBindingStatusBadge';
import { InfoTooltip } from './InfoTooltip';
import { SigningFailureGuide } from './SigningFailureGuide';
import { HELP } from './operator-help';

const shortId = (value: string | null | undefined): string => {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function OperatorExtensionAuthPanel() {
  const policies = useOperatorGatePolicies();
  const authority = useOperatorGateAuthority();
  const authTx = useAuthorizeFWExtension((verifiedBinding) => {
    if (verifiedBinding.gatePolicyId) {
      fetchGateBindingStatus(verifiedBinding.gatePolicyId).catch(() => {});
    }
  });

  const [selectedPolicyIndex, setSelectedPolicyIndex] = useState(0);
  const [selectedWorldGateId, setSelectedWorldGateId] = useState('');

  const selectedPolicy = policies.policies[selectedPolicyIndex] ?? null;

  // Find the matching gate from operator authority
  const selectedGate = useMemo(
    () => authority.gates.find(g => sameId(g.worldGateId, selectedWorldGateId)) ?? null,
    [selectedWorldGateId, authority.gates],
  );

  // Resolve OwnerCap and Character for the selected gate
  const ownerCapForGate = useMemo(() => {
    if (!selectedGate) return null;
    return authority.ownerCaps.find(cap => sameId(cap.authorizedObjectId, selectedGate.worldGateId)) ?? null;
  }, [selectedGate, authority.ownerCaps]);

  // Find the Character that owns this OwnerCap
  const characterForGate = useMemo(() => {
    if (!ownerCapForGate) return null;
    return authority.characters.find(c => c.objectId === ownerCapForGate.sourceId) ?? null;
  }, [ownerCapForGate, authority.characters]);

  // Check existing binding status
  const [existingBinding, setExistingBinding] = useState<GateBindingStatusResponse | null>(null);
  const [bindingCheckLoading, setBindingCheckLoading] = useState(false);

  const isVerified = existingBinding?.bindingStatus === 'verified' || existingBinding?.fwExtensionActive;
  const isBound = existingBinding?.bindingStatus === 'bound';

  const busy = ['building', 'sponsoring', 'signing', 'executing'].includes(authTx.sponsoredState.step);
  const submitted = authTx.authorizeState.step === 'submitted' || authTx.authorizeState.step === 'verified';

  const canAuthorize = Boolean(
    authority.walletAddress &&
    selectedPolicy &&
    selectedGate &&
    ownerCapForGate &&
    characterForGate &&
    !busy &&
    !submitted &&
    !isVerified &&
    isBound
  );

  const disabledReason = !authority.walletAddress
    ? 'Connect wallet'
    : !policies.hasAny
      ? 'No GatePolicy provisioned'
      : !selectedPolicy
        ? 'Select a GatePolicy'
        : !selectedGate
          ? 'Select a world Gate'
          : !ownerCapForGate
            ? 'OwnerCap<Gate> not found for this Gate'
            : !characterForGate
              ? 'Character not found for this OwnerCap'
              : !isBound
                ? 'GatePolicy must be BOUND to this Gate before authorization'
                : isVerified
                  ? 'Extension already authorized (BINDING VERIFIED)'
                  : busy
                    ? `Transaction ${authTx.sponsoredState.step}`
                    : null;

  const handleAuthorize = () => {
    if (!canAuthorize || !selectedPolicy || !selectedGate || !ownerCapForGate || !characterForGate) return;
    void authTx.authorize({
      worldGateId: selectedGate.worldGateId,
      ownerCapId: ownerCapForGate.objectId,
      characterId: characterForGate.objectId,
      gatePolicyId: selectedPolicy.gatePolicyId,
    });
  };

  const handleRetry = useCallback(() => {
    if (!selectedPolicy || !selectedGate || !ownerCapForGate || !characterForGate) return;
    authTx.reset();
    void authTx.authorize({
      worldGateId: selectedGate.worldGateId,
      ownerCapId: ownerCapForGate.objectId,
      characterId: characterForGate.objectId,
      gatePolicyId: selectedPolicy.gatePolicyId,
    });
  }, [selectedPolicy, selectedGate, ownerCapForGate, characterForGate, authTx]);

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

  // Filter gates that are bound to the selected policy
  const boundGates = useMemo(() => {
    if (!selectedPolicy || !existingBinding) return authority.gates;
    // Show all gates but highlight the one matching the binding
    return authority.gates;
  }, [selectedPolicy, existingBinding, authority.gates]);

  return (
    <div style={{
      maxWidth: 900, marginBottom: 28, padding: 20,
      border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div className="c-stat__label">Extension Authorization</div>
        <InfoTooltip concept={HELP.frontierWardenAuth} />
      </div>

      <div className="c-sub" style={{ marginBottom: 14 }}>
        Authorize the FrontierWardenAuth extension on your world Gate using OwnerCap&lt;Gate&gt;.
        This achieves BINDING VERIFIED: the physical Gate is now governed by your FrontierWarden policy.
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
              'UNBOUND — bind policy to world Gate first'
            )}
          </span>
        </div>
      )}

      {/* World Gate selection */}
      <div className="c-kv" style={{ marginBottom: 10 }}>
        <span className="c-kv__k">World Gate</span>
        {authority.isLoading ? (
          <span className="c-kv__v">Discovering Gate authority…</span>
        ) : boundGates.length === 0 ? (
          <span className="c-kv__v" style={{ color: 'var(--c-mid)' }}>
            No world Gate authority found for this wallet
          </span>
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
            {boundGates.map(gate => (
              <option key={gate.worldGateId} value={gate.worldGateId}>
                Gate {shortId(gate.worldGateId)} / {gate.status ?? 'unknown'}
                {gate.linkedGateId ? ` / linked ${shortId(gate.linkedGateId)}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Authorization prerequisites */}
      {selectedGate && (
        <div style={{ marginTop: 8, paddingLeft: 16 }}>
          <div className="c-kv">
            <span className="c-kv__k">OwnerCap&lt;Gate&gt;</span>
            <span className="c-kv__v">
              {ownerCapForGate
                ? `${shortId(ownerCapForGate.objectId)} (${ownerCapForGate.source})`
                : 'NOT FOUND'}
            </span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Character</span>
            <span className="c-kv__v">
              {characterForGate
                ? `${characterForGate.name ?? shortId(characterForGate.objectId)}`
                : 'NOT FOUND'}
            </span>
          </div>

          {!ownerCapForGate && (
            <div className="c-sub" style={{ color: 'var(--c-amber)', marginTop: 8 }}>
              No OwnerCap&lt;Gate&gt; detected for this Gate in the connected wallet.
              Authorization requires the Character that owns this Gate to be connected.
            </div>
          )}
          {ownerCapForGate && !characterForGate && (
            <div className="c-sub" style={{ color: 'var(--c-crimson)', marginTop: 8 }}>
              Character not found for this OwnerCap. Authorization cannot proceed.
            </div>
          )}
          {!isBound && (
            <div className="c-sub" style={{ color: 'var(--c-amber)', marginTop: 8 }}>
              GatePolicy must be BOUND to this world Gate before extension authorization.
              Complete the binding step first.
            </div>
          )}
          {isVerified && (
            <div className="c-sub" style={{ color: 'var(--c-green)', marginTop: 8 }}>
              BINDING VERIFIED — FrontierWardenAuth extension already authorized on this Gate.
            </div>
          )}
          {isBound && !isVerified && ownerCapForGate && characterForGate && (
            <div className="c-sub" style={{ color: 'var(--c-green)', marginTop: 8 }}>
              All prerequisites met. Ready to authorize FrontierWardenAuth extension.
            </div>
          )}
        </div>
      )}

      {/* PTB summary */}
      {selectedGate && ownerCapForGate && characterForGate && (
        <div style={{ marginTop: 14, paddingLeft: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div className="c-stat__label">Transaction Plan</div>
            <InfoTooltip concept={HELP.ptb} />
          </div>
          <div className="c-sub">
            1. borrow_owner_cap&lt;Gate&gt;(character, Receiving&lt;OwnerCap&gt;)
          </div>
          <div className="c-sub">
            2. authorize_extension&lt;FrontierWardenAuth&gt;(gate, &amp;OwnerCap)
          </div>
          <div className="c-sub">
            3. return_owner_cap&lt;Gate&gt;(character, OwnerCap, Receipt)
          </div>
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

          {!authority.isLoading && authority.ownerCaps.length === 0 && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              border: '1px solid var(--c-border)',
              background: 'rgba(8,13,20,0.5)',
              fontSize: 10,
              color: 'var(--c-mid)',
              lineHeight: 1.7,
            }}>
              No owned world Gate authority detected for this operator.
              <br />
              FrontierWarden is multi-tenant infrastructure. Each tribe or operator brings their
              own Gate and OwnerCap. To complete BINDING VERIFIED, connect with a Character that
              owns a world Gate, or have a tribe/operator connect their Gate-owning wallet.
            </div>
          )}
        </div>
      )}

      {/* Transaction status */}
      {authTx.authorizeState.message && (
        <div className="c-sub" style={{ marginTop: 12 }}>
          {authTx.authorizeState.message}
          {authTx.authorizeState.digest && <> Tx {shortId(authTx.authorizeState.digest)}.</>}
        </div>
      )}
      {authTx.sponsoredState.error ? (
        <SigningFailureGuide
          errorClass={authTx.sponsoredState.trace?.errorClass ?? null}
          error={authTx.sponsoredState.error}
          onRetry={canAuthorize ? handleRetry : undefined}
          onReset={authTx.reset}
        />
      ) : authTx.authorizeState.error ? (
        <div className="c-sub" style={{ color: 'var(--c-crimson)', marginTop: 12 }}>
          {authTx.authorizeState.error}
        </div>
      ) : null}

      {/* Action */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div className="c-wallet-connect">
          <ConnectButton>CONNECT WALLET</ConnectButton>
        </div>
        <button
          className="c-commit"
          disabled={!canAuthorize}
          title={disabledReason ?? 'Authorize FrontierWardenAuth extension'}
          onClick={handleAuthorize}
        >
          {busy ? authTx.sponsoredState.step.toUpperCase()
            : submitted ? (authTx.authorizeState.step === 'verified' ? 'CLEAR' : 'SUBMITTED')
            : isVerified ? 'VERIFIED'
            : 'AUTHORIZE EXTENSION'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>
          GateAdminCap = FrontierWarden policy authority · OwnerCap&lt;Gate&gt; = world Gate extension authority
        </span>
      </div>
    </div>
  );
}
