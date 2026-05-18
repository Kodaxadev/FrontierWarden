import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import type { SponsoredState } from '../../../../hooks/useSponsoredTransaction';
import type { FwGate } from '../fw-data';
import { SponsoredPassageStatus } from './SponsoredPassageStatus';

interface GatePassageAttemptPanelProps {
  selectedGate: FwGate;
  accountAddress: string | null;
  passageState: SponsoredState;
  attestationId: string | null;
  attestationLoading: boolean;
  attestationError: string | null;
  diagnosticsCopied: boolean;
  lastSponsoredAt: string | null;
  onCheckPassage: () => void;
  onResetPassage: () => void;
  onCopyDiagnostics: () => void;
  shortAddr: (value: string) => string;
}

const BUSY_STEPS = ['building', 'sponsoring', 'signing', 'executing'];

export function GatePassageAttemptPanel({
  selectedGate,
  accountAddress,
  passageState,
  attestationId,
  attestationLoading,
  attestationError,
  diagnosticsCopied,
  lastSponsoredAt,
  onCheckPassage,
  onResetPassage,
  onCopyDiagnostics,
  shortAddr,
}: GatePassageAttemptPanelProps) {
  const busy = BUSY_STEPS.includes(passageState.step);

  return (
    <section style={{
      marginTop: 24,
      padding: 20,
      border: '1px solid var(--c-border)',
      background: 'rgba(0,210,255,0.018)',
    }}>
      <div className="c-stat__label" style={{ marginBottom: 8 }}>
        Passage Decision Preview / {selectedGate.id}
      </div>
      <div className="c-sub" style={{ marginBottom: 14 }}>
        Check Passage uses the existing transaction path. It should show proof before operators treat
        a result as a gate decision.
      </div>

      {!accountAddress && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="c-wallet-connect">
            <ConnectButton>CONNECT WALLET</ConnectButton>
          </div>
          <span className="c-sub">Connect wallet and sign an operator session before checking passage.</span>
        </div>
      )}

      {accountAddress && (
        <div>
          <div className="c-kv">
            <span className="c-kv__k">Traveler</span>
            <span className="c-kv__v">{accountAddress}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Proof</span>
            <span className="c-kv__v">
              {attestationLoading
                ? 'fetching...'
                : attestationId
                  ? `TRIBE_STANDING ${shortAddr(attestationId)}`
                  : <span style={{ color: 'var(--c-amber)' }}>{attestationError ?? 'none'}</span>
              }
            </span>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              className="c-commit"
              disabled={!attestationId || busy}
              title={!attestationId ? (attestationError ?? 'No TRIBE_STANDING attestation') : 'Submit gate passage attempt'}
              onClick={() => {
                if (passageState.step === 'done') {
                  onResetPassage();
                } else {
                  onCheckPassage();
                }
              }}
            >
              {busy
                ? passageState.step.toUpperCase()
                : passageState.step === 'done'
                  ? 'CLEAR'
                  : passageState.step === 'error'
                    ? 'RETRY'
                    : 'CHECK PASSAGE'
              }
            </button>

            <span style={{
              fontSize: 10,
              color: passageState.step === 'error'
                ? 'var(--c-crimson)'
                : passageState.step === 'done'
                  ? 'var(--c-green)'
                  : 'var(--c-mid)',
            }}>
              {passageState.step === 'done' && passageState.digest
                ? `passage recorded / tx ${shortAddr(passageState.digest)}`
                : passageState.step === 'error' && passageState.error
                  ? passageState.error
                  : attestationId
                    ? `proof ready / ${shortAddr(attestationId)}`
                    : 'Awaiting proof'}
            </span>
          </div>

          <details style={{ marginTop: 14 }}>
            <summary className="c-sub" style={{ cursor: 'pointer' }}>
              Advanced diagnostics
            </summary>
            <SponsoredPassageStatus
              state={passageState}
              copied={diagnosticsCopied}
              successAt={lastSponsoredAt}
              onCopyDiagnostics={onCopyDiagnostics}
              shortAddr={shortAddr}
            />
          </details>
        </div>
      )}
    </section>
  );
}
