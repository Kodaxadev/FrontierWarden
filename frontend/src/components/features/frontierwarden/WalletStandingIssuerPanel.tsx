import { useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useWalletAttestationIssue } from '../../../hooks/useWalletAttestationIssue';

const EVE_WALLET =
  '0xabff3b1b9c793cf42f64864b80190fd836ac68391860c0d27491f3ef2fb4430f';

function shortId(value: string | null) {
  if (!value) return '';
  return value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function validAddress(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function WalletStandingIssuerPanel() {
  const { account, state, reset, issueAttestation } = useWalletAttestationIssue();
  const [subject, setSubject] = useState('');
  const [score, setScore] = useState(750);
  const [expiry, setExpiry] = useState(200);

  useEffect(() => {
    if (account?.address && !subject) setSubject(account.address);
  }, [account?.address, subject]);

  const isEve = account?.address.toLowerCase() === EVE_WALLET;
  const canIssue = !!account && validAddress(subject) && score >= 0 && expiry > 0
    && state.step !== 'signing';

  return (
    <div style={{
      maxWidth: 760,
      marginBottom: 24,
      padding: '16px 20px',
      border: '1px solid var(--c-border)',
      background: 'rgba(0,210,255,0.018)',
    }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>
        Issue TRIBE_STANDING From Connected Oracle
      </div>
      <div className="c-sub" style={{ marginBottom: 12 }}>
        Create Profile is separate. Register Oracle first with TRIBE_STANDING in initial schemas, then issue this proof.
      </div>
      {!account && (
        <div style={{ marginBottom: 12 }}>
          <div className="c-wallet-connect"><ConnectButton>CONNECT WALLET</ConnectButton></div>
        </div>
      )}
      {account && (
        <div style={{ marginBottom: 12, fontSize: 11 }}>
          <span className="c-stat__label">Issuer </span>
          <span style={{ color: 'var(--c-hi)', fontFamily: 'monospace' }}>
            {account.address}
          </span>
          {!isEve && (
            <span style={{ color: 'var(--c-amber)', marginLeft: 10 }}>
              not the configured EVE Vault oracle
            </span>
          )}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))',
        gap: 12,
        marginBottom: 14,
      }}>
        <label style={{ gridColumn: 'span 2' }}>
          <div className="c-policy__label">Subject Address</div>
          <input
            className="c-input"
            placeholder="0x..."
            value={subject}
            onChange={event => setSubject(event.target.value)}
            style={{ borderColor: subject && !validAddress(subject) ? 'var(--c-crimson)' : '' }}
          />
        </label>
        <label>
          <div className="c-policy__label">Standing Score</div>
          <input
            className="c-input"
            type="number"
            min={0}
            step={1}
            value={score}
            onChange={event => setScore(Number(event.target.value))}
          />
        </label>
        <label>
          <div className="c-policy__label">Expiry (epochs)</div>
          <input
            className="c-input"
            type="number"
            min={1}
            step={1}
            value={expiry}
            onChange={event => setExpiry(Number(event.target.value))}
          />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button
          className="c-commit"
          disabled={!canIssue}
          title={!validAddress(subject) ? 'Enter a valid 0x address' : 'Issue via connected oracle wallet'}
          onClick={() => void issueAttestation({
            schemaId: 'TRIBE_STANDING',
            subject,
            value: score,
            expirationEpochs: expiry,
          })}
        >
          {state.step === 'signing' ? 'SIGNING...' : 'ISSUE STANDING'}
        </button>
        {state.step === 'done' && (
          <span style={{ fontSize: 10, color: 'var(--c-green)' }}>
            ok tx {shortId(state.digest)}
          </span>
        )}
        {state.step === 'error' && (
          <span style={{ fontSize: 10, color: 'var(--c-crimson)' }}>{state.error}</span>
        )}
        {state.step !== 'idle' && <button className="c-tab" onClick={reset}>CLEAR</button>}
      </div>
    </div>
  );
}
