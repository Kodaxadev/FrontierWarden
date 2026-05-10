// OperatorFlowGuide — collapsible 5-step operator onboarding guide.
//
// Rendered as a <details> element so it takes minimal space when collapsed.
// Advisory copy only: no enforcement overclaims, no exact traffic numbers.
// Multi-tenant invariant: each tenant brings their own Gate authority.

const STEPS = [
  {
    title: 'Provision GatePolicy',
    body: 'Create your FrontierWarden GatePolicy object. This mints a GateAdminCap — your FrontierWarden policy authority. Set schema ID, ally threshold, and base toll. One policy per domain.',
  },
  {
    title: 'Connect World Gate Authority',
    body: 'Connect the wallet holding OwnerCap<Gate> for your in-game Gate. This is separate from the GateAdminCap wallet — it proves ownership of the world Gate object itself.',
  },
  {
    title: 'Bind Policy to World Gate',
    body: 'Link your GatePolicy to the world Gate ID using GateAdminCap. Binding status becomes BOUND. This records the association on-chain but does not yet enforce passage decisions.',
  },
  {
    title: 'Authorize FrontierWardenAuth Extension',
    body: 'Authorize the extension on the world Gate using OwnerCap<Gate>. PTB: borrow_owner_cap → authorize_extension → return_owner_cap. Status becomes BINDING VERIFIED once the indexer confirms extension evidence.',
  },
  {
    title: 'Monitor via Gate Intel',
    body: 'Use Gate Intel to view passage events, topology status, and world gate traffic. Trust Decision Console evaluates access decisions from indexed on-chain proof.',
  },
];

export function OperatorFlowGuide() {
  return (
    <details style={{ marginBottom: 16 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 10,
          color: 'var(--c-mid)',
          fontFamily: 'var(--c-mono)',
          letterSpacing: '0.04em',
          listStyle: 'none',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ color: 'var(--c-lo)' }}>▸</span>
        HOW THIS FLOW WORKS
      </summary>

      <div style={{
        marginTop: 10,
        padding: '12px 16px',
        border: '1px solid var(--c-border)',
        background: 'rgba(255,255,255,0.012)',
      }}>
        <div className="c-stat__label" style={{ marginBottom: 12 }}>Operator Setup Flow</div>

        {STEPS.map((step, i) => (
          <div key={i} style={{ marginBottom: i < STEPS.length - 1 ? 12 : 0 }}>
            <div style={{
              fontSize: 10,
              color: 'var(--c-hi)',
              fontFamily: 'var(--c-mono)',
              marginBottom: 3,
            }}>
              {i + 1}. {step.title}
            </div>
            <div className="c-sub" style={{ paddingLeft: 14 }}>
              {step.body}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 12, fontSize: 9, color: 'var(--c-lo)', letterSpacing: '0.04em' }}>
          Each tenant brings their own Character with OwnerCap&lt;Gate&gt; authority.
          FrontierWarden is multi-tenant — site operators do not control every Gate.
        </div>
      </div>
    </details>
  );
}
