// TenantCombatPolicyPanel — read-only shell for tenant-scoped combat policy configuration.
//
// Phase 1 of 5 (TENANT_COMBAT_POLICY_DESIGN.md):
//   Config UI shell — shows proposed rule types and explains the model.
//   No backend storage, no evaluator integration, no active effects.
//   All inputs are disabled. "Save" is disabled with a tooltip.

// ── Proposed rule definitions (design preview — not evaluated) ────────────────

interface PolicyRulePreview {
  name:                string;
  signal:              string;
  threshold:           string;
  window_days:         string;
  relationship_context: string;
  action:              string;
  explainability_text: string;
}

const PROPOSED_RULES: PolicyRulePreview[] = [
  {
    name:                  'High Recent Loss Activity',
    signal:                'recent_losses',
    threshold:             '3',
    window_days:           '7',
    relationship_context:  'any',
    action:                'advisory_flag',
    explainability_text:   'This pilot had 3+ losses in the last 7 days. Context for collateral review, not a reputation change.',
  },
  {
    name:                  'Kills Against Allied Tribe',
    signal:                'recent_kills',
    threshold:             '1',
    window_days:           '30',
    relationship_context:  'ally',
    action:                'advisory_flag',
    explainability_text:   'This pilot has kills against registered ally tribe members. Review before extending credit or gate access.',
  },
  {
    name:                  'Kills Against Tenant Enemies',
    signal:                'recent_kills',
    threshold:             '1',
    window_days:           '30',
    relationship_context:  'enemy',
    action:                'advisory_flag',
    explainability_text:   'This pilot has confirmed kills against registered enemy entities. May be positive context for this tenant.',
  },
  {
    name:                  'High Loss — Manual Credit Review',
    signal:                'recent_losses',
    threshold:             '5',
    window_days:           '14',
    relationship_context:  'any',
    action:                'manual_review',
    explainability_text:   'High loss activity flagged for manual lending review. Do not approve credit automatically.',
  },
  {
    name:                  'Require SHIP_KILL Attestation',
    signal:                'ship_kill_attested',
    threshold:             '0',
    window_days:           '—',
    relationship_context:  'any',
    action:                'require_attestation',
    explainability_text:   'No SHIP_KILL oracle attestation found. Score impact requires oracle verification before it can be applied.',
  },
];

const ACTION_LABELS: Record<string, string> = {
  advisory_flag:        'Advisory Flag · dossier only',
  manual_review:        'Manual Review · route to queue',
  require_attestation:  'Require Attestation · block until oracle verifies',
  future_score_modifier:'Score Modifier · Phase 5, not yet available',
};

const SIGNAL_LABELS: Record<string, string> = {
  recent_losses:         'Recent Losses',
  recent_kills:          'Recent Kills',
  kill_loss_ratio:       'Kill / Loss Ratio',
  combat_heavy_profile:  'Combat-Heavy Profile',
  ship_kill_attested:    'SHIP_KILL Attested Count',
  no_combat_evidence:    'No Combat Evidence',
};

// ── Rule card ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, index }: { rule: PolicyRulePreview; index: number }) {
  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--c-border)',
    color: 'var(--c-lo)',
    fontSize: 11,
    padding: '4px 8px',
    width: '100%',
    borderRadius: 2,
    cursor: 'not-allowed',
  };

  return (
    <div style={{
      padding: '16px 18px',
      border: '1px solid var(--c-border)',
      marginBottom: 12,
      opacity: 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: 'var(--c-lo)', minWidth: 20 }}>#{index + 1}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-mid)' }}>{rule.name}</span>
        <span style={{
          marginLeft: 'auto', fontSize: 9, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--c-amber)',
          padding: '2px 6px', border: '1px solid rgba(245,158,11,0.3)',
        }}>
          {ACTION_LABELS[rule.action] ?? rule.action}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--c-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Signal</div>
          <input style={inp} disabled value={SIGNAL_LABELS[rule.signal] ?? rule.signal} readOnly />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--c-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Threshold</div>
          <input style={inp} disabled value={rule.threshold} readOnly />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--c-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Window (days)</div>
          <input style={inp} disabled value={rule.window_days} readOnly />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--c-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Relationship</div>
          <input style={inp} disabled value={rule.relationship_context} readOnly />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, color: 'var(--c-lo)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Explainability text (shown to operator when rule fires)</div>
        <textarea
          style={{ ...inp, resize: 'none', height: 44, lineHeight: 1.5 }}
          disabled
          value={rule.explainability_text}
          readOnly
        />
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function TenantCombatPolicyPanel() {
  return (
    <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid var(--c-border)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <div className="c-view__title">Tenant Combat Policy</div>
        <span style={{
          fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--c-amber)', padding: '2px 7px',
          border: '1px solid rgba(245,158,11,0.35)',
        }}>
          Design Preview · Phase 1 of 5 · Not Active
        </span>
      </div>

      {/* Model explanation */}
      <div style={{
        fontSize: 11, color: 'var(--c-mid)', lineHeight: 1.7,
        padding: '12px 0 20px', borderBottom: '1px solid var(--c-border)', marginBottom: 24,
      }}>
        Combat policy rules are <strong style={{ color: 'var(--c-hi)' }}>tenant-scoped</strong> — rules you configure here apply only to your operator context.
        They produce <strong style={{ color: 'var(--c-hi)' }}>advisory flags or review routes</strong>, not automatic score changes.{' '}
        No kill mail, kill count, or loss count will change a reputation score, loan cap, or gate access decision without explicit policy and oracle attestation.{' '}
        Credit and access decisions must use explicit policy or attestations.
        <br /><br />
        <span style={{ color: 'var(--c-lo)' }}>
          Backend storage and evaluator integration are Phase 2–3. These rules are shown for design review only.
          See <code>Documents/TENANT_COMBAT_POLICY_DESIGN.md</code> for the full implementation sequence.
        </span>
      </div>

      {/* Rule cards */}
      <div style={{ marginBottom: 24 }}>
        <div className="c-stat__label" style={{ marginBottom: 14 }}>
          Proposed Rules · {PROPOSED_RULES.length} examples · all disabled
        </div>
        {PROPOSED_RULES.map((rule, i) => (
          <RuleCard key={rule.name} rule={rule} index={i} />
        ))}
      </div>

      {/* Save button — disabled, not yet wired */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="c-commit"
          disabled
          style={{ opacity: 0.35, cursor: 'not-allowed' }}
          title="Combat policy storage is Phase 2 — not yet wired to backend"
        >
          SAVE RULES
        </button>
        <span style={{ fontSize: 10, color: 'var(--c-lo)' }}>
          Rule storage requires Phase 2 (backend) · evaluator integration requires Phase 3.
          No effects are applied until both are complete and rules are explicitly enabled.
        </span>
      </div>

    </div>
  );
}
