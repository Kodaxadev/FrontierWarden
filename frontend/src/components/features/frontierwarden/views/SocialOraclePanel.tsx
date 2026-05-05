import type { OracleRow } from '../../../../types/api.types';
import { SocialStatusLine } from './SocialStatusLine';

interface ActionState {
  step: string;
  digest: string | null;
  error: string | null;
}

interface SocialOraclePanelProps {
  accountConnected: boolean;
  busy: boolean;
  existingOracle: OracleRow | null;
  oracleCheckLoading: boolean;
  oracleName: string;
  oracleSchemas: string;
  requestedSystemOracle: boolean;
  canRegisterSystem: boolean;
  teeVerified: boolean;
  teeHash: string;
  oracleState: ActionState;
  setOracleName: (value: string) => void;
  setOracleSchemas: (value: string) => void;
  setIsSystemOracle: (value: boolean) => void;
  setTeeVerified: (value: boolean) => void;
  setTeeHash: (value: string) => void;
  onRegisterOracle: () => void;
  onReset: () => void;
}

export function SocialOraclePanel({
  accountConnected,
  busy,
  existingOracle,
  oracleCheckLoading,
  oracleName,
  oracleSchemas,
  requestedSystemOracle,
  canRegisterSystem,
  teeVerified,
  teeHash,
  oracleState,
  setOracleName,
  setOracleSchemas,
  setIsSystemOracle,
  setTeeVerified,
  setTeeHash,
  onRegisterOracle,
  onReset,
}: SocialOraclePanelProps) {
  return (
    <div style={{ maxWidth: 760, marginBottom: 24, padding: '16px 20px', border: '1px solid var(--c-border)', background: 'rgba(0,210,255,0.018)' }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>
        {existingOracle ? 'Oracle Registration' : 'Register Oracle'}
      </div>

      {existingOracle ? (
        <>
          <div className="c-sub" style={{ marginBottom: 12 }}>
            This wallet is already registered as an oracle.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <div className="c-policy__label">Name</div>
              <div className="c-sub">{existingOracle.name}</div>
            </div>
            <div>
              <div className="c-policy__label">TEE Verified</div>
              <div className="c-sub">{existingOracle.tee_verified ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="c-policy__label">System Oracle</div>
              <div className="c-sub">{existingOracle.is_system_oracle ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="c-policy__label">Registered TX</div>
              <div className="c-sub" style={{ wordBreak: 'break-all' }}>{existingOracle.registered_tx}</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="c-sub" style={{ marginBottom: 12 }}>
            Stakes from wallet: 0.1 SUI (system) or 1 SUI (regular). OracleCapability is transferred to sender.
            Schemas can also be added later via the Oracle tab.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
            <label>
              <div className="c-policy__label">Oracle Name</div>
              <input className="c-input" placeholder="my-oracle" value={oracleName} onChange={e => setOracleName(e.target.value)} />
            </label>
            <label>
              <div className="c-policy__label">Initial Schemas (comma-separated)</div>
              <input className="c-input" placeholder="GATE_HOSTILE,GATE_CAMPED" value={oracleSchemas} onChange={e => setOracleSchemas(e.target.value)} />
            </label>
            <label>
              <div className="c-policy__label">TEE Attestation Hash</div>
              <input className="c-input" placeholder="none" value={teeHash} onChange={e => setTeeHash(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={requestedSystemOracle}
                disabled={!canRegisterSystem}
                onChange={e => setIsSystemOracle(e.target.checked)}
              />
              System Oracle (0.1 SUI)
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={teeVerified} onChange={e => setTeeVerified(e.target.checked)} />
              TEE Verified
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="c-commit" disabled={!accountConnected || busy || !oracleName.trim()}
              onClick={onRegisterOracle}>
              {oracleState.step === 'signing' ? 'SIGNING...' : 'REGISTER ORACLE'}
            </button>
            <SocialStatusLine {...oracleState} />
            {oracleState.step !== 'idle' && <button className="c-tab" onClick={onReset}>CLEAR</button>}
          </div>
        </>
      )}

      {oracleCheckLoading && !existingOracle && (
        <div className="c-sub">Checking registration status...</div>
      )}
    </div>
  );
}
