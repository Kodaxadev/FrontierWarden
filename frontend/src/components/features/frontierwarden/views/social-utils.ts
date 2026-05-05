export const ORACLE_REGISTRY_ADMIN =
  '0xcfcf2247346d7a0676e2018168f94b86e1d1263fd3afd6862685725c8c49db8f';

export const shortId = (v: string) => v.length <= 14 ? v : `${v.slice(0, 6)}...${v.slice(-4)}`;

export const formatSui = (mist: number) => `${(mist / 1e9).toFixed(3)} SUI`;

export const addrValid = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

export const objValid = (s: string) => /^0x[0-9a-fA-F]{1,64}$/.test(s);
