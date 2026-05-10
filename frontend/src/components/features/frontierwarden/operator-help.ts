// operator-help.ts — Centralized educational copy for FrontierWarden operator concepts.
//
// Import individual entries into InfoTooltip or OperatorFlowGuide.
//
// Copy discipline:
//   - No enforcement overclaims
//   - BINDING VERIFIED only after indexer confirms extension evidence
//   - Activity windows are indexed time, not authoritative on-chain timestamps
//   - GateAdminCap ≠ OwnerCap<Gate> — separate capability types

export interface HelpConcept {
  term: string;
  body: string;
}

export const HELP = {
  gatePolicy: {
    term: 'GatePolicy',
    body: 'Your FrontierWarden policy object. Defines the schema, ally threshold, and base toll for gate access. Created once per policy domain. Identified by its gatePolicyId on-chain.',
  },
  gateAdminCap: {
    term: 'GateAdminCap',
    body: 'Your FrontierWarden policy authority capability. Proves you own this GatePolicy and can update its parameters. Does NOT give authority over the physical world Gate — that requires OwnerCap<Gate>.',
  },
  ownerCapGate: {
    term: 'OwnerCap<Gate>',
    body: 'The world Gate extension authority capability. Held by the Character that owns the in-game Gate object. Required to authorize the FrontierWardenAuth extension on a world Gate. Separate from GateAdminCap.',
  },
  frontierWardenAuth: {
    term: 'FrontierWardenAuth',
    body: 'The extension witness type authorized on a world Gate using OwnerCap<Gate>. Authorization uses the borrow/authorize/return pattern in a single atomic PTB: borrow_owner_cap → authorize_extension → return_owner_cap.',
  },
  bound: {
    term: 'BOUND',
    body: 'Binding status: GatePolicy has been linked to a world Gate ID on-chain. The policy object points at the Gate, but the FrontierWardenAuth extension is not yet confirmed active. BOUND alone does not enforce passage decisions.',
  },
  bindingVerified: {
    term: 'BINDING VERIFIED',
    body: 'The highest binding status. Requires BOUND plus active FrontierWardenAuth extension evidence confirmed by the indexer on the world Gate. Only shown after the indexer observes both the binding and the extension.',
  },
  worldGate: {
    term: 'World Gate',
    body: 'An in-game EVE Frontier gate object, identified by its on-chain object ID. Each tenant brings their own world Gate — FrontierWarden does not create or control Gates on your behalf.',
  },
  tenant: {
    term: 'Tenant / Operator',
    body: 'An entity that deploys FrontierWarden on their own world Gate. Each tenant brings a Character with OwnerCap<Gate> authority over their Gate. FrontierWarden is multi-tenant — site operators do not control every Gate.',
  },
  sponsoredTx: {
    term: 'Sponsored Transaction',
    body: 'A transaction whose gas fee is paid by the FrontierWarden gas station. You still sign the transaction with your own wallet — the gas station only covers the SUI gas cost.',
  },
  tribeStanding: {
    term: 'TRIBE_STANDING',
    body: 'The default on-chain reputation schema used for gate access decisions. An attestation on this schema is required for passage. The traveler\'s score is compared against the gate\'s ally threshold.',
  },
  ptb: {
    term: 'PTB (Programmable Transaction Block)',
    body: 'The borrow/authorize/return pattern used for extension authorization: (1) borrow_owner_cap<Gate>, (2) authorize_extension<FrontierWardenAuth>, (3) return_owner_cap<Gate>. All three steps execute in a single atomic transaction.',
  },
  activityWindow: {
    term: 'Activity Window',
    body: 'Jump and traffic counts are derived from indexer insertion timestamps, not authoritative on-chain event timestamps. Counts reflect events observed by the indexer within the stated time window.',
  },
  topologyAdvisory: {
    term: 'Topology Advisory',
    body: 'Informational signals from indexed world event state: unbound policy, inactive extension, or offline Gate. Advisory only — these signals do not directly block gate passage or trust evaluation.',
  },
} satisfies Record<string, HelpConcept>;
