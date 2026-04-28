// Display formatting utilities.
// One responsibility: transform raw API values into human-readable strings.

// ── Addresses ─────────────────────────────────────────────────────────────────

/** Truncate a 0x address to "0xABCD...1234" (4 chars each side). */
export function truncAddr(addr: string, chars = 4): string {
  if (!addr || addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Extract just the last N hex chars — useful for tight table cells. */
export function shortAddr(addr: string, chars = 6): string {
  return addr.slice(-chars).toUpperCase();
}

// ── Numbers ───────────────────────────────────────────────────────────────────

/** Format score value — raw integers from score_cache. */
export function fmtScore(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** Format SUI mist → SUI with 3 decimal places. */
export function fmtSui(mist: number): string {
  return `${(mist / 1_000_000_000).toFixed(3)} SUI`;
}

/** Zero-pad checkpoint number for monospace display. */
export function fmtCheckpoint(cp: number): string {
  return cp.toString().padStart(8, '0');
}

// ── Timestamps ────────────────────────────────────────────────────────────────

/** Relative time label: "3m ago", "2h ago", "just now". */
export function timeAgo(isoOrMs: string | number): string {
  const ts   = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  const diff = Date.now() - ts;
  if (diff < 60_000)      return 'just now';
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Short time: "14:32" HH:MM UTC. */
export function fmtTime(isoOrMs: string | number): string {
  const d = new Date(
    typeof isoOrMs === 'number' ? isoOrMs : isoOrMs,
  );
  return d.toLocaleTimeString('en-US', {
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
    timeZone: 'UTC',
  });
}

// ── Schema IDs ────────────────────────────────────────────────────────────────

const SCHEMA_LABELS: Record<string, string> = {
  CREDIT:           'Credit',
  GATE_HOSTILE:     'Hostile',
  GATE_CAMPED:      'Camped',
  GATE_CLEAR:       'Clear',
  GATE_TOLL:        'Toll',
  HEAT_TRAP:        'Heat',
  ROUTE_VERIFIED:   'Verified',
  SYSTEM_CONTESTED: 'Contested',
  SHIP_KILL:        'Kill',
  PLAYER_BOUNTY:    'Bounty',
  TRIBE_STANDING:   'Standing',
};

export function labelSchema(schemaId: string): string {
  return SCHEMA_LABELS[schemaId] ?? schemaId;
}

// ── Uptime ────────────────────────────────────────────────────────────────────

export function fmtUptime(secs: number): string {
  if (secs < 60)        return `${secs}s`;
  if (secs < 3_600)     return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  return `${h}h ${m}m`;
}
