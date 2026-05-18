import { useOperatorGateAuthority } from '../../../hooks/useOperatorGateAuthority';
import { useOperatorGatePolicies } from '../../../hooks/useOperatorGatePolicies';
import { SUI_NETWORK, networkTitle } from '../../../lib/network';
import type { EveIdentity } from '../../../types/api.types';
import type { FwData } from './fw-data';
import { useOperatorSessionContext } from './OperatorSessionGate';

export type OperatorTone = 'good' | 'warn' | 'bad' | 'idle';

export interface OperatorContextItem {
  label: string;
  value: string;
  action?: string;
  protocol?: string;
  tone?: OperatorTone;
}

export interface OperatorContextSignals {
  walletAddress: string | null;
  walletLabel: string;
  walletConnected: boolean;
  characterName: string | null;
  characterResolved: boolean;
  tenantName: string | null;
  tenantResolved: boolean;
  environmentLabel: string;
  sessionSigned: boolean;
  sessionLegacy: boolean;
  sessionStatus: string;
  sessionAction?: string;
  policyAuthority: OperatorContextItem;
  worldGateAuthority: OperatorContextItem;
  extensionAuthorization: OperatorContextItem;
  trustListCount: number;
  previewReady: boolean;
  items: OperatorContextItem[];
}

function short(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function getEnvironmentLabel(): string {
  const network = networkTitle(SUI_NETWORK);
  return SUI_NETWORK === 'testnet' ? `Stillness / ${network}` : network;
}

function sessionItem(
  state: ReturnType<typeof useOperatorSessionContext>['state'],
  isAuthenticated: boolean,
): OperatorContextItem {
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
): OperatorContextItem {
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
): OperatorContextItem {
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

function extensionItem(data: FwData): OperatorContextItem {
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

export function useOperatorContextSignals(
  data: FwData,
  eveIdentity: EveIdentity | null,
): OperatorContextSignals {
  const { isAuthenticated, state } = useOperatorSessionContext();
  const policyAuthorityState = useOperatorGatePolicies();
  const gateAuthorityState = useOperatorGateAuthority();
  const walletAddress = state.accountAddress ?? state.address;
  const characterName = eveIdentity?.character_name ?? gateAuthorityState.characterName;
  const tenantName = eveIdentity?.tenant ?? eveIdentity?.tribe_name;
  const hasWallet = Boolean(walletAddress);
  const session = sessionItem(state, isAuthenticated);
  const policyAuthority = policyAuthorityItem(hasWallet, policyAuthorityState);
  const worldGateAuthority = worldGateItem(hasWallet, gateAuthorityState);
  const extensionAuthorization = extensionItem(data);
  const trustListCount = data.vouches.length + data.proofs.length;
  const previewReady = trustListCount > 0 || data.gates.some((gate) => Boolean(gate.binding));

  const items: OperatorContextItem[] = [
    {
      label: 'Wallet',
      value: short(walletAddress) ?? 'No wallet connected',
      action: walletAddress ? undefined : 'Connect wallet',
      tone: walletAddress ? 'good' : 'idle',
    },
    {
      label: 'Character',
      value: characterName ?? 'Character not resolved',
      action: characterName ? undefined : 'Resolve character',
      tone: characterName ? 'good' : 'warn',
    },
    {
      label: 'Tenant',
      value: tenantName ?? 'No trust domain selected',
      action: tenantName ? undefined : 'Continue onboarding',
      tone: tenantName ? 'good' : 'warn',
    },
    { label: 'Environment', value: getEnvironmentLabel(), tone: 'idle' },
    session,
    policyAuthority,
    worldGateAuthority,
    extensionAuthorization,
  ];

  return {
    walletAddress,
    walletLabel: short(walletAddress) ?? 'No wallet connected',
    walletConnected: hasWallet,
    characterName: characterName ?? null,
    characterResolved: Boolean(characterName),
    tenantName: tenantName ?? null,
    tenantResolved: Boolean(tenantName),
    environmentLabel: getEnvironmentLabel(),
    sessionSigned: isAuthenticated && !state.isLegacySession,
    sessionLegacy: isAuthenticated && state.isLegacySession,
    sessionStatus: session.value,
    sessionAction: session.action,
    policyAuthority,
    worldGateAuthority,
    extensionAuthorization,
    trustListCount,
    previewReady,
    items,
  };
}
