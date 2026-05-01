// EveWorldStatusStrip — compact status strip showing EVE world data counts.
// Displayed in GateIntel header area.

import { useEveWorldStatus } from '../../../hooks/useEveWorldStatus';

export function EveWorldStatusStrip() {
  const { systems_count, types_count, tribes_count, ships_count, source, loading, error } =
    useEveWorldStatus();

  if (loading) {
    return (
      <div
        className="fw-mono"
        style={{
          fontSize: 9,
          color: 'var(--t-muted)',
          letterSpacing: '0.1em',
          padding: '4px 12px',
          borderTop: '1px solid var(--b-05)',
        }}
      >
        SYNCING EVE WORLD DATA...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="fw-mono"
        style={{
          fontSize: 9,
          color: 'var(--tribe-crimson)',
          letterSpacing: '0.1em',
          padding: '4px 12px',
          borderTop: '1px solid var(--b-05)',
        }}
      >
        EVE SYNC ERROR
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: 9,
        color: 'var(--t-muted)',
        letterSpacing: '0.08em',
        padding: '4px 12px',
        borderTop: '1px solid var(--b-05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span className="fw-mono">
        SYS {systems_count.toLocaleString()} · TYPES {types_count} · TRIBES {tribes_count} · SHIPS {ships_count}
      </span>
      <span className="fw-mono" style={{ color: 'var(--frontier-amber)', fontSize: 8 }}>
        SOURCE: {source.toUpperCase()}
      </span>
    </div>
  );
}
