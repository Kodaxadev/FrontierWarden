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
 *  Returns null when the page is NOT in in-game mode.
 *
 *  SmartObjectProvider only reads ?itemId= (numeric) to derive a Sui
 *  object ID via BCS + AssemblyRegistry.  It does NOT read ?objectId=.
 *  EVE Frontier's smart assembly frame supplies ?itemId=<numeric>, so
 *  this is the only query param we check. */
export function parseInGameParams(): {
  itemId: string;
  tenant: string | null;
} | null {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('itemId')?.trim() || null;

  // In-game mode requires an itemId (numeric assembly identifier)
  if (!itemId) return null;

  return {
    itemId,
    tenant: params.get('tenant')?.trim() || null,
  };
}
