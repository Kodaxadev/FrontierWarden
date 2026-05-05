import type { TrustAction } from '../../../../types/api.types';

export const DEFAULT_SUBJECT =
  '0x9cc038e5f0045dbf75ce191870fd7c483020d12bc23f3ebaef7a6f4f22d820e1';

export const DEFAULT_GATE =
  '0xb63c9939e28db885392e68537336f85453392ac07d4590c029d1f65938733e36';

export const ACTION_LABELS: Record<TrustAction, string> = {
  gate_access: 'Gate Access',
  counterparty_risk: 'Counterparty Risk',
  bounty_trust: 'Bounty Trust',
};

export interface Preset {
  label: string;
  action: TrustAction;
  subject: string;
  gateId?: string;
  schemaId: string;
  minimumScore?: number;
}

export const PRESETS: Preset[] = [
  {
    label: 'Fixture: Gate Ally Pass',
    action: 'gate_access',
    subject: DEFAULT_SUBJECT,
    gateId: DEFAULT_GATE,
    schemaId: 'TRIBE_STANDING',
  },
  {
    label: 'Fixture: Gate No Standing',
    action: 'gate_access',
    subject: '0x0000000000000000000000000000000000000000000000000000000000000000',
    gateId: DEFAULT_GATE,
    schemaId: 'TRIBE_STANDING',
  },
  {
    label: 'Fixture: Counterparty Risk',
    action: 'counterparty_risk',
    subject: DEFAULT_SUBJECT,
    schemaId: 'TRIBE_STANDING',
    minimumScore: 500,
  },
  {
    label: 'Fixture: Bounty Trust',
    action: 'bounty_trust',
    subject: DEFAULT_SUBJECT,
    schemaId: 'TRIBE_STANDING',
    minimumScore: 500,
  },
];
