import type { FwData, FwGate } from '../fw-data';
import { GateBindingStatusBadge } from './GateBindingStatusBadge';

interface GateOperationsOverviewProps {
  data: FwData;
  selectedGate: FwGate | null;
}

function summaryValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'Not selected';
  return String(value);
}

function bindingCopy(gate: FwGate | null): { status: string; next: string } {
  if (!gate) {
    return {
      status: 'No GatePolicy selected',
      next: 'Select an indexed gate policy to inspect binding state.',
    };
  }
  if (!gate.binding || gate.binding.bindingStatus === 'unbound') {
    return {
      status: 'UNBOUND',
      next: 'Bind the GatePolicy to a world gate before checking topology.',
    };
  }
  if (gate.binding.bindingStatus === 'bound' && !gate.binding.fwExtensionActive) {
    return {
      status: 'BOUND',
      next: 'Authorize FrontierWardenAuth with OwnerCap<Gate> to verify binding.',
    };
  }
  return {
    status: 'BINDING VERIFIED',
    next: 'Binding and extension evidence are indexed for this gate.',
  };
}

function OverviewCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 14 }}>
      <div className="c-stat__label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ color: 'var(--c-hi)', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        {value}
      </div>
      <div className="c-sub" style={{ lineHeight: 1.6 }}>{detail}</div>
    </section>
  );
}

export function GateOperationsOverview({ data, selectedGate }: GateOperationsOverviewProps) {
  const binding = bindingCopy(selectedGate);
  const policy = data.policy;

  return (
    <section style={{
      border: '1px solid var(--c-border)',
      padding: 18,
      marginBottom: 22,
      background: 'rgba(255,255,255,0.012)',
    }}>
      <div className="c-view__title" style={{ marginBottom: 6 }}>Gate Operations</div>
      <div className="c-sub" style={{ lineHeight: 1.7, marginBottom: 16 }}>
        Gate Operations joins passage decisions, policy authority, world gate ownership,
        binding state, traffic context, and diagnostics. Every passage decision should show proof.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <OverviewCard
          label="Active GatePolicy"
          value={summaryValue(selectedGate?.id ?? policy?.gateId)}
          detail={policy ? `Threshold ${policy.allyThreshold} / toll ${policy.baseTollMist} MIST` : 'No GatePolicy selected.'}
        />
        <OverviewCard
          label="Passage preview"
          value="Check Passage"
          detail="Uses the existing sponsored check_passage flow and indexed TRIBE_STANDING proof."
        />
        <OverviewCard
          label="Authority checklist"
          value="3 separate powers"
          detail="Policy authority is GateAdminCap. World gate ownership is OwnerCap<Gate>. Extension authorization is FrontierWardenAuth."
        />
        <section style={{ border: '1px solid var(--c-border)', padding: 14 }}>
          <div className="c-stat__label" style={{ marginBottom: 8 }}>Binding state</div>
          <div style={{ marginBottom: 8 }}>
            <GateBindingStatusBadge binding={selectedGate?.binding} />
          </div>
          <div className="c-sub" style={{ lineHeight: 1.6 }}>
            {binding.status}: {binding.next}
          </div>
        </section>
      </div>
    </section>
  );
}
