// App — FrontierWarden Intelligence Dashboard.
// CradleOS (hackathon build) is excluded from this build.

import { FrontierWardenDashboard } from './components/features/frontierwarden/FrontierWardenDashboard';
import { OperatorSessionGate } from './components/features/frontierwarden/OperatorSessionGate';

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <OperatorSessionGate>
        <FrontierWardenDashboard />
      </OperatorSessionGate>
    </div>
  );
}
