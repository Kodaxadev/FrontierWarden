// ReputationDossier — Center column · top panel.
// Composite reputation score, tier ladder, sparkline, component bars, stat tiles.

import { FwPanel, ClsHeader, DocFootC, FwSpark, StatC } from './fw-atoms';
import { FW_DATA, REP_SPARK } from './fw-data';
import type { FwData } from './fw-data';

const COMPONENTS = [
  { k: 'Vouch Weight',      v: 412,  max: 500, c: 'var(--standing-ally)',  n: '14 sources' },
  { k: 'Kill Verification', v: 198,  max: 250, c: 'var(--sui-cyan)',        n: '47 attests / 30d' },
  { k: 'Contract History',  v: 142,  max: 200, c: 'var(--alloy-silver)',    n: '22 closed' },
  { k: 'Stake on Behavior', v: 95,   max: 100, c: 'var(--alloy-gold)',      n: '2.4M LUX locked' },
  { k: 'Pirate-Idx Penalty',v: -12,  max: -50, c: 'var(--tribe-crimson)',   n: '3 contested' },
];

const TIERS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

interface ReputationDossierProps { data?: FwData; }

export function ReputationDossier({ data }: ReputationDossierProps = {}) {
  const { pilot } = data ?? FW_DATA;

  return (
    <FwPanel style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
      <ClsHeader
        priority="HIGH"
        label="DOSSIER · COMPOSITE REPUTATION"
        classification="ENT#0041 · DOC-R1"
        accent="var(--alloy-gold)"
        right={
          <div style={{
            display: 'flex', gap: 8,
            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t-muted)', letterSpacing: '0.1em',
          }}>
            <span>RECOMP 07:32:14Z</span>
            <span style={{ color: 'var(--alloy-gold)' }}>· BUREAU SEAL ✶</span>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0, flex: 1 }}>

        {/* ── Score + tier + sparkline ───────────────────────── */}
        <div style={{
          padding: '14px 18px',
          borderRight: '1px dashed var(--b-08)',
          position: 'relative',
        }}>
          <div className="fw-data-label" style={{ fontSize: 9 }}>composite · 0–1000</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span className="fw-mono" style={{
              fontSize: 56, fontWeight: 500, lineHeight: 1,
              color: 'var(--alloy-gold)', letterSpacing: '-0.02em',
              textShadow: '0 0 24px rgba(251,191,36,0.25)',
            }}>
              {pilot.score}
            </span>
            <span className="fw-mono" style={{ fontSize: 14, color: 'var(--status-clear)' }}>
              ▲ +{pilot.scoreDelta}
            </span>
          </div>
          <div className="fw-mono" style={{ fontSize: 10, color: 'var(--t-secondary)', marginTop: 6 }}>
            tier <span style={{ color: 'var(--alloy-gold)' }}>WARDEN III</span>
            {' · '}loan cap <span style={{ color: 'var(--t-primary)' }}>12,400 LUX</span>
          </div>

          {/* Tier ladder */}
          <div style={{ marginTop: 14 }}>
            <div className="fw-data-label" style={{ fontSize: 9, marginBottom: 4 }}>tier ladder</div>
            <div style={{ display: 'flex', height: 8, gap: 2 }}>
              {TIERS.map((t, i) => (
                <div key={t} style={{
                  flex: 1, position: 'relative',
                  background: i <= 2 ? 'var(--alloy-gold)' : 'var(--void-600)',
                  opacity: i <= 2 ? 0.85 : 1,
                  boxShadow: i === 2 ? '0 0 10px rgba(251,191,36,0.5)' : 'none',
                }}>
                  <span className="fw-mono" style={{
                    position: 'absolute', top: 10, left: 0,
                    fontSize: 9,
                    color: i <= 2 ? 'var(--alloy-gold)' : 'var(--t-muted)',
                  }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 30-day sparkline */}
          <div style={{ marginTop: 22 }}>
            <div className="fw-data-label" style={{ fontSize: 9, marginBottom: 4 }}>30d trend · sealed</div>
            <FwSpark data={REP_SPARK} color="var(--alloy-gold)" height={32} fill />
          </div>

          {/* Verified stamp */}
          <div style={{
            position: 'absolute', right: 14, bottom: 6,
            border: '1.5px solid var(--frontier-amber)',
            padding: '4px 8px', transform: 'rotate(-6deg)',
            opacity: 0.7,
            fontFamily: 'var(--f-mono)', fontSize: 8,
            letterSpacing: '0.18em', color: 'var(--frontier-amber)',
          }}>
            VERIFIED · WRDN-7
          </div>
        </div>

        {/* ── Component bars ────────────────────────────────── */}
        <div style={{ padding: '14px 18px' }}>
          <div className="fw-data-label" style={{ fontSize: 9, marginBottom: 10 }}>
            component contribution · signed by attestor
          </div>

          {COMPONENTS.map((row, i) => {
            const pct = (Math.abs(row.v) / Math.abs(row.max)) * 100;
            const neg = row.v < 0;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 60px',
                gap: 12, marginBottom: 9, alignItems: 'center',
              }}>
                <div>
                  <div className="fw-mono" style={{ fontSize: 11, color: 'var(--t-secondary)' }}>{row.k}</div>
                  <div className="fw-mono" style={{ fontSize: 9, color: 'var(--t-muted)' }}>{row.n}</div>
                </div>
                <div style={{ height: 4, background: 'var(--void-600)', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    [neg ? 'right' : 'left']: '50%',
                    width: `${pct / 2}%`,
                    background: row.c,
                    boxShadow: `0 0 8px ${row.c}`,
                  }} />
                  <div style={{
                    position: 'absolute', top: -2, bottom: -2,
                    left: '50%', width: 1,
                    background: 'var(--b-15)',
                  }} />
                </div>
                <span className="fw-mono" style={{
                  fontSize: 11, textAlign: 'right', color: row.c,
                  textShadow: `0 0 8px ${row.c}30`,
                }}>
                  {row.v > 0 ? `+${row.v}` : row.v}
                </span>
              </div>
            );
          })}

          {/* Stat tiles */}
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <StatC k="Active Vouches" v="14"       sub="of 22 max" />
            <StatC k="Pirate Idx"     v="12"       sub="of 100 cap" color="var(--status-clear)" />
            <StatC k="Last Decay"     v="-4 / 7d"  sub="natural attrition" />
          </div>
        </div>

      </div>

      <DocFootC>
        <span>// reputation_score.sealed</span>
        <span>ATTESTOR: WRDN-7 · BLOCK 18,402,108</span>
      </DocFootC>
    </FwPanel>
  );
}
