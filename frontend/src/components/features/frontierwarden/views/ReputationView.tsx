// ReputationView - user-facing Trust Dossier surface.
// Uses existing FrontierWarden data only; it does not change score formulas,
// issue attestations, or evaluate new policy behavior.

import { useEffect, useState } from 'react';
import { LiveStatus } from '../LiveStatus';
import type { Provenance } from '../LiveStatus';
import type { FwData, FwProof } from '../fw-data';
import type { EveIdentity } from '../../../../types/api.types';
import { fetchEveIdentity } from '../../../../lib/api';
import { useProfileCreate } from '../../../../hooks/useProfileCreate';
import { CombatEvidencePanel } from '../CombatEvidencePanel';

const TIER_BANDS = [
  { name: 'I',   label: 'RECRUIT',  threshold: 0 },
  { name: 'II',  label: 'WARDEN',   threshold: 200 },
  { name: 'III', label: 'WARDEN',   threshold: 400 },
  { name: 'IV',  label: 'SENTINEL', threshold: 600 },
  { name: 'V',   label: 'GUARDIAN', threshold: 800 },
  { name: 'VI',  label: 'ARCHON',   threshold: 950 },
] as const;

interface Props {
  data: FwData;
  live?: boolean;
  loading?: boolean;
  error?: string | null;
  provenance?: Provenance;
}

interface DecisionCard {
  label: string;
  status: string;
  note: string;
  proof: string;
}

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
  const cap = Math.floor(score / 100) * 1000;
  return cap >= 1000 ? `${cap.toLocaleString()} EVT` : '0 EVT';
}

function shortId(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function activeProofs(proofs: FwProof[]): FwProof[] {
  return proofs.filter((proof) => !proof.revoked);
}

function decisionCards(data: FwData): DecisionCard[] {
  const proofs = activeProofs(data.proofs);
  const hasGatePolicy = Boolean(data.policy || data.gates.some((gate) => gate.binding));
  const hasCredit = proofs.some((proof) => proof.schema === 'CREDIT') || data.contracts.length > 0;
  const hasBounty = data.contracts.some((contract) => contract.kind.includes('BOUNTY'));

  return [
    {
      label: 'Gate access',
      status: hasGatePolicy ? 'Ready for Trust Console preview' : 'Needs gate policy context',
      note: 'Tenant policy decides what score or claim is enough for passage.',
      proof: hasGatePolicy ? 'Gate policy or binding evidence is indexed.' : 'Open Gate Operations or Policy.',
    },
    {
      label: 'Counterparty risk',
      status: hasCredit ? 'Credit context available' : 'No credit context',
      note: 'Credit and loan caps stay governed by existing credit logic.',
      proof: hasCredit ? 'Credit proof or contract rows are indexed.' : 'No credit proof or contracts indexed.',
    },
    {
      label: 'Bounty trust',
      status: hasBounty ? 'Bounty context available' : 'No bounty context',
      note: 'Bounty trust should be read from claims, vouches, and contract history.',
      proof: hasBounty ? 'Existing bounty contracts can be reviewed.' : 'No bounty contract rows indexed.',
    },
  ];
}

function EmptyState({ text }: { text: string }) {
  return <div className="c-sub" style={{ padding: '14px 0' }}>{text}</div>;
}

function DecisionCards({ data }: { data: FwData }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {decisionCards(data).map((card) => (
        <section key={card.label} style={{ border: '1px solid var(--c-border)', padding: 16 }}>
          <div className="c-stat__label" style={{ marginBottom: 8 }}>{card.label}</div>
          <div style={{ color: 'var(--c-hi)', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {card.status}
          </div>
          <div className="c-sub" style={{ lineHeight: 1.6, marginBottom: 10 }}>{card.note}</div>
          <div className="c-kv">
            <span className="c-kv__k">Proof</span>
            <span className="c-kv__v">{card.proof}</span>
          </div>
        </section>
      ))}
    </div>
  );
}

function SubjectHeader({
  data,
  eveIdentity,
  identityAddr,
}: {
  data: FwData;
  eveIdentity: EveIdentity | null;
  identityAddr: string | null;
}) {
  const { pilot } = data;
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 18, marginBottom: 22 }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>Subject</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <div>
          <div style={{ color: 'var(--c-hi)', fontSize: 24, fontWeight: 700 }}>
            {eveIdentity?.character_name ?? pilot.characterName ?? pilot.name}
          </div>
          <div className="c-sub" style={{ marginTop: 4 }}>
            {identityAddr ? shortId(identityAddr) : 'No subject wallet selected'}
          </div>
        </div>
        <KeyValue label="Tenant interpretation" value={eveIdentity?.tenant ?? eveIdentity?.tribe_name ?? pilot.tribe} />
        <KeyValue label="Environment" value={pilot.syndicate} />
        <KeyValue label="Dossier status" value="Evidence and context, not universal truth" />
      </div>
    </section>
  );
}

function ScoreSummary({ data }: { data: FwData }) {
  const tier = computeTier(data.pilot.score);
  return (
    <section className="c-stat" style={{ marginBottom: 22 }}>
      <div className="c-stat__label">Current Indexed Score</div>
      <div className="c-stat__value">{data.pilot.score}</div>
      <div className="c-stat__delta">+{data.pilot.scoreDelta} / 30d</div>
      <div className="c-stat__tier">
        tier <strong>{tier.label} {tier.name}</strong> / loan cap{' '}
        <span style={{ color: 'var(--c-hi)' }}>{loanCap(data.pilot.score)}</span>
      </div>
      <div className="c-sub" style={{ marginTop: 12 }}>
        Score display is preserved from the existing surface. This dossier does not create new reputation formulas.
      </div>
    </section>
  );
}

function TierLadder({ score }: { score: number }) {
  const tier = computeTier(score);
  return (
    <section style={{ marginBottom: 22 }}>
      <div className="c-stat__label" style={{ marginBottom: 10 }}>Tier Progression</div>
      <div className="c-tier">
        {TIER_BANDS.map((item, index) => (
          <div key={item.name} style={{ flex: 1, position: 'relative' }}>
            <div className={`c-tier__seg${index < tier.index ? ' c-tier__seg--active' : index === tier.index ? ' c-tier__seg--current' : ''}`} />
            <div style={{
              position: 'absolute', top: 10, left: 0,
              fontSize: 9,
              color: index <= tier.index ? 'var(--c-amber)' : 'var(--c-lo)',
              letterSpacing: '0.08em',
            }}>
              {item.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="c-kv">
      <span className="c-kv__k">{label}</span>
      <span className="c-kv__v">{value}</span>
    </div>
  );
}

function ProofSection({ proofs }: { proofs: FwProof[] }) {
  const active = activeProofs(proofs);
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
      <div className="c-view__title" style={{ marginBottom: 6 }}>Trust Claims / Attestations</div>
      <div className="c-sub" style={{ marginBottom: 14 }}>Every decision should show proof.</div>
      {proofs.length === 0 ? (
        <EmptyState text="No attestations indexed for this dossier." />
      ) : (
        <table className="c-table">
          <thead>
            <tr><th>Schema</th><th>Value</th><th>Issuer</th><th style={{ textAlign: 'right' }}>Tx</th></tr>
          </thead>
          <tbody>
            {proofs.map((proof) => (
              <tr key={`${proof.id}-${proof.tx}`}>
                <td>
                  <div style={{ fontSize: 12 }}>{proof.schema}</div>
                  <div className="c-sub">{proof.revoked ? 'REVOKED' : 'ACTIVE'} / {proof.id}</div>
                </td>
                <td style={{ color: proof.revoked ? 'var(--c-crimson)' : 'var(--c-amber)' }}>{proof.value}</td>
                <td style={{ color: 'var(--c-mid)' }}>{proof.issuer}</td>
                <td style={{ textAlign: 'right' }}>{proof.tx}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details style={{ marginTop: 14 }}>
        <summary className="c-sub" style={{ cursor: 'pointer' }}>Technical details</summary>
        <div className="c-sub" style={{ marginTop: 8 }}>
          {active.length} active proof{active.length === 1 ? '' : 's'} / {proofs.length} total.
        </div>
      </details>
    </section>
  );
}

function VouchSection({ data }: { data: FwData }) {
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
      <div className="c-view__title" style={{ marginBottom: 6 }}>Vouches</div>
      <div className="c-sub" style={{ marginBottom: 14 }}>Tenant policy decides how vouches affect trust.</div>
      {data.vouches.length === 0 ? (
        <EmptyState text="No vouches indexed for this subject." />
      ) : data.vouches.map((vouch, index) => (
        <div key={`${vouch.from}-${index}`} className="c-vouch">
          <div style={{ flex: 1 }}>
            <div className="c-vouch__name">{vouch.from}</div>
            <div className="c-vouch__meta">{vouch.by}</div>
            <div className="c-bar" style={{ marginTop: 8 }}>
              <div className="c-bar__fill" style={{ width: `${vouch.weight * 100}%` }} />
            </div>
          </div>
          <div className="c-vouch__weight">{vouch.weight.toFixed(2)}</div>
        </div>
      ))}
    </section>
  );
}

function ContextSection({ data }: { data: FwData }) {
  const disputeAlerts = data.alerts.filter((alert) => /challenge|fraud/i.test(alert.msg));
  return (
    <section style={{ border: '1px solid var(--c-border)', padding: 18 }}>
      <div className="c-view__title" style={{ marginBottom: 12 }}>Dossier Context</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <KeyValue label="Combat evidence" value={data.kills.length ? `${data.kills.length} killmail rows` : 'No combat evidence'} />
        <KeyValue label="Disputes / challenges" value={disputeAlerts.length ? `${disputeAlerts.length} alert rows` : 'No disputes'} />
        <KeyValue label="Credit / contracts" value={data.contracts.length ? `${data.contracts.length} contract rows` : 'No credit context'} />
      </div>
      <div className="c-sub" style={{ lineHeight: 1.7, marginTop: 14 }}>
        Killmails are combat evidence, not reputation. Tenant policy decides meaning.
      </div>
    </section>
  );
}

export function ReputationView({ data, live = false, loading = false, error = null, provenance }: Props) {
  const { account } = useProfileCreate();
  const [eveIdentity, setEveIdentity] = useState<EveIdentity | null>(null);
  const [subjectInput, setSubjectInput] = useState('');
  const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
  const identityAddr = subjectOverride ?? account?.address ?? data.pilot.sourceId ?? null;
  const shipKillAttestationCount = data.proofs.filter(
    (proof) => proof.schema === 'SHIP_KILL' && !proof.revoked,
  ).length;

  useEffect(() => {
    if (!identityAddr || identityAddr.length < 64) {
      setEveIdentity(null);
      return;
    }
    fetchEveIdentity(identityAddr)
      .then(setEveIdentity)
      .catch(() => setEveIdentity(null));
  }, [identityAddr]);

  return (
    <>
      <div className="c-view__title" style={{ marginBottom: 8 }}>Trust Dossier</div>
      <div className="c-sub" style={{ marginBottom: 12 }}>
        A trust dossier is evidence and context under tenant policy, not universal truth.
      </div>

      {/* Subject lookup bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input
          className="c-input"
          style={{ flex: 1, fontSize: 12 }}
          placeholder="Look up any wallet address (0x...) — leave blank for your own dossier"
          value={subjectInput}
          onChange={e => setSubjectInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const addr = subjectInput.trim();
              setSubjectOverride(addr.length >= 10 ? addr : null);
            }
          }}
        />
        <button
          className="c-commit"
          style={{ fontSize: 10, padding: '6px 14px' }}
          onClick={() => {
            const addr = subjectInput.trim();
            setSubjectOverride(addr.length >= 10 ? addr : null);
          }}
        >
          LOOKUP
        </button>
        {subjectOverride && (
          <button
            className="c-tab"
            style={{ fontSize: 10 }}
            onClick={() => { setSubjectOverride(null); setSubjectInput(''); }}
          >
            CLEAR
          </button>
        )}
      </div>
      <LiveStatus
        loading={loading}
        live={live}
        error={error}
        provenance={provenance}
        liveText={data.pilot.checkpoint ? `Live dossier / checkpoint ${data.pilot.checkpoint}` : 'Live dossier'}
        emptyText="No dossier subject indexed"
      />

      <SubjectHeader data={data} eveIdentity={eveIdentity} identityAddr={identityAddr} />
      <DecisionCards data={data} />

      <div className="c-rep-grid" style={{ marginTop: 28 }}>
        <div>
          <ScoreSummary data={data} />
          <TierLadder score={data.pilot.score} />
          <VouchSection data={data} />
        </div>
        <div style={{ display: 'grid', gap: 18 }}>
          <ProofSection proofs={data.proofs} />
          <ContextSection data={data} />
        </div>
      </div>

      <CombatEvidencePanel address={identityAddr} shipKillAttestationCount={shipKillAttestationCount} />
    </>
  );
}
