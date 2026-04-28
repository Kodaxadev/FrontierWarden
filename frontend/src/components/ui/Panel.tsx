// Panel -- CradleOS base panel container.
// Header bottom border uses the accent / live color for per-panel visual identity.
// Icon slot inherits the accent color so it reads as part of the panel's signature.

import type { ReactNode } from 'react';

interface PanelProps {
  title?:       string;
  subtitle?:    string;
  icon?:        ReactNode;
  live?:        boolean;
  className?:   string;
  children:     ReactNode;
  headerRight?: ReactNode;
  accent?:      'cyan' | 'amber' | 'crimson';
}

export function Panel({
  title,
  subtitle,
  icon,
  live = false,
  className = '',
  children,
  headerRight,
  accent,
}: PanelProps) {
  const showAccent = live || !!accent;

  // Top accent line color
  const accentLine =
    accent === 'amber'   ? 'bg-frontier-amber/55' :
    accent === 'crimson' ? 'bg-frontier-crimson/55' :
    'bg-sui-cyan/45';

  // Header bottom border -- colored when live or accented, subtle otherwise
  const headerBorder =
    accent === 'amber'   ? 'border-frontier-amber/25' :
    accent === 'crimson' ? 'border-frontier-crimson/25' :
    live                 ? 'border-sui-cyan/20' :
                           'border-void-500';

  // Icon tint matches panel accent
  const iconColor =
    accent === 'amber'   ? 'text-frontier-amber/55' :
    accent === 'crimson' ? 'text-frontier-crimson/55' :
    live                 ? 'text-sui-cyan/55' :
                           'text-alloy-silver/35';

  return (
    <section
      className={[
        'flex flex-col bg-void-800 border border-void-500 rounded-panel overflow-hidden relative',
        showAccent ? 'panel-live-edge' : '',
        className,
      ].join(' ')}
    >
      {/* Top accent edge -- 1px colored rule */}
      {showAccent && (
        <div
          className={`absolute top-0 left-0 right-0 h-px z-10 ${accentLine}`}
          aria-hidden="true"
        />
      )}

      {title && (
        <header
          className={[
            'flex items-center justify-between px-4 py-2.5 border-b shrink-0',
            headerBorder,
          ].join(' ')}
        >
          <div className="flex items-center gap-2.5">
            {/* Live beacon */}
            {live && (
              <span className="relative flex shrink-0 w-2 h-2" aria-label="live feed">
                <span className="absolute inset-0 rounded-full bg-status-clear animate-ping opacity-40" />
                <span className="relative w-2 h-2 rounded-full bg-status-clear" />
              </span>
            )}

            {/* Icon slot -- accent-tinted */}
            {icon && (
              <span className={`shrink-0 -ml-0.5 ${iconColor}`}>
                {icon}
              </span>
            )}

            <div>
              <h2 className="font-display text-[13px] font-semibold text-alloy-silver tracking-[0.14em] uppercase">
                {title}
              </h2>
              {subtitle && (
                <p className="font-mono text-[9px] text-void-500/55 mt-0.5 tracking-wider">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {headerRight && (
            <div className="shrink-0">{headerRight}</div>
          )}
        </header>
      )}

      <div className="flex-1 overflow-auto min-h-0">{children}</div>
    </section>
  );
}
