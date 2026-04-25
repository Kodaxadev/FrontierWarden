import type { NetworkConfig } from './network';

export interface Addresses {
  PACKAGE: string;
  SCHEMA_REGISTRY: string;
  ORACLE_REGISTRY: string;
}

export const TEST_ADDRESSES: Addresses = {
  // These must be updated after running scripts/deploy.sh
  PACKAGE: '0xREPLACE_WITH_DEPLOYED_ADDRESS',
  SCHEMA_REGISTRY: '0xREPLACE_AFTER_SHARE_OBJECT',
  ORACLE_REGISTRY: '0xREPLACE_AFTER_SHARE_OBJECT',
};

export function validateAddresses(addrs: Addresses): void {
  const missing = Object.entries(addrs)
    .filter(([, v]) => v.startsWith('0xREPLACE'))
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `[IntegrationConfig] Missing address configuration: ${missing.join(', ')}. ` +
      'Run scripts/deploy.sh and update scripts/testnet-addresses.json first.'
    );
  }
}

export const SCHEMAS = {
  PIRATE_INDEX_V1: 'PIRATE_INDEX_V1',
  CREDIT: 'CREDIT',
  COMBAT_SCORE: 'COMBAT_SCORE',
  GOV_SCORE: 'GOV_SCORE',
  BUILDER_SCORE: 'BUILDER_SCORE',
} as const;

export const ORACLES = {
  EF_MAP: '0xEfMapOracleAddress000000000000000000',
  TRIBAL_ORACLE: '0xTribalOracleAddress0000000000000000',
} as const;

export const CONSTANTS = {
  MIN_STAKE_MIST: 1_000_000_000n,  // 1 SUI
  MIN_VOUCHER_SCORE: 500,
  MIN_CREDIT_FOR_LOAN: 300,
  MAX_LOAN_MULTIPLIER: 5,
  VOUCH_DURATION_EPOCHS: 30,
  LOAN_DURATION_EPOCHS: 30,
  CHALLENGE_WINDOW_EPOCHS: 7,
  SLASH_PERCENTAGE: 10,
  CHALLENGER_REWARD: 50,
} as const;