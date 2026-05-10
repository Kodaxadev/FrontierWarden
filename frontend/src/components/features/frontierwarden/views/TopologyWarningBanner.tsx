// TopologyWarningBanner — advisory topology context for gate operators.
//
// Derives warnings from GateBindingStatusResponse about the binding and world
// gate state that are relevant before a trust evaluation or passage attempt.
//
// ADVISORY ONLY — these signals are informational context, not enforcement
// decisions. The binding/extension state does not directly block passage;
// it indicates whether the gate operator's world-gate deployment is complete.
//
// Renders nothing when binding is absent or when no advisory signals are present.

import type { GateBindingStatusResponse } from '../../../../types/api.types';
import { InfoTooltip } from '../InfoTooltip';
import { HELP } from '../operator-help';

interface TopologyWarning {
  key:   string;
  text:  string;
  level: 'warn' | 'info';
}

function deriveWarnings(binding: GateBindingStatusResponse | null | undefined): TopologyWarning[] {
  if (!binding) return [];

  const warnings: TopologyWarning[] = [];

  if (binding.bindingStatus === 'unbound') {
    warnings.push({
      key:   'unbound',
      text:  'No world gate binding indexed for this policy. World gate topology context is not available.',
      level: 'info',
    });
    // No further checks are meaningful if unbound.
    return warnings;
  }

  if (!binding.fwExtensionActive) {
    warnings.push({
      key:   'extension-inactive',
      text:  'Binding indexed but FrontierWarden extension evidence is not active on the bound world gate.',
      level: 'warn',
    });
  }

  if (binding.worldGateId && binding.worldGateStatus === 'offline') {
    warnings.push({
      key:   'gate-offline',
      text:  'Bound world gate is indexed as offline. This is an advisory signal from the world event indexer.',
      level: 'warn',
    });
  }

  return warnings;
}

interface Props {
  binding: GateBindingStatusResponse | null | undefined;
}

export function TopologyWarningBanner({ binding }: Props) {
  const warnings = deriveWarnings(binding);
  if (warnings.length === 0) return null;

  const hasWarn = warnings.some(w => w.level === 'warn');

  return (
    <div style={{
      marginTop: 20,
      padding: '12px 16px',
      border: hasWarn
        ? '1px solid rgba(245,158,11,0.35)'
        : '1px solid rgba(100,120,140,0.25)',
      background: hasWarn
        ? 'rgba(245,158,11,0.04)'
        : 'rgba(0,0,0,0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: warnings.length > 1 ? 8 : 6 }}>
        <div
          className="c-stat__label"
          style={{ color: hasWarn ? 'var(--c-amber)' : 'var(--c-mid)' }}
        >
          TOPOLOGY ADVISORY
        </div>
        <InfoTooltip concept={HELP.topologyAdvisory} />
      </div>

      {warnings.map(w => (
        <div
          key={w.key}
          style={{
            fontSize: 10,
            fontFamily: 'var(--c-mono)',
            color: w.level === 'warn' ? 'var(--c-amber)' : 'var(--c-mid)',
            lineHeight: 1.8,
          }}
        >
          &gt; {w.text}
        </div>
      ))}

      <div style={{
        marginTop: 8,
        fontSize: 9,
        color: 'var(--c-lo)',
        letterSpacing: '0.04em',
      }}>
        Topology signals reflect indexed world event state. Not an enforcement decision.
      </div>
    </div>
  );
}
