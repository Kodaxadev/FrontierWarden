import type { EveIdentity } from '../../../../types/api.types';
import { shortId } from './trust-console-format';

interface TrustIdentityStripProps {
  eveIdentity: EveIdentity | null;
  loading?: boolean;
  variant?: 'strip' | 'detail';
}

export function TrustIdentityStrip({
  eveIdentity,
  loading = false,
  variant = 'strip',
}: TrustIdentityStripProps) {
  if (variant === 'detail') {
    if (eveIdentity?.identity_status !== 'resolved') return null;
    return (
      <div style={{ marginBottom: 24, padding: '14px 18px', border: '1px solid rgba(0,210,255,0.25)', background: 'rgba(0,210,255,0.06)', borderRadius: 4 }}>
        <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-hi)' }}>EVE Character Identity</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontFamily: 'monospace', fontSize: 12 }}>
          {eveIdentity.character_name && (
            <div><span className="c-policy__label">Character:</span> <strong style={{ color: 'var(--c-hi)' }}>{eveIdentity.character_name}</strong></div>
          )}
          {eveIdentity.tenant && (
            <div><span className="c-policy__label">Tenant:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tenant}</span></div>
          )}
          {eveIdentity.tribe_id && (
            <div><span className="c-policy__label">Tribe:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id}</span></div>
          )}
          {eveIdentity.character_id && (
            <div><span className="c-policy__label">Char ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.character_id)}</span></div>
          )}
          {eveIdentity.item_id && (
            <div><span className="c-policy__label">Item ID:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.item_id}</span></div>
          )}
        </div>
      </div>
    );
  }

  if (!loading && eveIdentity?.identity_status !== 'resolved') return null;

  return (
    <div style={{ marginBottom: 24, padding: '14px 18px', border: '1px solid rgba(0,210,255,0.3)', background: 'rgba(0,210,255,0.08)', borderRadius: 4, fontSize: 12 }}>
      <div className="c-stat__label" style={{ marginBottom: 8, color: 'var(--c-hi)' }}>EVE Identity</div>
      {loading && <div className="c-sub">Resolvingâ€¦</div>}
      {!loading && eveIdentity && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'monospace' }}>
          {eveIdentity.character_name && <span><span className="c-policy__label">Character:</span> <strong style={{ color: 'var(--c-hi)' }}>{eveIdentity.character_name}</strong></span>}
          {eveIdentity.tenant && <span><span className="c-policy__label">Tenant:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tenant}</span></span>}
          {eveIdentity.tribe_id && <span><span className="c-policy__label">Tribe:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id}</span></span>}
          {eveIdentity.character_id && <span><span className="c-policy__label">Char ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.character_id)}</span></span>}
        </div>
      )}
    </div>
  );
}
