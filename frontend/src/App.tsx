// App — FrontierWarden Intelligence Dashboard.
// CradleOS (hackathon build) is excluded from this build.

import { FrontierWardenDashboard } from './components/features/frontierwarden/FrontierWardenDashboard';

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <FrontierWardenDashboard />
    </div>
  );
}
