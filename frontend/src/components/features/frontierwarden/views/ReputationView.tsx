// ReputationView — pilot reputation dossier
// Left: score + tier + identity + vouches | Right: component contribution bars
// All data derived from live FwData; no hardcoded values.

import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import type { FwData } from '../fw-data';

// Tier thresholds: score >= threshold → tier name
const TIER_BANDS = [
  { name: 'I',   label: 'RECRUIT',  threshold: 0 },
  { name: 'II',  label: 'WARDEN',   threshold: 200 },
  { name: 'III', label: 'WARDEN',   threshold: 400 },
  { name: 'IV',  label: 'SENTINEL', threshold: 600 },
  { name: 'V',   label: 'GUARDIAN', threshold: 800 },
  { name: 'VI',  label: 'ARCHON',   threshold: 950 },
] as const;

function computeTier(score: number): { index: number; name: string; label: string } {
  let tier: typeof TIER_BANDS[number] = TIER_BANDS[0];
  let idx = 0;
  for (let i = TIER_BANDS.length - 1; i >= 0; i--) {
    if (score >= TIER_BANDS[i].threshold) {
      tier = TIER_BANDS[i];
      idx = i;
      break;
    }
  }
  return { index: idx, name: tier.name, label: tier.label };
}

function loanCap(score: number): string {
  // Loan cap scales with score: base 1000 EVT per 100 score
  const cap = Math.floor(score / 100) * 1000;
  return cap >= 1000 ? `${cap.toLocaleString()} EVT` : '0 EVT';
}

interface ScoreComponent {
  label: string;
  value: number;
  max: number;
  note: string;
}

function deriveComponents(data: FwData): ScoreComponent[] {
  const { vouches, proofs, kills, contracts, pilot } = data;

  // Vouch weight: total vouch count * avg weight, max based on source count
  const vouchSources = vouches.length;
  const avgWeight = vouches.reduce((sum, v) => sum + v.weight, 0) / Math.max(1, vouchSources);
  const vouchScore = Math.round(avgWeight * vouchSources * 100);
  const vouchMax = Math.max(vouchScore + 100, 500);

  // Kill verification: verified kills count toward reputation
  const verifiedKills = kills.filter(k => k.verified).length;
  const killScore = verifiedKills * (kills.length > 0 ? Math.round(250 / Math.max(kills.length, 1)) : 0);
  const killMax = 250;

  // Contract history: completed contracts (non-expired)
  const closedContracts = contracts.filter(c => c.state !== 'OPEN').length;
  const contractScore = Math.min(200, closedContracts * 30);
  const contractMax = 200;

  // Attestation proofs: active (non-revoked) proofs
  const activeProofs = proofs.filter(p => !p.revoked).length;
  const proofScore = Math.min(100, activeProofs * 25);
  const proofMax = 100;

  // Pirate penalty: contested kills (friendly fire)
  const friendlyKills = kills.filter(k => k.friendly === true).length;
  const piratePenalty = friendlyKills > 0 ? -(friendlyKills * 4) : 0;
  const pirateMax = -50;

  return [
    { label: 'Vouch Weight',       value: vouchScore,    max: vouchMax,    note: `${vouchSources} source${vouchSources !== 1 ? 's' : ''}` },
    { label: 'Kill Verification',  value: killScore,     max: killMax,     note: `${verifiedKills} verified / ${kills.length} total` },
    { label: 'Contract History',   value: contractScore, max: contractMax, note: `${closedContracts} closed` },
    { label: 'Attestation Proofs', value: proofScore,    max: proofMax,    note: `${activeProofs} active proofs` },
    { label: 'Pirate-Idx Penalty', value: piratePenalty, max: pirateMax,   note: `${friendlyKills} contested` },
  ];
}

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

export function ReputationView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const { pilot, proofs, vouches } = data;

  const tier = computeTier(pilot.score);
  const components = deriveComponents(data);

  // Live account summary values
  const activeVouches = vouches.length;
  const activeProofs = proofs.filter(p => !p.revoked).length;
  const friendlyKills = data.kills.filter(k => k.friendly === true).length;

  return (
    <div className="c-rep-grid">

      {/* ── Left col ──────────────────────────────── */}
      <div>
        <div className="c-view__title" style={{ marginBottom: 12 }}>Pilot Dossier</div>
        <LiveStatus
          loading={loading}
          live={live}
          error={error}
          provenance={provenance}
          liveText={pilot.checkpoint ? `Live profile / checkpoint ${pilot.checkpoint}` : 'Live profile'}
          emptyText="No profile indexed"
        />
        {/* Score */}
        <div className="c-stat">
          <div className="c-stat__label">Composite Score · 0–1000</div>
          <div className="c-stat__value">{pilot.score}</div>
          <div className="c-stat__delta">▲ +{pilot.scoreDelta} · 30d</div>
          <div className="c-stat__tier">
            tier <strong>{tier.label} {tier.name}</strong> · loan cap <span style={{ color: 'var(--c-hi)' }}>{loanCap(pilot.score)}</span>
          </div>
        </div>

        {/* Tier ladder */}
        <div style={{ marginBottom: 32 }}>
          <div className="c-stat__label" style={{ marginBottom: 10 }}>Tier Progression</div>
          <div className="c-tier">
            {TIER_BANDS.map((t, i) => (
              <div key={t.name} style={{ flex: 1, position: 'relative' }}>
                <div className={`c-tier__seg${i < tier.index ? ' c-tier__seg--active' : i === tier.index ? ' c-tier__seg--current' : ''}`} />
                <div style={{
                  position: 'absolute', top: 10, left: 0,
                  fontSize: 9,
                  color: i <= tier.index ? 'var(--c-amber)' : 'var(--c-lo)',
                  letterSpacing: '0.08em',
                }}>{t.name}</div>
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
            ['Source',    pilot.sourceId ?? 'design fixture'],
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
        <div className="c-view__title" style={{ marginBottom: 20 }}>Attestation Proofs</div>

        <table className="c-table" style={{ marginBottom: 36 }}>
          <thead>
            <tr>
              <th>Schema</th>
              <th>Value</th>
              <th>Issuer</th>
              <th style={{ textAlign: 'right' }}>Tx</th>
            </tr>
          </thead>
          <tbody>
            {proofs.map(proof => (
              <tr key={`${proof.id}-${proof.tx}`}>
                <td>
                  <div style={{ fontSize: 12 }}>{proof.schema}</div>
                  <div className="c-sub">{proof.revoked ? 'REVOKED' : 'ACTIVE'} / {proof.id}</div>
                </td>
                <td style={{ color: proof.revoked ? 'var(--c-crimson)' : 'var(--c-amber)' }}>
                  {proof.value}
                </td>
                <td style={{ color: 'var(--c-mid)' }}>{proof.issuer}</td>
                <td style={{ textAlign: 'right' }}>{proof.tx}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="c-view__title" style={{ marginBottom: 32 }}>Score Breakdown</div>

        {components.map((c, i) => {
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

        {/* Stat summary — derived from live data */}
        <div style={{
          marginTop: 48, padding: '24px',
          border: '1px solid var(--c-border)',
          background: 'rgba(245,158,11,0.03)',
        }}>
          <div className="c-stat__label" style={{ marginBottom: 16 }}>Account Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 24 }}>
            {[
              { k: 'Active Vouches',    v: String(activeVouches), sub: `of ${Math.max(activeVouches, 22)} max` },
              { k: 'Attestation Proofs', v: String(activeProofs),  sub: `${proofs.length} total` },
              { k: 'Pirate Index',       v: String(friendlyKills), sub: 'contested kills' },
              { k: 'Current Tier',       v: `${tier.label} ${tier.name}`, sub: `score ${pilot.score}` },
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
