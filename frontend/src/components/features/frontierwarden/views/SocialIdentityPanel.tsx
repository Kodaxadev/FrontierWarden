import type { EveIdentity } from '../../../../types/api.types';
import { shortId } from './social-utils';

interface SocialIdentityPanelProps {
  accountAddress?: string;
  eveIdentity: EveIdentity | null;
  loading: boolean;
}

export function SocialIdentityPanel({ accountAddress, eveIdentity, loading }: SocialIdentityPanelProps) {
  if (!accountAddress) return null;

  return (
    <div style={{ maxWidth: 760, marginBottom: 24, padding: '12px 16px', border: '1px solid var(--c-border)', background: 'rgba(0,210,255,0.012)' }}>
      <div className="c-stat__label" style={{ marginBottom: 8 }}>EVE Identity</div>
      {loading && <div className="c-sub">Resolving EVE identity...</div>}
      {!loading && eveIdentity && (
        <>
          {eveIdentity.identity_status === 'resolved' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, fontSize: 11 }}>
              {eveIdentity.character_name && (
                <div><div className="c-policy__label">EVE Character</div><div style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{eveIdentity.character_name}</div></div>
              )}
              <div><div className="c-policy__label">Character ID</div><div style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{eveIdentity.character_id ? shortId(eveIdentity.character_id) : '-'}</div></div>
              <div><div className="c-policy__label">Tribe</div><div style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{eveIdentity.tribe_name ? `${eveIdentity.tribe_name} (${eveIdentity.tribe_id})` : eveIdentity.tribe_id ?? '-'}</div></div>
              {eveIdentity.tenant && (
                <div><div className="c-policy__label">Tenant</div><div style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{eveIdentity.tenant}</div></div>
              )}
              <div><div className="c-policy__label">PlayerProfile</div><div style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{shortId(eveIdentity.player_profile_object ?? '-')}</div></div>
              {eveIdentity.frontierwarden_profile_id && (
                <div><div className="c-policy__label">FrontierWarden Profile</div><div style={{ fontFamily: 'monospace', color: 'var(--c-green)' }}>{shortId(eveIdentity.frontierwarden_profile_id)}</div></div>
              )}
            </div>
          )}
          {eveIdentity.identity_status === 'not_found' && (
            <div className="c-sub" style={{ color: 'var(--c-amber)' }}>EVE identity not resolved yet - no PlayerProfile found for this wallet.</div>
          )}
          {eveIdentity.identity_status === 'package_unknown' && (
            <div className="c-sub" style={{ color: 'var(--c-mid)' }}>EVE identity lookup not configured for this environment.</div>
          )}
          {eveIdentity.identity_status === 'graphql_error' && (
            <div className="c-sub" style={{ color: 'var(--c-crimson)' }}>EVE identity lookup failed; showing wallet profile only.</div>
          )}
          {eveIdentity.identity_status === 'unresolved' && eveIdentity.frontierwarden_profile_id && (
            <div style={{ fontSize: 11 }}>
              <div className="c-policy__label">FrontierWarden Profile</div>
              <div style={{ fontFamily: 'monospace', color: 'var(--c-green)' }}>{shortId(eveIdentity.frontierwarden_profile_id)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
