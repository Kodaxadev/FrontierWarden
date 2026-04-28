// VouchSeals — Right column · bottom panel.
// Attestation-backed vouch sources with weight bars and sealed doc labels.

import { FwPanel, ClsHeader, DocFootC } from './fw-atoms';
import type { FwData } from './fw-data';

interface VouchSealsProps { data: FwData; }

export function VouchSeals({ data }: VouchSealsProps) {
  const totalWeight = data.vouches.reduce((s, v) => s + v.weight, 0).toFixed(2);

  return (
    <FwPanel
      accentColor="var(--standing-ally)"
      style={{
        borderLeft: 'none', borderRight: 'none',
        boxShadow: '0 -1px 0 rgba(59,130,246,0.2)',
      }}
    >
      <ClsHeader
        priority="MED"
        label="VOUCH SEAL · ATTESTATIONS"
        classification={`DOC-V1 · ${data.vouches.length} SOURCES`}
        accent="var(--standing-ally)"
        right={
          <span className="fw-mono" style={{
            fontSize: 9, color: 'var(--standing-ally)',
            letterSpacing: '0.14em',
            border: '1px solid var(--standing-ally)',
            padding: '2px 6px',
            boxShadow: '0 0 10px rgba(59,130,246,0.2)',
            cursor: 'pointer',
          }}>
            + REQUEST VOUCH
          </span>
        }
      />

      <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
        {data.vouches.map((v, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 60px',
            gap: 10, alignItems: 'center',
            padding: '8px 0',
            borderBottom: i < data.vouches.length - 1 ? '1px dashed var(--b-08)' : 'none',
          }}>
            <div>
              {/* Doc micro-label */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--f-mono)', fontSize: 8,
                color: 'var(--frontier-amber)', letterSpacing: '0.14em',
                marginBottom: 2,
              }}>
                <span>◤ DOC-V{i + 1} · ATTEST 0x{(0x9a3 + i * 31).toString(16)}…f{i}1</span>
                <span style={{ color: 'var(--standing-ally)' }}>SEALED</span>
              </div>

              <div className="fw-mono" style={{ fontSize: 12, color: 'var(--t-primary)' }}>
                {v.from}
              </div>
              <div className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)' }}>
                {v.by} · {v.ts}
              </div>

              {/* Weight bar */}
              <div style={{ marginTop: 5, height: 3, background: 'var(--void-600)' }}>
                <div style={{
                  height: '100%',
                  width: `${v.weight * 100}%`,
                  background: 'var(--standing-ally)',
                  boxShadow: '0 0 8px rgba(59,130,246,0.4)',
                  transition: 'width 300ms ease-out',
                }} />
              </div>
            </div>

            {/* Weight value */}
            <span className="fw-mono" style={{
              fontSize: 14, textAlign: 'right', color: 'var(--standing-ally)',
              textShadow: '0 0 10px rgba(59,130,246,0.4)',
            }}>
              {v.weight.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <DocFootC>
        <span>// vouch_seal.signed</span>
        <span>SUM {totalWeight} · COVERAGE {data.vouches.length}/8</span>
      </DocFootC>
    </FwPanel>
  );
}
