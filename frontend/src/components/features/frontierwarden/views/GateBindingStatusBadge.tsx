import type { GateBindingStatusResponse } from '../../../../types/api.types';

interface Props {
  binding?: GateBindingStatusResponse;
  compact?: boolean;
}

const STATUS_COPY = {
  unbound: {
    label: 'UNBOUND',
    tone: 'dim',
    detail: 'No active policy-to-world-gate binding',
  },
  bound: {
    label: 'BOUND',
    tone: 'amber',
    detail: 'Policy binding indexed; extension proof not active',
  },
  verified: {
    label: 'BINDING VERIFIED',
    tone: 'green',
    detail: 'Binding plus active FrontierWarden extension evidence',
  },
} as const;

export function GateBindingStatusBadge({ binding, compact = false }: Props) {
  const status = binding?.bindingStatus ?? 'unbound';
  const copy = STATUS_COPY[status];
  const className = `c-binding-badge c-binding-badge--${copy.tone}`;
  const detail = binding
    ? binding.fwExtensionActive
      ? 'WORLD EXTENSION ACTIVE'
      : copy.detail
    : copy.detail;

  return (
    <span className={className} title={detail}>
      <span className="c-binding-badge__label">{copy.label}</span>
      {!compact && (
        <span className="c-binding-badge__detail">
          {binding?.worldGateId ? shortId(binding.worldGateId) : detail}
        </span>
      )}
    </span>
  );
}

function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
