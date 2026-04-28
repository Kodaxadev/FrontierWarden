// ship-specs.ts -- EVE Frontier ship class data and jump range formulas.
//
// Source: ROUTING_SPEC.md sections 9.1 / 9.3 / 9.4
// Single responsibility: pure ship physics. No graph, no UI.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShipClass = 'Reflex' | 'Recurve' | 'Lai' | 'USV' | 'Maul';

export interface ShipSpec {
  readonly class:        ShipClass;
  readonly massKg:       number;
  readonly specificHeat: number;
  readonly fuelCapacity: number;
  readonly cargoM3:      number;
}

// ---------------------------------------------------------------------------
// Ship data -- ROUTING_SPEC.md table 9.3
// ---------------------------------------------------------------------------

export const SHIPS: Readonly<Record<ShipClass, ShipSpec>> = {
  Reflex:  { class: 'Reflex',  massKg: 9_750_000,    specificHeat: 3.0, fuelCapacity: 1_750,  cargoM3: 520    },
  Recurve: { class: 'Recurve', massKg: 10_200_000,   specificHeat: 1.0, fuelCapacity: 970,    cargoM3: 520    },
  Lai:     { class: 'Lai',     massKg: 18_929_160,   specificHeat: 2.5, fuelCapacity: 2_400,  cargoM3: 1_040  },
  USV:     { class: 'USV',     massKg: 30_266_600,   specificHeat: 1.8, fuelCapacity: 2_420,  cargoM3: 3_120  },
  Maul:    { class: 'Maul',    massKg: 548_435_920,  specificHeat: 2.5, fuelCapacity: 24_160, cargoM3: 20_800 },
};

export const SHIP_CLASSES: ShipClass[] = ['Reflex', 'Recurve', 'Lai', 'USV', 'Maul'];

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

/**
 * Jump range in light-seconds.
 *
 * From ROUTING_SPEC.md 9.1 (verified against source):
 *   range = (deltaT * C_eff * M_hull) / (3 * M_current)
 *
 * NOT M_hull^3 -- M_hull is in the numerator, 3 is a constant in the denominator.
 *
 * @param spec       Ship specification
 * @param cargoFrac  Cargo fill fraction 0..1
 * @param fuelFrac   Fuel fill fraction 0..1
 * @param systemTemp External system temperature (0..100 heat index)
 */
export function jumpRange(
  spec:       ShipSpec,
  cargoFrac:  number,
  fuelFrac:   number,
  systemTemp: number,
): number {
  const adaptiveLevel = 0; // future: from oracle profile
  const cEff     = spec.specificHeat * (1 + adaptiveLevel * 0.02);
  const deltaT   = Math.max(150 - systemTemp, 0);
  const cargoBal = cargoFrac * spec.cargoM3 * 1_000;  // rough mass estimate
  const fuelMass = fuelFrac  * spec.fuelCapacity * 800;
  const mCurrent = spec.massKg + cargoBal + fuelMass;
  return (deltaT * cEff * spec.massKg) / (3 * mCurrent);
}

/**
 * Fuel consumed for a raw space jump of distanceLs light-seconds.
 *
 * From ROUTING_SPEC.md 9.4:
 *   distance = (fuel * quality) / (1e-7 * mass)
 *   => fuel  = (distance * 1e-7 * mass) / quality
 */
export function fuelForJump(
  spec:        ShipSpec,
  distanceLs:  number,
  fuelQuality: number = 0.7,
): number {
  return (distanceLs * 1e-7 * spec.massKg) / fuelQuality;
}

/**
 * Heat index at distance D (light-seconds) from a star.
 *
 * From ROUTING_SPEC.md formula 9.2:
 *   H(D) = 100 * (2/pi) * arctan(K * 2pi * sqrt(L_star / L_sun) / D)
 *
 * @param distanceLs  Distance from star in light-seconds
 * @param starLum     Star luminosity in watts (default = 1 solar luminosity)
 *
 * PRODUCTION NOTE: per-star luminosity is not yet in the devnet gate graph.
 * The default 1 L_sun gives the standard-star baseline. Do not hard-code
 * this default once the gate-graph endpoint exposes stellar data.
 *
 * Returns 0..100. Values >= 90 = red zone (no raw jumps possible).
 */
export function heatIndex(distanceLs: number, starLum: number = 3.828e26): number {
  const L_SUN = 3.828e26;
  const K     = 100;
  return 100 * (2 / Math.PI) * Math.atan(K * 2 * Math.PI * Math.sqrt(starLum / L_SUN) / distanceLs);
}

/** Returns true if the heat zone blocks raw-space jumps (heat >= 90). */
export function isHeatTrap(heat: number): boolean {
  return heat >= 90;
}
