// App — FrontierWarden Intelligence Dashboard.
// CradleOS (hackathon build) is excluded from this build.
//
// Surface detection:
//   ?itemId= → in-game object command surface (SmartObjectProvider derives Sui objectId)
//   otherwise → external web command center

import { FrontierWardenDashboard } from './components/features/frontierwarden/FrontierWardenDashboard';
import { OperatorSessionGate } from './components/features/frontierwarden/OperatorSessionGate';
import { parseInGameParams } from './components/features/frontierwarden/ingame/ingame-object-types';
import { InGameObjectShell } from './components/features/frontierwarden/ingame/InGameObjectShell';

const inGameParams = parseInGameParams();

export default function App() {
  // In-game mode: compact object command surface
  if (inGameParams) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <InGameObjectShell />
      </div>
    );
  }

  // External web mode: full command center
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <OperatorSessionGate>
        <FrontierWardenDashboard />
      </OperatorSessionGate>
    </div>
  );
}
