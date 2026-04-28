// useRoutePlanner.ts -- Route planner state management.
//
// Holds ship selection, cargo fraction, origin/destination nodes, and the
// computed route result. Recomputes synchronously on any input change --
// A* on a 9-node graph is <1ms so no async needed.
//
// Single responsibility: route state only. No canvas, no Move calls.

import { useState, useCallback, useMemo } from 'react';
import { findRoute }                       from '../lib/route-graph';
import { NODES }                           from '../lib/gate-data';
import { SHIPS }                           from '../lib/ship-specs';
import type { RouteResult }                from '../lib/route-graph';
import type { ShipClass }                  from '../lib/ship-specs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutePlannerState {
  ship:         ShipClass;
  cargoFrac:    number;    // 0..1
  fromId:       string;
  toId:         string;
  avoidHostile: boolean;
  result:       RouteResult | null;
  /** True when origin === destination or either ID is invalid. */
  invalid:      boolean;
}

export interface UseRoutePlannerReturn extends RoutePlannerState {
  setShip:         (s: ShipClass) => void;
  setCargoFrac:    (f: number) => void;
  setFrom:         (id: string) => void;
  setTo:           (id: string) => void;
  toggleAvoid:     () => void;
  swapEndpoints:   () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_FROM = NODES[0].id;
const DEFAULT_TO   = NODES[NODES.length - 1].id;

export function useRoutePlanner(): UseRoutePlannerReturn {
  const [ship,         setShip]         = useState<ShipClass>('Reflex');
  const [cargoFrac,    setCargoFrac]    = useState<number>(0.5);
  const [fromId,       setFrom]         = useState<string>(DEFAULT_FROM);
  const [toId,         setTo]           = useState<string>(DEFAULT_TO);
  const [avoidHostile, setAvoidHostile] = useState<boolean>(false);

  const toggleAvoid  = useCallback(() => setAvoidHostile(v => !v), []);
  const swapEndpoints = useCallback(() => {
    setFrom(prev => { setTo(prev); return prev; });
    setTo(fromId);
    setFrom(toId);
  }, [fromId, toId]);

  const result = useMemo<RouteResult | null>(() => {
    if (!fromId || !toId || fromId === toId) return null;
    return findRoute(fromId, toId, { avoidHostile });
  }, [fromId, toId, avoidHostile]);

  const invalid = !fromId || !toId || fromId === toId;

  return {
    ship, cargoFrac, fromId, toId, avoidHostile, result, invalid,
    setShip,
    setCargoFrac,
    setFrom,
    setTo,
    toggleAvoid,
    swapEndpoints,
  };
}
