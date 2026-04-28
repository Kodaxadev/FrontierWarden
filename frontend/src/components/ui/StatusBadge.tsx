// StatusBadge -- compact schema/threat status indicator.
// SCHEMA_COLORS covers all 11 schema types in the protocol.
// Unmapped schemas fall to the default grey.

import type { ThreatLevel } from '../../types/api.types';

// ── Gate threat badge ─────────────────────────────────────────────────────────

interface ThreatBadgeProps {
  level:    ThreatLevel;
  compact?: boolean;
}

const THREAT_CONFIG: Record<ThreatLevel, { label: string; classes: string; dot: string }> = {
  hostile: {
    label:   'HOSTILE',
    classes: 'text-frontier-crimson border-frontier-crimson/40 bg-frontier-crimson/10',
    dot:     'bg-frontier-crimson',
  },
  camped: {
    label:   'CAMPED',
    classes: 'text-frontier-amber border-frontier-amber/40 bg-frontier-amber/10',
    dot:     'bg-frontier-amber',
  },
  clear: {
    label:   'CLEAR',
    classes: 'text-status-clear border-status-clear/40 bg-status-clear/10',
    dot:     'bg-status-clear',
  },
  unknown: {
    label:   'NO INTEL',
    classes: 'text-alloy-silver/50 border-void-500/50 bg-void-700/30',
    dot:     'bg-void-500',
  },
};

export function ThreatBadge({ level, compact = false }: ThreatBadgeProps) {
  const cfg = THREAT_CONFIG[level];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 border rounded px-1.5 font-mono font-medium tracking-wider',
        compact ? 'text-[9px] py-0.5' : 'text-[10px] py-1',
        cfg.classes,
      ].join(' ')}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Schema label badge ────────────────────────────────────────────────────────

interface SchemaBadgeProps {
  schemaId: string;
}

// All 11 protocol schema types mapped.
// Threat-correlated: hostile/heat = crimson, camped/toll = amber, clear/route = green.
const SCHEMA_COLORS: Record<string, string> = {
  // Leaderboard schemas
  CREDIT:           'text-sui-cyan border-sui-cyan/30 bg-sui-cyan/10',
  SHIP_KILL:        'text-frontier-crimson border-frontier-crimson/30 bg-frontier-crimson/10',
  PLAYER_BOUNTY:    'text-frontier-amber border-frontier-amber/30 bg-frontier-amber/10',
  TRIBE_STANDING:   'text-standing-ally border-standing-ally/30 bg-standing-ally/10',
  // Gate intel schemas
  GATE_HOSTILE:     'text-frontier-crimson border-frontier-crimson/35 bg-frontier-crimson/10',
  GATE_CAMPED:      'text-frontier-amber border-frontier-amber/35 bg-frontier-amber/10',
  GATE_CLEAR:       'text-status-clear border-status-clear/35 bg-status-clear/10',
  GATE_TOLL:        'text-frontier-gold border-frontier-gold/35 bg-frontier-gold/10',
  HEAT_TRAP:        'text-frontier-amber border-frontier-amber/40 bg-frontier-amber/12',
  ROUTE_VERIFIED:   'text-standing-ally border-standing-ally/35 bg-standing-ally/10',
  SYSTEM_CONTESTED: 'text-alloy-silver border-alloy-silver/30 bg-void-700/40',
};

const DEFAULT_SCHEMA_COLOR = 'text-alloy-silver/60 border-void-500/40 bg-void-700/30';

export function SchemaBadge({ schemaId }: SchemaBadgeProps) {
  const color = SCHEMA_COLORS[schemaId] ?? DEFAULT_SCHEMA_COLOR;
  return (
    <span
      className={[
        'inline-flex items-center border rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider font-medium',
        color,
      ].join(' ')}
    >
      {schemaId}
    </span>
  );
}
