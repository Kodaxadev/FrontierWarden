// FwNav v3 — horizontal tab bar
import type { FwTab } from './FrontierWardenDashboard';
import type { FwAlert } from './fw-data';

const TABS: { id: FwTab; label: string }[] = [
  { id: 'gates',      label: 'GATE INTEL'  },
  { id: 'killboard',  label: 'KILLBOARD'   },
  { id: 'reputation', label: 'REPUTATION'  },
  { id: 'contracts',  label: 'CONTRACTS'   },
  { id: 'policy',     label: 'POLICY'      },
  { id: 'oracle',     label: 'ORACLE'      },
  { id: 'social',     label: 'SOCIAL'      },
  { id: 'disputes',   label: 'DISPUTES'    },
];

interface FwNavProps {
  active: FwTab;
  onChange: (tab: FwTab) => void;
  alerts: FwAlert[];
}

export function FwNav({ active, onChange, alerts }: FwNavProps) {
  const warnCount = alerts.filter(a => a.lvl === 'WARN').length;

  return (
    <nav className="c-nav" aria-label="Main navigation">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`c-tab${active === t.id ? ' c-tab--active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.id === 'gates' && warnCount > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 8,
              color: 'var(--c-crimson)',
              verticalAlign: 'super',
            }}>
              {warnCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
