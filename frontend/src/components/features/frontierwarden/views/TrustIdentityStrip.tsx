import type { EveIdentity } from '../../../../types/api.types';
import { shortId } from './trust-console-format';

export function TrustIdentityStrip({
  eveIdentity,
  loading = false,
}: {
  eveIdentity: EveIdentity | null;
  loading?: boolean;
}) {
  if (!loading && eveIdentity?.identity_status !== 'resolved') return null;

  return (
    <div style={{ marginBottom: 24, padding: '14px 18px', border: '1px solid rgba(0,210,255,0.3)', background: 'rgba(0,210,255,0.08)', borderRadius: 4, fontSize: 12 }}>
      <div className="c-stat__label" style={{ marginBottom: 8, color: 'var(--c-hi)' }}>EVE Identity</div>
      {loading && <div className="c-sub">Resolving...</div>}
      {!loading && eveIdentity && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'monospace' }}>
          {eveIdentity.character_name && <span><span className="c-policy__label">Character:</span> <strong style={{ color: 'var(--c-hi)' }}>{eveIdentity.character_name}</strong></span>}
          {eveIdentity.tenant && <span><span className="c-policy__label">Tenant:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tenant}</span></span>}
          {eveIdentity.tribe_id && <span><span className="c-policy__label">Tribe:</span> <span style={{ color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id}</span></span>}
          {eveIdentity.character_id && <span><span className="c-policy__label">Char ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.character_id)}</span></span>}
          {eveIdentity.item_id && <span><span className="c-policy__label">Item ID:</span> <span style={{ color: 'var(--c-hi)' }}>{shortId(eveIdentity.item_id)}</span></span>}
        </div>
      )}
    </div>
  );
}
