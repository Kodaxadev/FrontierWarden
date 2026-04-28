// tribe-data.ts -- EVE Frontier syndicate territory and diplomatic data.
//
// Single responsibility: syndicate definitions, territorial claims, and
// disposition matrix. No rendering logic, no React.
//
// Production: SYNDICATE_NODES will be derived from on-chain TRIBE_STANDING
// attestations once the indexer exposes per-gate control history.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyndicateId = 'VANGUARD' | 'REMNANTS' | 'EXILES' | 'UNAFFILIATED';
export type Disposition  = 'ally' | 'neutral' | 'hostile';

export interface Syndicate {
  readonly id:        SyndicateId;
  readonly name:      string;
  readonly hexColor:  string;         // solid hex for text / borders
  readonly glowRgba:  string;         // rgba for canvas fills / glows
  readonly nodes:     readonly string[]; // gate node IDs this syndicate controls
}

// ---------------------------------------------------------------------------
// Syndicate definitions
// ---------------------------------------------------------------------------

export const SYNDICATES: Readonly<Record<SyndicateId, Syndicate>> = {
  VANGUARD: {
    id:       'VANGUARD',
    name:     'Vanguard Collective',
    hexColor: '#3B82F6',             // blue — disciplined expansionists
    glowRgba: 'rgba(59,130,246,',
    nodes:    ['0x1111', '0x2222', '0x5555'],  // ALPHA-1, BETA-1, ALPHA-2
  },
  REMNANTS: {
    id:       'REMNANTS',
    name:     'Iron Remnants',
    hexColor: '#F59E0B',             // amber — entrenched mercenaries
    glowRgba: 'rgba(245,158,11,',
    nodes:    ['0x4444', '0x8888'],  // DELTA-1, DELTA-2
  },
  EXILES: {
    id:       'EXILES',
    name:     'Null Exiles',
    hexColor: '#EF4444',             // crimson — outlaws, unpredictable
    glowRgba: 'rgba(239,68,68,',
    nodes:    ['0x7777', '0x9999'],  // GAMMA-2, NEXUS
  },
  UNAFFILIATED: {
    id:       'UNAFFILIATED',
    name:     'Contested Space',
    hexColor: '#374151',             // gray — no controlling entity
    glowRgba: 'rgba(55,65,81,',
    nodes:    ['0x3333', '0x6666'],  // GAMMA-1, BETA-2
  },
};

export const SYNDICATE_IDS: SyndicateId[] = ['VANGUARD', 'REMNANTS', 'EXILES', 'UNAFFILIATED'];

// ---------------------------------------------------------------------------
// Territorial lookup
// ---------------------------------------------------------------------------

/** Reverse map: nodeId → SyndicateId */
const NODE_SYNDICATE: Record<string, SyndicateId> = (() => {
  const m: Record<string, SyndicateId> = {};
  for (const s of Object.values(SYNDICATES)) {
    for (const n of s.nodes) m[n] = s.id;
  }
  return m;
})();

export function syndicateOf(nodeId: string): SyndicateId {
  return NODE_SYNDICATE[nodeId] ?? 'UNAFFILIATED';
}

// ---------------------------------------------------------------------------
// Diplomatic standings matrix
// Format: STANDINGS[fromId][toId] = how 'from' views 'to'
// Asymmetric standings are allowed (cold war situations).
// ---------------------------------------------------------------------------

type StandingsRow = Partial<Record<SyndicateId, Disposition>>;

export const STANDINGS: Readonly<Record<SyndicateId, StandingsRow>> = {
  VANGUARD: {
    REMNANTS:     'hostile',   // border conflict over BETA gate corridor
    EXILES:       'neutral',   // cold detente — neither can afford a second front
    UNAFFILIATED: 'neutral',
  },
  REMNANTS: {
    VANGUARD:     'hostile',
    EXILES:       'ally',      // defensive pact against Vanguard expansion
    UNAFFILIATED: 'neutral',
  },
  EXILES: {
    VANGUARD:     'neutral',
    REMNANTS:     'ally',
    UNAFFILIATED: 'neutral',
  },
  UNAFFILIATED: {
    VANGUARD:     'neutral',
    REMNANTS:     'neutral',
    EXILES:       'neutral',
  },
};

/**
 * Returns the higher-severity disposition between two syndicates.
 * If A views B as hostile and B views A as neutral, the edge is still hostile.
 */
export function dispositionBetween(a: SyndicateId, b: SyndicateId): Disposition {
  if (a === b) return 'ally';
  const ab = STANDINGS[a]?.[b] ?? 'neutral';
  const ba = STANDINGS[b]?.[a] ?? 'neutral';
  const rank: Record<Disposition, number> = { hostile: 2, neutral: 1, ally: 0 };
  return rank[ab] >= rank[ba] ? ab : ba;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  ally:    'ALLIED',
  neutral: 'NEUTRAL',
  hostile: 'HOSTILE',
};

export const DISPOSITION_COLOR: Record<Disposition, string> = {
  ally:    '#3B82F6',   // blue
  neutral: '#94A3B8',   // silver
  hostile: '#EF4444',   // crimson
};
