// tx-gate-policy.ts -- Build Smart Gate policy update PTB kind bytes.

import { toBase64 } from '@mysten/bcs';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const CONFIG_KEYS = [
  'VITE_PKG_ID',
  'VITE_GATE_POLICY_ID',
  'VITE_GATE_POLICY_VERSION',
  'VITE_GATE_ADMIN_CAP_ID',
] as const;

type ConfigKey = typeof CONFIG_KEYS[number];

export interface GatePolicyTxConfig {
  pkgId: string;
  gatePolicyId: string;
  gatePolicyVersion: number;
  gateAdminCapId: string;
}

export interface BuildGatePolicyUpdateArgs {
  sender: string;
  allyThreshold: bigint;
  baseTollMist: bigint;
  // Required: tx.object() resolves owned-object version/digest from chain.
  client: ClientWithCoreApi;
}

function env(key: ConfigKey): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key];
}

export function missingGatePolicyConfig(): ConfigKey[] {
  return CONFIG_KEYS.filter(key => !env(key));
}

export function gatePolicyConfigReady(): boolean {
  return missingGatePolicyConfig().length === 0;
}

function requiredEnv(key: ConfigKey): string {
  const value = env(key);
  if (!value) throw new Error(`gate policy tx: missing env var ${key}`);
  return value;
}

export function gatePolicyTxConfig(): GatePolicyTxConfig {
  return {
    pkgId: requiredEnv('VITE_PKG_ID'),
    gatePolicyId: requiredEnv('VITE_GATE_POLICY_ID'),
    gatePolicyVersion: Number(requiredEnv('VITE_GATE_POLICY_VERSION')),
    gateAdminCapId: requiredEnv('VITE_GATE_ADMIN_CAP_ID'),
  };
}

export async function buildGatePolicyUpdateTxKind(
  args: BuildGatePolicyUpdateArgs,
): Promise<string> {
  const config = gatePolicyTxConfig();
  if (!Number.isFinite(config.gatePolicyVersion) || config.gatePolicyVersion <= 0) {
    throw new Error('gate policy tx: VITE_GATE_POLICY_VERSION must be a positive number');
  }

  const tx = new Transaction();
  tx.setSender(args.sender);

  tx.moveCall({
    target: `${config.pkgId}::reputation_gate::update_thresholds`,
    arguments: [
      tx.object(config.gateAdminCapId),
      tx.sharedObjectRef({
        objectId: config.gatePolicyId,
        initialSharedVersion: config.gatePolicyVersion,
        mutable: true,
      }),
      tx.pure.u64(args.allyThreshold),
      tx.pure.u64(args.baseTollMist),
    ],
  });

  const kindBytes = await tx.build({ onlyTransactionKind: true, client: args.client });
  return toBase64(kindBytes);
}
