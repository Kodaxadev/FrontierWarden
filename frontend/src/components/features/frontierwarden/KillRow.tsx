import type { KillMailItem } from '../../../types/api.types';
import type { CombatSignal } from './combat-signals';

// ── Signal chip ───────────────────────────────────────────────────────────────

export function SignalChip({ signal }: { signal: CombatSignal }) {
  const color = signal.type === 'advisory'
    ? 'var(--c-amber)'
    : signal.type === 'info'
      ? 'var(--c-hi)'
      : 'var(--c-mid)';
  return (
    <div style={{
      padding: '10px 14px',
      border: `1px solid ${signal.type === 'advisory' ? 'rgba(245,158,11,0.3)' : 'var(--c-border)'}`,
      background: signal.type === 'advisory' ? 'rgba(245,158,11,0.04)' : 'transparent',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-lo)', marginBottom: 4 }}>
        {signal.label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: '-0.01em' }}>
        {signal.value}
      </div>
      {signal.note && (
        <div style={{ fontSize: 10, color: 'var(--c-lo)', marginTop: 4, lineHeight: 1.5 }}>
          {signal.note}
        </div>
      )}
    </div>
  );
}

// ── Mini kill row ─────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10) + ' ' + (iso.slice(11, 19) || '');
}

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function KillRow({ row, perspective }: { row: KillMailItem; perspective: 'killer' | 'victim' }) {
  const isKiller       = perspective === 'killer';
  const subjectDisplay = isKiller
    ? (row.killerName ?? shortAddr(row.killerAddress))
    : (row.victimName ?? shortAddr(row.victimAddress));
  const counterDisplay = isKiller
    ? (row.victimName ?? shortAddr(row.victimAddress))
    : (row.killerName ?? shortAddr(row.killerAddress));
  const counterTribe   = isKiller ? row.victimTribe : row.killerTribe;

  return (
    <tr>
      <td style={{ minWidth: 90 }}>
        <div style={{ fontSize: 11, color: 'var(--c-mid)' }}>{fmtTimestamp(row.killTimestamp)}</div>
      </td>
      <td>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-hi)' }}>{subjectDisplay}</div>
      </td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--c-mid)', padding: '1px 4px', border: '1px solid var(--c-border)' }}>
          {isKiller ? '→' : '←'}
        </span>
      </td>
      <td>
        <div style={{ fontSize: 12, color: isKiller ? 'var(--c-frontier-crimson, #ef4444)' : 'var(--c-hi)' }}>
          {counterDisplay}
        </div>
        {counterTribe && (
          <div style={{ fontSize: 10, color: 'var(--c-mid)' }}>{counterTribe}</div>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, color: 'var(--c-mid)' }}>{row.solarSystemName ?? '—'}</span>
      </td>
      <td>
        <span style={{ fontSize: 10, color: 'var(--c-mid)' }}>{row.lossType ?? '—'}</span>
      </td>
    </tr>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '16px 0', fontSize: 11, color: 'var(--c-mid)' }}>
      {label} No kill mails indexed yet — the native kill mail poller may be disabled.
      SHIP_KILL attestations may still exist separately under Attestation Proofs.
    </div>
  );
}
