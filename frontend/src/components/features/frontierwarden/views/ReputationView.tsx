// ReputationView — pilot reputation dossier
// Left: score + tier + identity + vouches | Right: component contribution bars

import type { FwData } from '../fw-data';

const TIERS = ['I','II','III','IV','V','VI'];
const CURRENT_TIER = 2; // 0-indexed, III = index 2

const COMPONENTS = [
  { label: 'Vouch Weight',       value: 412, max: 500, note: '14 sources' },
  { label: 'Kill Verification',  value: 198, max: 250, note: '47 attests / 30d' },
  { label: 'Contract History',   value: 142, max: 200, note: '22 closed' },
  { label: 'Stake on Behavior',  value: 95,  max: 100, note: '2.4M ISK locked' },
  { label: 'Pirate-Idx Penalty', value: -12, max: -50, note: '3 contested' },
];

interface Props { data: FwData; }

export function ReputationView({ data }: Props) {
  const { pilot, vouches } = data;
  const iskM = (pilot.walletIsk / 1_000_000).toFixed(1);

  return (
    <div className="c-rep-grid">

      {/* ── Left col ──────────────────────────────── */}
      <div>
        <div className="c-view__title" style={{ marginBottom: 32 }}>Pilot Dossier</div>

        {/* Score */}
        <div className="c-stat">
          <div className="c-stat__label">Composite Score · 0–1000</div>
          <div className="c-stat__value">{pilot.score}</div>
          <div className="c-stat__delta">▲ +{pilot.scoreDelta} · 30d</div>
          <div className="c-stat__tier">
            tier <strong>WARDEN III</strong> · loan cap <span style={{ color: 'var(--c-hi)' }}>12,400 ISK</span>
          </div>
        </div>

        {/* Tier ladder */}
        <div style={{ marginBottom: 32 }}>
          <div className="c-stat__label" style={{ marginBottom: 10 }}>Tier Progression</div>
          <div className="c-tier">
            {TIERS.map((t, i) => (
              <div key={t} style={{ flex: 1, position: 'relative' }}>
                <div className={`c-tier__seg${i < CURRENT_TIER ? ' c-tier__seg--active' : i === CURRENT_TIER ? ' c-tier__seg--current' : ''}`} />
                <div style={{
                  position: 'absolute', top: 10, left: 0,
                  fontSize: 9,
                  color: i <= CURRENT_TIER ? 'var(--c-amber)' : 'var(--c-lo)',
                  letterSpacing: '0.08em',
                }}>{t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Identity */}
        <div style={{ marginBottom: 32 }}>
          <div className="c-stat__label" style={{ marginBottom: 8 }}>Identity</div>
          {([
            ['Pilot',     pilot.name],
            ['Handle',    pilot.handle],
            ['Syndicate', pilot.syndicate],
            ['Tribe',     pilot.tribe],
            ['Standing',  pilot.standing],
            ['Wallet',    `${iskM}M ISK`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="c-kv">
              <span className="c-kv__k">{k}</span>
              <span className="c-kv__v">{v}</span>
            </div>
          ))}
        </div>

        {/* Vouch seals */}
        <div>
          <div className="c-stat__label" style={{ marginBottom: 12 }}>Vouch Seals · {vouches.length} active</div>
          {vouches.map((v, i) => (
            <div key={i} className="c-vouch">
              <div style={{ flex: 1 }}>
                <div className="c-vouch__name">{v.from}</div>
                <div className="c-vouch__meta">{v.by}</div>
                <div className="c-bar" style={{ marginTop: 8 }}>
                  <div className="c-bar__fill" style={{ width: `${v.weight * 100}%` }} />
                </div>
              </div>
              <div className="c-vouch__weight">{v.weight.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right col ─────────────────────────────── */}
      <div>
        <div className="c-view__title" style={{ marginBottom: 32 }}>Score Breakdown</div>

        {COMPONENTS.map((c, i) => {
          const neg = c.value < 0;
          const pct = (Math.abs(c.value) / Math.abs(c.max)) * 100;
          return (
            <div key={i} className="c-comp">
              <div className="c-comp__header">
                <div>
                  <div className="c-comp__name">{c.label}</div>
                  <div className="c-comp__sub">{c.note}</div>
                </div>
                <div className={`c-comp__val ${neg ? 'c-comp__val--neg' : 'c-comp__val--pos'}`}>
                  {c.value > 0 ? `+${c.value}` : c.value}
                </div>
              </div>
              <div className="c-comp__track">
                <div className="c-comp__fill" style={{
                  [neg ? 'right' : 'left']: 0,
                  width: `${pct}%`,
                  background: neg ? 'var(--c-crimson)' : 'var(--c-amber)',
                  boxShadow: neg ? '0 0 8px rgba(239,68,68,0.4)' : '0 0 8px rgba(245,158,11,0.4)',
                  top: 0, bottom: 0, borderRadius: '2px',
                }} />
              </div>
            </div>
          );
        })}

        {/* Stat summary */}
        <div style={{
          marginTop: 48, padding: '24px',
          border: '1px solid var(--c-border)',
          background: 'rgba(245,158,11,0.03)',
        }}>
          <div className="c-stat__label" style={{ marginBottom: 16 }}>Account Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[
              { k: 'Active Vouches',   v: '14', sub: 'of 22 max' },
              { k: 'Pirate Index',     v: '12',  sub: 'of 100 cap', warn: false },
              { k: 'Last Decay',       v: '−4',  sub: 'per 7d natural' },
            ].map(s => (
              <div key={s.k}>
                <div className="c-stat__label">{s.k}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--c-hi)', letterSpacing: '-0.02em', marginTop: 4 }}>{s.v}</div>
                <div className="c-sub" style={{ marginTop: 4 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
