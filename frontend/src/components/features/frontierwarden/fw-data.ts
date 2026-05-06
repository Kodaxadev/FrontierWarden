// FrontierWarden — shared fictional data constants (Direction C).
// All values are mock/static for design fidelity.
// IMPORTANT: Every name/id here is prefixed with [DEMO] so it is never mistaken for live data.

import type { GateBindingStatusResponse } from '../../../types/api.types';

export interface FwPilot {
  name: string; handle: string; syndicate: string; syndicateTag: string;
  tribe: string; sec: number; standing: string;
  score: number; scoreDelta: number; walletLux: number; timestamp: string; sessionLat: number;
  sourceId?: string;
  checkpoint?: number | null;
  characterName?: string | null;
}

export interface FwSystem {
  id: string; name: string; heat: 'low' | 'mid' | 'high';
  kills24: number; gates: number; sov: string;
}

export interface FwGate {
  id: string; from: string; to: string;
  status: 'open' | 'camped' | 'toll' | 'closed';
  toll: string; traffic: number; policy: string; updated: string; threat?: string;
  sourceId?: string;
  checkpoint?: number | null;
  binding?: GateBindingStatusResponse;
}

export interface FwPolicy {
  gateId: string;
  allyThreshold: number;
  baseTollMist: number;
  txDigest: string;
  checkpoint: number;
  indexedAt: string;
}

export interface FwKill {
  id: string; t: string; victim: string; ship: string;
  system: string; lux: number; attackers: number;
  hash: string; verified: boolean; friendly?: boolean;
  issuer?: string;
}

export interface FwContract {
  id: string; kind: string; target: string; bounty: string;
  age: string; priority: 'CRIT' | 'HIGH' | 'MED' | 'LOW'; state: string;
  issuer?: string; tx?: string;
}

export interface FwMatrixRow {
  tribe: string; vsObsidian: number; vsCrimson: number;
  vsRen: number; vsHollow: number; vsVoidken: number;
}

export interface FwVouch {
  from: string; weight: number; by: string; ts: string;
  voucherWallet?: string;
  voucheeWallet?: string;
}

export interface FwProof {
  id: string; schema: string; issuer: string; value: number; tx: string; revoked: boolean;
}

export interface FwAlert {
  lvl: 'CRIT' | 'WARN' | 'INFO'; t: string; msg: string;
}

export interface FwData {
  pilot: FwPilot; systems: FwSystem[]; gates: FwGate[];
  policy?: FwPolicy;
  kills: FwKill[]; contracts: FwContract[]; matrix: FwMatrixRow[];
  vouches: FwVouch[]; proofs: FwProof[]; alerts: FwAlert[];
}

export const DEMO_LABEL = '[DEMO] ';

export const FW_DATA: FwData = {
  pilot: {
    name: '[DEMO] Vex Korith', handle: '[DEMO] PILOT#0041',
    syndicate: '[DEMO] Design mockup — not live data', syndicateTag: 'DEMO',
    tribe: '[DEMO] Iron Resonance Compact', sec: 0.42, standing: 'DEMO',
    score: 847, scoreDelta: 14, timestamp: '2026-04-27T07:32:14Z', walletLux: 0, sessionLat: 38,
  },
  systems: [
    { id: 'SYS#A0-7714', name: 'Pochven Halo III', heat: 'high', kills24: 47, gates: 6, sov: 'Iron Resonance' },
    { id: 'SYS#A0-7715', name: 'Vrennir Drift',    heat: 'mid',  kills24: 12, gates: 4, sov: 'Obsidian Veil' },
    { id: 'SYS#A0-7716', name: 'Thelas Reach',     heat: 'low',  kills24: 2,  gates: 3, sov: '— null —' },
    { id: 'SYS#A0-7717', name: 'Karuun Verge',     heat: 'high', kills24: 33, gates: 5, sov: 'Crimson Vanguard' },
    { id: 'SYS#A0-7718', name: 'Mire Anomaly',     heat: 'mid',  kills24: 8,  gates: 2, sov: 'Obsidian Veil' },
  ],
  gates: [
    { id: '[DEMO] GATE#7712', from: '[DEMO] Vrennir Drift', to: '[DEMO] Thelas Reach',  status: 'open',   toll: '0',    traffic: 412, policy: 'PUBLIC',    updated: '2026-04-27T07:31:02Z' },
    { id: '[DEMO] GATE#7714', from: '[DEMO] Pochven Halo',  to: '[DEMO] Karuun Verge',  status: 'camped', toll: '8.5×', traffic: 41,  policy: 'KOS-DENY',  updated: '2026-04-27T07:30:12Z', threat: '[DEMO] Crimson Vanguard ×6' },
    { id: '[DEMO] GATE#7720', from: '[DEMO] Mire Anomaly',  to: '[DEMO] Vrennir Drift', status: 'toll',   toll: '2.0×', traffic: 198, policy: 'NEUTRAL+',  updated: '2026-04-27T07:28:48Z' },
    { id: '[DEMO] GATE#7733', from: '[DEMO] Thelas Reach',  to: '[DEMO] Outer Sigil',   status: 'open',   toll: '0',    traffic: 60,  policy: 'ALLY-FREE', updated: '2026-04-27T07:25:11Z' },
    { id: '[DEMO] GATE#7741', from: '[DEMO] Karuun Verge',  to: '[DEMO] Black Lattice', status: 'closed', toll: '—',    traffic: 0,   policy: 'LOCKDOWN',  updated: '2026-04-27T07:14:00Z' },
  ],
  kills: [
    { id: '[DEMO] KILL#88412', t: '2026-04-27T07:31:48Z', victim: '[DEMO] M. Drev (Crimson Vanguard)', ship: 'Heron · T2',      system: '[DEMO] Pochven Halo III', lux: 412_000_000, attackers: 6, hash: '0x9af2c1…44e8', verified: true },
    { id: '[DEMO] KILL#88411', t: '2026-04-27T07:29:14Z', victim: '[DEMO] B. Thalo (Solo)',            ship: 'Stabber · Faction',system: '[DEMO] Karuun Verge',     lux: 178_400_000, attackers: 1, hash: '0x71b801…0a22', verified: true },
    { id: '[DEMO] KILL#88408', t: '2026-04-27T07:21:02Z', victim: '[DEMO] I. Sorn (Iron Resonance)',   ship: 'Capsule',          system: '[DEMO] Mire Anomaly',     lux: 14_200_000,  attackers: 3, hash: '0x4e90a2…b7f1', verified: true,  friendly: true },
    { id: '[DEMO] KILL#88401', t: '2026-04-27T07:14:33Z', victim: '[DEMO] V. Kaine (Obsidian Veil)',   ship: 'Sabre · T2',       system: '[DEMO] Pochven Halo III', lux: 287_100_000, attackers: 4, hash: '0x2f10c7…e201', verified: false },
    { id: '[DEMO] KILL#88393', t: '2026-04-27T07:08:11Z', victim: '[DEMO] R. Dax (Free Pilot)',        ship: 'Venture',          system: '[DEMO] Thelas Reach',     lux: 3_400_000,   attackers: 1, hash: '0xc8ae12…9930', verified: true },
  ],
  contracts: [
    { id: '[DEMO] CONTRACT#0019', kind: 'BOUNTY',    target: '[DEMO] M. Drev',    bounty: '127.0M', age: '00:14:22', priority: 'HIGH', state: 'OPEN' },
    { id: '[DEMO] CONTRACT#0018', kind: 'ESCORT',    target: '[DEMO] Convoy K-7', bounty: '40.0M',  age: '01:02:11', priority: 'MED',  state: 'CLAIMED' },
    { id: '[DEMO] CONTRACT#0017', kind: 'INTEL',     target: '[DEMO] Karuun ×3',  bounty: '12.5M',  age: '02:48:09', priority: 'LOW',  state: 'OPEN' },
    { id: '[DEMO] CONTRACT#0016', kind: 'BLOOD',     target: '[DEMO] B. Thalo',   bounty: '500.0M', age: '04:11:54', priority: 'CRIT', state: 'OPEN' },
    { id: '[DEMO] CONTRACT#0015', kind: 'GATE-HOLD', target: '[DEMO] GATE#7720',  bounty: '80.0M',  age: '05:30:00', priority: 'MED',  state: 'EXPIRED' },
  ],
  matrix: [
    { tribe: 'Iron Resonance', vsObsidian: 412,  vsCrimson: -812, vsRen: 188, vsHollow: 60,  vsVoidken: -240 },
    { tribe: 'Pact Sentinels', vsObsidian: 220,  vsCrimson: -440, vsRen: 12,  vsHollow: 90,  vsVoidken: -110 },
    { tribe: 'Free Vrennir',   vsObsidian: 80,   vsCrimson: -120, vsRen: 33,  vsHollow: 0,   vsVoidken: -52  },
    { tribe: 'Obsidian Veil',  vsObsidian: 1000, vsCrimson: -990, vsRen: 240, vsHollow: 410, vsVoidken: -380 },
  ],
  vouches: [
    { from: '[DEMO] Iron Resonance Compact', weight: 0.42, by: '[DEMO] PILOT#0014 · K. Renn',  ts: '2026-04-26T18:11:00Z' },
    { from: '[DEMO] Pact Sentinels',         weight: 0.28, by: '[DEMO] PILOT#0202 · J. Vorn',  ts: '2026-04-25T22:04:33Z' },
    { from: '[DEMO] Free Vrennir',           weight: 0.18, by: '[DEMO] PILOT#0091 · L. Soren', ts: '2026-04-24T11:48:09Z' },
    { from: '[DEMO] Obsidian Veil (self)',   weight: 0.12, by: '[DEMO] PILOT#0041 · self',      ts: '2026-04-22T05:00:00Z' },
  ],
  proofs: [
    { id: '[DEMO] ATT#88412', schema: 'SHIP_KILL',      issuer: '[DEMO] 0x9af2...44e8', value: 1,   tx: '0x9af2c1...44e8', revoked: false },
    { id: '[DEMO] ATT#0202',  schema: 'TRIBE_STANDING', issuer: '[DEMO] PILOT#0202',    value: 847, tx: '0x71b801...0a22', revoked: false },
    { id: '[DEMO] ATT#0014',  schema: 'CREDIT',         issuer: '[DEMO] PILOT#0014',    value: 842, tx: '0x4e90a2...b7f1', revoked: false },
  ],
  alerts: [
    { lvl: 'CRIT', t: '07:31:48Z', msg: '[DEMO] Friendly capsule lost — Mire Anomaly · ENT#0231' },
    { lvl: 'WARN', t: '07:30:12Z', msg: '[DEMO] GATE#7714 reports 6 hostiles — Crimson Vanguard fleet' },
    { lvl: 'INFO', t: '07:24:00Z', msg: '[DEMO] Vouch attestation received from PILOT#0202' },
  ],
};

// Reputation score sparkline data (30-day trend)
export const REP_SPARK = [770,778,772,790,810,805,820,815,830,820,825,818,830,840,835,845,847];
