// ingame-object-types — maps EVE Frontier assembly types to FrontierWarden
// in-game object screens.

import { Assemblies } from '@evefrontier/dapp-kit';

/** FrontierWarden in-game object screen identifiers. */
export type InGameScreen =
  | 'gate'
  | 'storage'
  | 'turret'
  | 'node'
  | 'manufacturing'
  | 'refinery'
  | 'unknown';

/** Map dapp-kit Assemblies enum to FrontierWarden screen type. */
export function assemblyToScreen(type: Assemblies | null | undefined): InGameScreen {
  switch (type) {
    case Assemblies.SmartGate:        return 'gate';
    case Assemblies.SmartStorageUnit: return 'storage';
    case Assemblies.SmartTurret:      return 'turret';
    case Assemblies.NetworkNode:      return 'node';
    case Assemblies.Manufacturing:    return 'manufacturing';
    case Assemblies.Refinery:         return 'refinery';
    case Assemblies.Assembly:         return 'unknown';
    default:                          return 'unknown';
  }
}

/** Human-readable label for each screen type. */
export const SCREEN_LABELS: Record<InGameScreen, string> = {
  gate:          'GATE OPERATIONS',
  storage:       'STORAGE TRUST',
  turret:        'DEFENSE ASSESSMENT',
  node:          'NODE SENTINEL',
  manufacturing: 'MANUFACTURING',
  refinery:      'REFINERY',
  unknown:       'OBJECT COMMAND',
};

/** Parse query params for in-game mode detection.
 *  Returns null when the page is NOT in in-game mode. */
export function parseInGameParams(): {
  itemId: string | null;
  objectId: string | null;
  tenant: string | null;
} | null {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('itemId')?.trim() || null;
  const objectId = params.get('objectId')?.trim() || null;

  // In-game mode requires at least one object identifier
  if (!itemId && !objectId) return null;

  return {
    itemId,
    objectId,
    tenant: params.get('tenant')?.trim() || null,
  };
}
