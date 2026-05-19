// FrontierWarden — shared data types and default empty state.

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
  id: string;
  t: string;
  /** Display name for the victim (character name or shortened address). */
  victim: string;
  /** Raw wallet address of the victim, if a character name was resolved. */
  victimWallet?: string;
  /** Tribe/corp name of the victim. */
  victimCorp?: string;
  /** Display name for the killer (native kill mails only). */
  killer?: string;
  /** Shortened killer wallet address, if killer name was resolved. */
  killerWallet?: string;
  /** Tribe/corp name of the killer. */
  killerCorp?: string;
  /** Solar system name. */
  system: string;
  /** Loss type string from native kill data (ship class etc). */
  lossType?: string;
  // Legacy / attestation-sourced fields.
  ship: string;
  lux: number;
  attackers: number;
  hash: string;
  verified: boolean;
  friendly?: boolean;
  issuer?: string;
  /** True when a SHIP_KILL attestation exists for the same victim. */
  attested?: boolean;
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

/** Empty default state — shown briefly before first data fetch completes. */
export const FW_DATA: FwData = {
  pilot: {
    name: '', handle: '', syndicate: '', syndicateTag: '',
    tribe: '', sec: 0, standing: '',
    score: 0, scoreDelta: 0, timestamp: '', walletLux: 0, sessionLat: 0,
  },
  systems: [],
  gates: [],
  kills: [],
  contracts: [],
  matrix: [],
  vouches: [],
  proofs: [],
  alerts: [],
};

/** @deprecated Stub kept for legacy ReputationDossier import. */
export const REP_SPARK: number[] = [];
