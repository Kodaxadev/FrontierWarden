import type { OperatorContextSignals, OperatorTone } from './operator-context-signals';

type NavTarget = 'gates' | 'policy' | 'social' | 'trust';

interface OnboardingWizardShellProps {
  signals: OperatorContextSignals;
  onNavigate: (target: NavTarget) => void;
}

interface Step {
  id: string;
  label: string;
  status: string;
  tone: OperatorTone;
  why: string;
  next: string;
  help: string;
  detail?: string;
  target?: NavTarget;
  targetLabel?: string;
}

const TONE_COLOR: Record<OperatorTone, string> = {
  good: 'var(--c-green, #5ee28a)',
  warn: 'var(--c-amber, #f59e0b)',
  bad: 'var(--c-crimson, #ff5568)',
  idle: 'var(--c-mid)',
};

function toneLabel(tone: OperatorTone): string {
  if (tone === 'good') return 'Ready';
  if (tone === 'bad') return 'Needs recovery';
  if (tone === 'warn') return 'Needs action';
  return 'Waiting';
}

function stepFromTone(
  label: string,
  status: string,
  tone: OperatorTone | undefined,
  why: string,
  next: string,
  help: string,
  options: Pick<Step, 'detail' | 'target' | 'targetLabel'> = {},
): Step {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    status,
    tone: tone ?? 'idle',
    why,
    next,
    help,
    ...options,
  };
}

function buildSteps(signals: OperatorContextSignals): Step[] {
  return [
    stepFromTone(
      'Wallet',
      signals.walletLabel,
      signals.walletConnected ? 'good' : 'idle',
      'FrontierWarden needs a connected operator wallet before it can identify authority or sign actions.',
      signals.walletConnected ? 'Wallet is connected.' : 'Connect wallet.',
      'Use the wallet control in the top session strip. No transactions are issued by this wizard.',
    ),
    stepFromTone(
      'Character',
      signals.characterName ?? 'Character not resolved',
      signals.characterResolved ? 'good' : 'warn',
      'Operators need an EVE character so decisions are readable by people, not just wallet addresses.',
      signals.characterResolved ? 'Character is resolved.' : 'Resolve character.',
      'If the character is missing, confirm the wallet is the one used for your EVE identity.',
    ),
    stepFromTone(
      'Session',
      signals.sessionStatus,
      signals.sessionSigned ? 'good' : signals.sessionLegacy ? 'warn' : 'warn',
      'A signed operator session lets the app call protected operator APIs without asking every panel to re-authenticate.',
      signals.sessionAction ?? 'Session is signed.',
      'Legacy or missing sessions should be re-signed from the session strip before operating policy tools.',
    ),
    stepFromTone(
      'Tenant',
      signals.tenantName ?? 'No trust domain selected',
      signals.tenantResolved ? 'good' : 'warn',
      'The tenant trust domain decides how evidence becomes a trust decision.',
      signals.tenantResolved ? 'Use the resolved tenant as the suggested active domain.' : 'Continue setup.',
      'Trust domain persistence comes in a later phase.',
      { detail: signals.tenantName ? `Suggested active domain: ${signals.tenantName}` : undefined },
    ),
    stepFromTone(
      'Authority',
      `${signals.policyAuthority.value} / ${signals.worldGateAuthority.value} / ${signals.extensionAuthorization.value}`,
      [signals.policyAuthority, signals.worldGateAuthority, signals.extensionAuthorization]
        .every((item) => item.tone === 'good') ? 'good' : 'warn',
      'Policy authority, world gate ownership, and extension authorization are separate powers.',
      'Open Policy or Gate Operations for missing authority.',
      'BOUND is not BINDING VERIFIED; site owner is not universal gate owner.',
      { target: 'gates', targetLabel: 'Open Gate Operations' },
    ),
    stepFromTone(
      'Trust List',
      signals.trustListCount > 0 ? `${signals.trustListCount} existing trust signals` : 'Read-only setup guidance',
      signals.trustListCount > 0 ? 'good' : 'idle',
      'A first tenant trust list will later separate trusted and blocked pilots before policy decisions run.',
      signals.trustListCount > 0
        ? 'Review existing Social and Vouch evidence.'
        : 'Evaluate a pilot in Check Trust, then review Social and Vouch evidence before importing trust lists.',
      'Waiting means no tenant trust-list entries are indexed yet; this is not a failed prerequisite. Manual trusted/blocked pilot import belongs to a later implementation phase.',
      {
        target: signals.trustListCount > 0 ? 'social' : 'trust',
        targetLabel: signals.trustListCount > 0 ? 'Open Social' : 'Open Check Trust',
      },
    ),
    stepFromTone(
      'Preview',
      signals.previewReady ? 'Preview inputs available' : 'Preview not configured',
      signals.previewReady ? 'good' : 'idle',
      'A proof-backed preview should explain the evidence behind a decision before operators enforce it.',
      'Open Trust Console to inspect the current decision surface.',
      'No evaluator behavior changes here; this is guidance around the existing trust flow.',
      { target: 'trust', targetLabel: 'Open Trust Console' },
    ),
  ];
}

function StepRail({ steps }: { steps: Step[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {steps.map((step, index) => (
        <a
          key={step.id}
          href={`#${step.id}`}
          style={{
            border: '1px solid var(--c-border)',
            color: 'var(--c-text)',
            display: 'grid',
            gap: 4,
            padding: '10px 12px',
            textDecoration: 'none',
          }}
        >
          <span className="c-sub" style={{ fontSize: 10 }}>
            {String(index + 1).padStart(2, '0')} / {toneLabel(step.tone)}
          </span>
          <strong style={{ color: TONE_COLOR[step.tone], fontSize: 13 }}>{step.label}</strong>
        </a>
      ))}
    </div>
  );
}

function StepCard({ step, onNavigate }: { step: Step; onNavigate: (target: NavTarget) => void }) {
  return (
    <section
      id={step.id}
      style={{
        border: '1px solid var(--c-border)',
        display: 'grid',
        gap: 12,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{step.label}</h2>
        <span style={{ color: TONE_COLOR[step.tone], fontSize: 12, fontWeight: 700 }}>
          {step.status}
        </span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Why it matters</span>
        <span className="c-kv__v">{step.why}</span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Next action</span>
        <span className="c-kv__v">{step.next}</span>
      </div>
      <div className="c-kv">
        <span className="c-kv__k">Recovery</span>
        <span className="c-kv__v">{step.help}</span>
      </div>
      {step.detail && (
        <div className="c-sub" style={{ fontSize: 12 }}>{step.detail}</div>
      )}
      {step.target && (
        <div>
          <button className="c-filter" onClick={() => onNavigate(step.target as NavTarget)}>
            {step.targetLabel ?? 'Open existing surface'}
          </button>
        </div>
      )}
    </section>
  );
}

export function OnboardingWizardShell({ signals, onNavigate }: OnboardingWizardShellProps) {
  const steps = buildSteps(signals);
  const completed = steps.filter(s => s.tone === 'good').length;
  const total = steps.length;
  const pct = Math.round((completed / total) * 100);

  return (
    <>
      <div className="c-view__title">Operator Onboarding</div>
      <div className="c-sub" style={{ marginTop: -16, marginBottom: 16 }}>
        A read-only setup guide for wallet, identity, tenant context, authority, trust list, and first decision preview.
      </div>

      {/* Progress bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, padding: '12px 16px',
        border: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.012)',
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: completed === total ? 'var(--c-green, #5ee28a)' : 'var(--c-amber)', letterSpacing: '-0.02em' }}>
          {completed}/{total}
        </span>
        <div style={{ flex: 1, height: 6, background: 'var(--c-lo)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${pct}%`,
            background: completed === total ? 'var(--c-green, #5ee28a)' : 'var(--c-amber)',
            transition: 'width 0.3s',
            boxShadow: completed === total ? '0 0 8px rgba(94,226,138,0.4)' : '0 0 8px rgba(232,120,42,0.3)',
          }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--c-mid)', letterSpacing: '0.04em' }}>
          {completed === total ? 'ALL STEPS COMPLETE' : `${pct}% SETUP`}
        </span>
      </div>
      <div style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        alignItems: 'start',
      }}>
        <StepRail steps={steps} />
        <div style={{ display: 'grid', gap: 16 }}>
          {steps.map((step) => (
            <StepCard key={step.id} step={step} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </>
  );
}
