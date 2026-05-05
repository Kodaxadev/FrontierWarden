import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import type { ProfileRow } from '../../../../types/api.types';
import { SocialStatusLine } from './SocialStatusLine';

interface ActionState {
  step: string;
  digest: string | null;
  error: string | null;
}

interface SocialProfilePanelProps {
  accountConnected: boolean;
  busy: boolean;
  myProfile: ProfileRow | null;
  profileLookup: boolean;
  profState: ActionState;
  onCreateProfile: () => void;
  onLookupProfile: () => void;
  onReset: () => void;
}

export function SocialProfilePanel({
  accountConnected,
  busy,
  myProfile,
  profileLookup,
  profState,
  onCreateProfile,
  onLookupProfile,
  onReset,
}: SocialProfilePanelProps) {
  const profileLoaded = !!myProfile;
  const waitingForIndexer = profState.step === 'done' && !profileLoaded;
  const createDisabled = !accountConnected || busy || profileLoaded || waitingForIndexer;

  return (
    <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(0,210,255,0.018)' }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>Reputation Profile</div>
      <div className="c-sub" style={{ marginBottom: 12 }}>
        Looks up the connected wallet first. Create is only needed when no profile exists.
      </div>
      {!accountConnected && <div style={{ marginBottom: 10 }}><div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div></div>}
      {profileLoaded && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,210,255,0.04)', border: '1px solid var(--c-border)', fontSize: 11 }}>
          <span className="c-stat__label">Profile found - </span>
          <span style={{ fontFamily: 'monospace', color: 'var(--c-hi)' }}>{myProfile.profile_id}</span>
          <span className="c-sub"> (auto-filled below)</span>
        </div>
      )}
      {profState.step === 'done' && !myProfile && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: 'var(--c-amber)' }}>
          Profile transaction confirmed. Waiting for indexer to process...
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          className="c-commit"
          disabled={createDisabled}
          title={
            profileLoaded
              ? 'Profile already exists for this wallet'
              : waitingForIndexer
                ? 'Profile indexed - waiting for indexer...'
                : 'Create reputation profile'
          }
          onClick={onCreateProfile}
        >
          {profState.step === 'signing'
            ? 'SIGNING...'
            : profileLoaded
              ? 'PROFILE READY'
              : 'CREATE PROFILE'}
        </button>
        <button className="c-tab" disabled={!accountConnected || profileLookup} onClick={onLookupProfile}>
          {profileLookup ? 'LOOKING UP...' : 'LOOKUP MY PROFILE'}
        </button>
        {!profileLoaded && <SocialStatusLine {...profState} />}
        {profState.step !== 'idle' && <button className="c-tab" onClick={onReset}>CLEAR</button>}
      </div>
    </div>
  );
}
