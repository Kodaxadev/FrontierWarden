// InGameObjectShell — provider wrapper for the in-game object command surface.
//
// Wraps SmartObjectProvider around InGameObjectCommandSurface so that
// useSmartObject() has assembly context from the ?itemId= query param.
//
// SmartObjectProvider reads ?itemId= and ?tenant= from the URL automatically.
// No additional param forwarding is needed here.

import { SmartObjectProvider } from '@evefrontier/dapp-kit';
import { InGameObjectCommandSurface } from './InGameObjectCommandSurface';

export function InGameObjectShell() {
  return (
    <SmartObjectProvider>
      <InGameObjectCommandSurface />
    </SmartObjectProvider>
  );
}
