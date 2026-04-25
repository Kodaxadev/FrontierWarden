// EVE Frontier Reputation Protocol - Integration Test Configuration
// Deployed to Sui Devnet: 2026-04-25 (chain e8118007)

export const TEST_ADDRESSES = {
  PACKAGE: '0x11a3f8dd19c2e55c29a3bb3faa2db5451e2c55fc0e83bcff86ed4726adb47e37',
  SCHEMA_REGISTRY: '0x5d3bebd993bb471764621bcc736be6799d5ce979f53134e9046f185508b301aa',
  ORACLE_REGISTRY: '0x0be66c40d272f7e69aa0fe2076938e86905167cf95300c7e0c3ab83a77f393ab',
} as const;

export const SCHEMAS = {
  PIRATE_INDEX_V1: JSON.stringify({
    schema_id: 'pirate_index_v1',
    game: 'eve_frontier',
    fields: ['character_id', 'sec_status', 'kill_rights', 'corp_history'],
    version: 1,
  }),
  CREDIT: JSON.stringify({ schema_id: 'credit', version: 1 }),
  COMBAT_SCORE: JSON.stringify({ schema_id: 'combat_score', version: 1 }),
  GOV_SCORE: JSON.stringify({ schema_id: 'gov_score', version: 1 }),
} as const;

export const CONSTANTS = {
  MIN_STAKE_MIST: 10_000_000_000n, // 10 SUI in MIST
  MIN_SCORE: 500,
  LENDING_COLLATERAL_RATIO: 200, // 200%
  SLASH_PENALTY_PERCENT: 50,
  EPOCHS_UNTIL_DEFAULT: 30,
} as const;

export function validateAddresses(addrs: typeof TEST_ADDRESSES): void {
  const required = ['PACKAGE', 'SCHEMA_REGISTRY', 'ORACLE_REGISTRY'] as const;
  for (const key of required) {
    if (!addrs[key] || addrs[key].length !== 66) {
      throw new Error(`Missing or invalid address: ${key}`);
    }
  }
  console.log('[CONFIG] Addresses validated:', JSON.stringify(addrs, null, 2));
}