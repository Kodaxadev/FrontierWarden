import { useOperatorGateAuthority } from '../../../hooks/useOperatorGateAuthority';
import { useOperatorGatePolicies } from '../../../hooks/useOperatorGatePolicies';
import { SUI_NETWORK, networkTitle } from '../../../lib/network';
import type { EveIdentity } from '../../../types/api.types';
import type { FwData } from './fw-data';
import { useOperatorSessionContext } from './OperatorSessionGate';

interface OperatorContextBarProps {
  data: FwData;
  eveIdentity: EveIdentity | null;
}

type Tone = 'good' | 'warn' | 'bad' | 'idle';

interface ContextItem {
  label: string;
  value: string;
  action?: string;
  protocol?: string;
  tone?: Tone;
}

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--c-green, #5ee28a)',
  warn: 'var(--c-amber, #f59e0b)',
  bad: 'var(--c-crimson, #ff5568)',
  idle: 'var(--c-mid)',
};

function short(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function environmentLabel(): string {
  const network = networkTitle(SUI_NETWORK);
  return SUI_NETWORK === 'testnet' ? `Stillness / ${network}` : network;
}

function sessionItem(
  state: ReturnType<typeof useOperatorSessionContext>['state'],
  isAuthenticated: boolean,
): ContextItem {
  if (isAuthenticated && state.isLegacySession) {
    return { label: 'Session', value: 'Legacy session', action: 'Re-sign session', tone: 'warn' };
  }
  if (isAuthenticated) {
    return { label: 'Session', value: 'Signed', tone: 'good' };
  }
  if (state.status === 'signing') {
    return { label: 'Session', value: 'Signing', action: 'Approve wallet signature', tone: 'warn' };
  }
  if (state.accountAddress) {
    return { label: 'Session', value: 'Missing', action: 'Sign session', tone: 'warn' };
  }
  return { label: 'Session', value: 'No wallet', action: 'Connect wallet', tone: 'idle' };
}

function policyAuthorityItem(
  hasWallet: boolean,
  policyAuthority: ReturnType<typeof useOperatorGatePolicies>,
): ContextItem {
  const base = { label: 'Policy authority', protocol: 'GateAdminCap' };
  if (!hasWallet) return { ...base, value: 'Not checked', action: 'Connect wallet', tone: 'idle' };
  if (policyAuthority.loading) return { ...base, value: 'Checking', tone: 'warn' };
  if (policyAuthority.error) return { ...base, value: 'Query failed', action: 'Open Policy', tone: 'bad' };
  if (policyAuthority.hasAny) return { ...base, value: 'Found', tone: 'good' };
  return { ...base, value: 'Missing', action: 'Open Policy', tone: 'warn' };
}

function worldGateItem(
  hasWallet: boolean,
  gateAuthority: ReturnType<typeof useOperatorGateAuthority>,
): ContextItem {
  const base = { label: 'World gate ownership', protocol: 'OwnerCap<Gate>' };
  if (!hasWallet) return { ...base, value: 'Not checked', action: 'Connect wallet', tone: 'idle' };
  if (gateAuthority.isLoading) return { ...base, value: 'Checking', tone: 'warn' };
  if (gateAuthority.status === 'query_failed') {
    return { ...base, value: 'Query failed', action: 'Open Gate Operations', tone: 'bad' };
  }
  if (gateAuthority.ownerCaps.length > 0) return { ...base, value: 'Found', tone: 'good' };
  if (gateAuthority.status === 'no_character') {
    return { ...base, value: 'No character', action: 'Resolve character', tone: 'warn' };
  }
  return { ...base, value: 'Missing', action: 'Open Gate Operations', tone: 'warn' };
}

function extensionItem(data: FwData): ContextItem {
  const bindings = data.gates.map((gate) => gate.binding).filter(Boolean);
  const verified = bindings.some((binding) =>
    binding?.bindingStatus === 'verified' || binding?.fwExtensionActive,
  );
  const boundOnly = bindings.some((binding) => binding?.bindingStatus === 'bound');
  const base = { label: 'Extension authorization', protocol: 'FrontierWardenAuth' };

  if (verified) return { ...base, value: 'Verified', tone: 'good' };
  if (boundOnly) {
    return { ...base, value: 'Bound, not verified', action: 'Open Gate Operations', tone: 'warn' };
  }
  return { ...base, value: 'Missing', action: 'Open Gate Operations', tone: 'warn' };
}

function ContextCell({ item }: { item: ContextItem }) {
  return (
    <div style={{
      borderRight: '1px solid var(--c-border)',
      display: 'grid',
      gap: 4,
      minWidth: 150,
      padding: '10px 14px',
    }}>
      <span className="c-sub" style={{ fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase' }}>
        {item.protocol ? (
          <abbr title={item.protocol} style={{ textDecoration: 'none' }}>{item.label}</abbr>
        ) : item.label}
      </span>
      <span style={{ color: TONE_COLOR[item.tone ?? 'idle'], fontSize: 13, fontWeight: 700 }}>
        {item.value}
      </span>
      {item.action && (
        <span className="c-sub" style={{ fontSize: 11 }}>
          Next: {item.action}
        </span>
      )}
    </div>
  );
}

export function OperatorContextBar({ data, eveIdentity }: OperatorContextBarProps) {
  const { isAuthenticated, state } = useOperatorSessionContext();
  const policyAuthority = useOperatorGatePolicies();
  const gateAuthority = useOperatorGateAuthority();
  const wallet = state.accountAddress ?? state.address;
  const character = eveIdentity?.character_name ?? gateAuthority.characterName;
  const tenant = eveIdentity?.tenant ?? eveIdentity?.tribe_name;
  const hasWallet = Boolean(wallet);
  const items: ContextItem[] = [
    {
      label: 'Wallet',
      value: short(wallet) ?? 'No wallet connected',
      action: wallet ? undefined : 'Connect wallet',
      tone: wallet ? 'good' : 'idle',
    },
    {
      label: 'Character',
      value: character ?? 'Character not resolved',
      action: character ? undefined : 'Resolve character',
      tone: character ? 'good' : 'warn',
    },
    {
      label: 'Tenant',
      value: tenant ?? 'No trust domain selected',
      action: tenant ? undefined : 'Continue onboarding',
      tone: tenant ? 'good' : 'warn',
    },
    { label: 'Environment', value: environmentLabel(), tone: 'idle' },
    sessionItem(state, isAuthenticated),
    policyAuthorityItem(hasWallet, policyAuthority),
    worldGateItem(hasWallet, gateAuthority),
    extensionItem(data),
  ];

  return (
    <section
      aria-label="Operator context"
      style={{
        borderBottom: '1px solid var(--c-border)',
        display: 'flex',
        flexWrap: 'wrap',
        margin: '0 0 18px',
        background: 'rgba(255,255,255,0.012)',
      }}
    >
      {items.map((item) => (
        <ContextCell key={`${item.label}:${item.value}`} item={item} />
      ))}
    </section>
  );
}
