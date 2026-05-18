// GatePassagePreviewPanel — read-only passage decision preview + proof link.
// Extracted from PolicyView to keep files under 400 lines.

import type { FwPolicy, FwPilot, FwGate, FwProof } from '../fw-data';

const formatSui = (mist: number) =>
  mist === 0 ? '0 SUI' : `${(mist / 1_000_000_000).toFixed(3)} SUI`;
const shortId = (value: string) =>
  value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;

interface Props {
  policy: FwPolicy | undefined;
  pilot: FwPilot | undefined;
  selectedGate: FwGate | undefined;
  standingProof: FwProof | undefined;
  allowed: boolean;
  decision: string;
  score: number;
  threshold: number;
  tollMist: number;
}

export function GatePassagePreviewPanel({
  policy, pilot, selectedGate, standingProof,
  allowed, decision, score, threshold, tollMist,
}: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 1,
      maxWidth: 900,
      marginBottom: 48,
      border: '1px solid var(--c-border)',
      background: 'var(--c-border)',
    }}>
      <div style={{ background: 'var(--c-surface)', padding: 24 }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Smart Gate Passage Preview</div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: allowed ? 'var(--c-green)' : 'var(--c-crimson)' }}>
              {decision}
            </div>
            <div className="c-sub" style={{ marginTop: 6 }}>
              {pilot?.handle ?? 'PILOT#0041'} / {selectedGate?.id ?? 'GATE#7720'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="c-stat__label">Toll Due</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tollMist > 0 ? 'var(--c-amber)' : 'var(--c-hi)' }}>
              {formatSui(tollMist)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div className="c-kv">
            <span className="c-kv__k">Score</span>
            <span className="c-kv__v">{score}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Threshold</span>
            <span className="c-kv__v">{threshold}</span>
          </div>
          <div className="c-kv">
            <span className="c-kv__k">Reason</span>
            <span className="c-kv__v">
              {allowed ? 'score satisfies gate policy' : 'score below gate policy'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--c-surface)', padding: 24 }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>Proof Link</div>
        {standingProof ? (
          <>
            <div className="c-kv">
              <span className="c-kv__k">Schema</span>
              <span className="c-kv__v">{standingProof.schema}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Issuer</span>
              <span className="c-kv__v">{standingProof.issuer}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Tx</span>
              <span className="c-kv__v">{standingProof.tx}</span>
            </div>
            <div className="c-kv">
              <span className="c-kv__k">Policy</span>
              <span className="c-kv__v">{policy ? shortId(policy.txDigest) : 'design fixture'}</span>
            </div>
          </>
        ) : (
          <div className="c-sub">No live proof rows indexed for this profile yet.</div>
        )}
      </div>
    </div>
  );
}
