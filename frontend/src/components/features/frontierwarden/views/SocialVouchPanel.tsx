import { SocialStatusLine } from './SocialStatusLine';
import { addrValid, objValid } from './social-utils';

interface ActionState {
  step: string;
  digest: string | null;
  error: string | null;
}

interface SocialVouchPanelProps {
  accountConnected: boolean;
  busy: boolean;
  profileId: string;
  vouchee: string;
  vouchStake: number;
  vouchObjId: string;
  vouchState: ActionState;
  setProfileId: (value: string) => void;
  setVouchee: (value: string) => void;
  setVouchStake: (value: number) => void;
  setVouchObjId: (value: string) => void;
  onCreateVouch: () => void;
  onRedeemVouch: () => void;
  onReset: () => void;
}

export function SocialVouchPanel({
  accountConnected,
  busy,
  profileId,
  vouchee,
  vouchStake,
  vouchObjId,
  vouchState,
  setProfileId,
  setVouchee,
  setVouchStake,
  setVouchObjId,
  onCreateVouch,
  onRedeemVouch,
  onReset,
}: SocialVouchPanelProps) {
  return (
    <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.012)' }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>Create Vouch</div>
      <div className="c-sub" style={{ marginBottom: 12 }}>Voucher must have CREDIT score &gt;= 300. Stake is locked until the vouch expires or defaults.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
        <label>
          <div className="c-policy__label">Your Profile Object ID</div>
          <input className="c-input" placeholder="0x..." value={profileId} onChange={e => setProfileId(e.target.value)}
            style={{ borderColor: profileId && !objValid(profileId) ? 'var(--c-crimson)' : '' }} />
        </label>
        <label>
          <div className="c-policy__label">Vouchee Address</div>
          <input className="c-input" placeholder="0x..." value={vouchee} onChange={e => setVouchee(e.target.value)}
            style={{ borderColor: vouchee && !addrValid(vouchee) ? 'var(--c-crimson)' : '' }} />
        </label>
        <label>
          <div className="c-policy__label">Stake (MIST)</div>
          <input className="c-input" type="number" min={1} value={vouchStake} onChange={e => setVouchStake(Number(e.target.value))} />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="c-commit"
          disabled={!accountConnected || busy || !objValid(profileId) || !addrValid(vouchee) || vouchStake <= 0}
          onClick={onCreateVouch}>
          {vouchState.step === 'signing' ? 'SIGNING...' : 'CREATE VOUCH'}
        </button>
        <SocialStatusLine {...vouchState} />
      </div>
      <div style={{ marginTop: 16, borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
        <div className="c-policy__label" style={{ marginBottom: 8 }}>Redeem Expired Vouch</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: 1 }}>
            <div className="c-policy__label">Vouch Object ID (you are vouchee)</div>
            <input className="c-input" placeholder="0x..." value={vouchObjId} onChange={e => setVouchObjId(e.target.value)} />
          </label>
          <button className="c-commit" disabled={!accountConnected || busy || !vouchObjId}
            onClick={onRedeemVouch}>
            {vouchState.step === 'signing' ? 'SIGNING...' : 'REDEEM'}
          </button>
        </div>
      </div>
      {vouchState.step !== 'idle' && <button className="c-tab" style={{ marginTop: 10 }} onClick={onReset}>CLEAR</button>}
    </div>
  );
}
