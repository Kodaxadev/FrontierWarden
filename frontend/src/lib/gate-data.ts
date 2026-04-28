// gate-data.ts -- Shared gate network graph constants.
//
// Single source of truth for node positions, edge adjacency, and synthetic
// threat assignments. Imported by GateMap (canvas rendering) and route-graph
// (pathfinding) so both always operate on identical topology.
//
// Production: NODES/EDGES will be hydrated from the live indexer gate-graph
// endpoint. NODE_THREATS will derive from live on-chain intel attestations.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Threat = 'hostile' | 'camped' | 'clear' | 'unknown';

export interface GateNode {
  id:    string;
  label: string;
  x:     number;   // 0..1 normalised canvas position
  y:     number;
}

export interface GateEdge {
  a: number;  // index into NODES
  b: number;
}

// ---------------------------------------------------------------------------
// Graph data -- synthetic devnet topology
// ---------------------------------------------------------------------------

export const NODES: readonly GateNode[] = [
  { id: '0x1111', label: 'ALPHA-1', x: 0.14, y: 0.22 },
  { id: '0x2222', label: 'BETA-1',  x: 0.34, y: 0.13 },
  { id: '0x3333', label: 'GAMMA-1', x: 0.56, y: 0.18 },
  { id: '0x4444', label: 'DELTA-1', x: 0.74, y: 0.32 },
  { id: '0x5555', label: 'ALPHA-2', x: 0.19, y: 0.52 },
  { id: '0x6666', label: 'BETA-2',  x: 0.42, y: 0.46 },
  { id: '0x7777', label: 'GAMMA-2', x: 0.63, y: 0.57 },
  { id: '0x8888', label: 'DELTA-2', x: 0.81, y: 0.62 },
  { id: '0x9999', label: 'NEXUS',   x: 0.42, y: 0.76 },
];

// Each entry is [indexA, indexB] into NODES
export const EDGES: readonly GateEdge[] = [
  { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 },
  { a: 0, b: 4 }, { a: 1, b: 5 }, { a: 2, b: 5 },
  { a: 3, b: 6 }, { a: 4, b: 5 }, { a: 5, b: 6 },
  { a: 6, b: 7 }, { a: 4, b: 8 }, { a: 5, b: 8 },
  { a: 6, b: 8 },
];

// Synthetic devnet threat assignments.
// Production: replace with live intel from on-chain attestations.
export const NODE_THREATS: Readonly<Record<string, Threat>> = {
  '0x1111': 'hostile',
  '0x2222': 'camped',
  '0x3333': 'clear',
  '0x4444': 'hostile',
  '0x5555': 'unknown',
  '0x6666': 'camped',
  '0x7777': 'clear',
  '0x8888': 'unknown',
  '0x9999': 'camped',
};

// Threat priority used for edge colour resolution (highest-threat node wins)
export const THREAT_PRIORITY: Readonly<Record<Threat, number>> = {
  hostile: 3, camped: 2, clear: 1, unknown: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nodeById(id: string): GateNode | undefined {
  return NODES.find(n => n.id === id);
}

export function threatOf(id: string): Threat {
  return NODE_THREATS[id] ?? 'unknown';
}

/** Build an adjacency list keyed by node ID for O(1) neighbour lookup. */
export function buildAdjacency(): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of NODES) adj.set(n.id, []);
  for (const e of EDGES) {
    adj.get(NODES[e.a].id)!.push(NODES[e.b].id);
    adj.get(NODES[e.b].id)!.push(NODES[e.a].id);
  }
  return adj;
}
