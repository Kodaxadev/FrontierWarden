// GatePolicyProvisionPanel — tenant operator GatePolicy provisioning UI.
//
// Displays:
//   - Connected wallet status
//   - Existing GatePolicy/GateAdminCap discovery (via useOperatorGatePolicies)
//   - Policy creation form when no existing policy is found
//
// Copy discipline:
//   - "Policy Provisioning" (NOT "World Gate Authorization")
//   - GateAdminCap = FrontierWarden policy authority
//   - OwnerCap<Gate> = world Gate extension authority
//   - BOUND = policy points to world Gate
//   - VERIFIED = extension authorized on world Gate
//
// This panel does NOT bind to a world Gate, does NOT call authorize_extension,
// and does NOT claim BINDING VERIFIED.

import { useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useOperatorGatePolicies } from '../../../hooks/useOperatorGatePolicies';
import { useCreateGate } from '../../../hooks/useCreateGate';
import { InfoTooltip } from './InfoTooltip';
import { OperatorFlowGuide } from './OperatorFlowGuide';
import { HELP } from './operator-help';

const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

const DEFAULT_SCHEMA = 'TRIBE_STANDING';
const DEFAULT_THRESHOLD = 500;
const DEFAULT_TOLL = 100_000_000;

export function GatePolicyProvisionPanel() {
  const policies = useOperatorGatePolicies();
  const { createGate, reset, state: txState } = useCreateGate();

  const [draftSchema, setDraftSchema] = useState(DEFAULT_SCHEMA);
  const [draftThreshold, setDraftThreshold] = useState(DEFAULT_THRESHOLD);
  const [draftToll, setDraftToll] = useState(DEFAULT_TOLL);

  const busy = ['building', 'sponsoring', 'signing', 'executing'].includes(txState.step);
  const done = txState.step === 'done';
  const error = txState.step === 'error';

  const statusColor = error
    ? 'var(--c-crimson)'
    : done
      ? 'var(--c-green)'
      : 'var(--c-mid)';

  if (policies.loading) {
    return (
      <div style={{
        maxWidth: 900, marginBottom: 28, padding: 20,
        border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Policy Provisioning</div>
        <div className="c-sub">Scanning for existing GateAdminCap objects...</div>
      </div>
    );
  }

  if (policies.hasAny) {
    return (
      <div style={{
        maxWidth: 900, marginBottom: 28, padding: 20,
        border: '1px solid rgba(0,210,255,0.25)', background: 'rgba(0,210,255,0.018)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div className="c-stat__label">Policy Provisioning</div>
          <InfoTooltip concept={HELP.gatePolicy} />
        </div>
        <div className="c-kv">
          <span className="c-kv__k">Status</span>
          <span className="c-kv__v" style={{ color: 'var(--c-green)' }}>Policy provisioned</span>
        </div>
        {policies.policies.map((entry, i) => (
          <div key={entry.gateAdminCapId} style={{ marginTop: i === 0 ? 12 : 8 }}>
            <div className="c-kv">
              <span className="c-kv__k">GatePolicy {i + 1}</span>
              <span className="c-kv__v">{shortId(entry.gatePolicyId)}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">GateAdminCap {i + 1}</span>
              <span className="c-kv__v">{shortId(entry.gateAdminCapId)}</span>
            </div>
          </div>
        ))}
        <div className="c-sub" style={{ marginTop: 14 }}>
          GateAdminCap is your FrontierWarden policy authority. OwnerCap&lt;Gate&gt; is world Gate extension authority.
          Binding to a world Gate is a separate step.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 900, marginBottom: 28, padding: 20,
      border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div className="c-stat__label">Policy Provisioning</div>
        <InfoTooltip concept={HELP.gatePolicy} />
      </div>
      <OperatorFlowGuide />
      <div className="c-sub" style={{ marginBottom: 18 }}>
        Create your FrontierWarden GatePolicy. This establishes your policy domain.
        Binding to a world Gate is a separate step.
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 18,
      }}>
        <label>
          <div className="c-policy__label">Schema ID</div>
          <input
            className="c-input"
            type="text"
            value={draftSchema}
            onChange={(e) => setDraftSchema(e.target.value)}
            placeholder="TRIBE_STANDING"
          />
        </label>
        <label>
          <div className="c-policy__label">Ally Threshold</div>
          <input
            className="c-input"
            inputMode="numeric"
            min={1}
            step={1}
            type="number"
            value={draftThreshold}
            onChange={(e) => setDraftThreshold(Number(e.target.value))}
          />
        </label>
        <label>
          <div className="c-policy__label">Base Toll (MIST)</div>
          <input
            className="c-input"
            inputMode="numeric"
            min={0}
            step={1}
            type="number"
            value={draftToll}
            onChange={(e) => setDraftToll(Number(e.target.value))}
          />
        </label>
      </div>

      <div style={{
        marginTop: 20, display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div className="c-wallet-connect">
          <ConnectButton>CONNECT WALLET</ConnectButton>
        </div>
        <button
          className="c-commit"
          disabled={busy}
          title={busy ? `Transaction ${txState.step}` : 'Provision new GatePolicy'}
          onClick={() => void createGate({
            schemaId: draftSchema,
            allyThreshold: draftThreshold,
            baseTollMist: draftToll,
          })}
        >
          {busy ? txState.step.toUpperCase() : done ? 'CLEAR' : 'PROVISION POLICY'}
        </button>
        <span style={{ fontSize: 10, color: statusColor }}>
          {done && txState.digest
            ? `provisioned · tx ${shortId(txState.digest)}`
            : error && txState.error
              ? (txState.error.length > 120 ? `${txState.error.slice(0, 120)}…` : txState.error)
              : 'GateAdminCap = FrontierWarden policy authority · OwnerCap&lt;Gate&gt; = world Gate extension authority'}
        </span>
      </div>
    </div>
  );
}
