// route-graph.ts -- Threat-weighted A* pathfinder for the gate network.
//
// Uses the shared gate-data topology. Edge weights penalise hostile and camped
// nodes so the planner prefers safe routes when they exist. avoidHostile=true
// makes hostile nodes impassable (cost = Infinity).
//
// Single responsibility: pathfinding only. No UI, no ship physics here.

import {
  NODES,
  EDGES,
  buildAdjacency,
  threatOf,
} from './gate-data';
import type { Threat } from './gate-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteWarning = 'hostile_on_path' | 'camped_on_path' | 'heat_trap_warning';

export interface RouteResult {
  /** Ordered node IDs from origin to destination. */
  path:      string[];
  jumpCount: number;
  /** Sum of edge weights (reflects threat penalties). */
  totalCost: number;
  warnings:  RouteWarning[];
}

export interface RouteOptions {
  /** If true, hostile nodes are treated as impassable. Default false. */
  avoidHostile?: boolean;
}

// ---------------------------------------------------------------------------
// Edge weight
// ---------------------------------------------------------------------------

const THREAT_PENALTY: Record<Threat, number> = {
  hostile: 50,
  camped:  8,
  unknown: 2,
  clear:   0,
};

function edgeCost(
  aId:          string,
  bId:          string,
  avoidHostile: boolean,
): number {
  const ta = threatOf(aId);
  const tb = threatOf(bId);
  if (avoidHostile && (ta === 'hostile' || tb === 'hostile')) return Infinity;
  return 1 + THREAT_PENALTY[ta] + THREAT_PENALTY[tb];
}

// ---------------------------------------------------------------------------
// A* implementation
// ---------------------------------------------------------------------------

/** Euclidean heuristic on normalised x/y canvas positions. */
function heuristic(aId: string, bId: string): number {
  const a = NODES.find(n => n.id === aId);
  const b = NODES.find(n => n.id === bId);
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find the lowest-cost route from `fromId` to `toId`.
 * Returns null if no route exists (graph disconnected or hostile blocked).
 */
export function findRoute(
  fromId:  string,
  toId:    string,
  options: RouteOptions = {},
): RouteResult | null {
  const avoidHostile = options.avoidHostile ?? false;
  const adj          = buildAdjacency();

  // Validate node IDs
  if (!adj.has(fromId) || !adj.has(toId)) return null;
  if (fromId === toId) {
    return { path: [fromId], jumpCount: 0, totalCost: 0, warnings: [] };
  }

  const gScore  = new Map<string, number>();
  const fScore  = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const open    = new Set<string>();
  const closed  = new Set<string>();

  for (const n of NODES) {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
  }
  gScore.set(fromId, 0);
  fScore.set(fromId, heuristic(fromId, toId));
  open.add(fromId);

  while (open.size > 0) {
    // Pick node with lowest fScore
    let current = '';
    let best    = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < best) { best = f; current = id; }
    }

    if (current === toId) {
      // Reconstruct path
      const path: string[] = [];
      let c = current;
      while (cameFrom.has(c)) {
        path.unshift(c);
        c = cameFrom.get(c)!;
      }
      path.unshift(fromId);

      const warnings: RouteWarning[] = [];
      if (path.some(id => threatOf(id) === 'hostile')) warnings.push('hostile_on_path');
      if (path.some(id => threatOf(id) === 'camped'))  warnings.push('camped_on_path');

      return {
        path,
        jumpCount: path.length - 1,
        totalCost: gScore.get(toId) ?? 0,
        warnings,
      };
    }

    open.delete(current);
    closed.add(current);

    for (const neighbourId of (adj.get(current) ?? [])) {
      if (closed.has(neighbourId)) continue;
      const cost = edgeCost(current, neighbourId, avoidHostile);
      if (cost === Infinity) continue;

      const tentative = (gScore.get(current) ?? Infinity) + cost;
      if (tentative < (gScore.get(neighbourId) ?? Infinity)) {
        cameFrom.set(neighbourId, current);
        gScore.set(neighbourId, tentative);
        fScore.set(neighbourId, tentative + heuristic(neighbourId, toId));
        open.add(neighbourId);
      }
    }
  }

  return null; // No path found
}
