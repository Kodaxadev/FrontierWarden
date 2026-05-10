// useBindOperatorWorldGate -- Sponsored bind_world_gate transaction hook
// for tenant/operator policy binding.
//
// Unlike useBindWorldGate (which is tied to a single hardcoded env-configured
// GatePolicy), this hook accepts all object IDs as runtime parameters so
// any tenant can bind their own policy.
//
// Authority boundary:
//   tx.setSender = operator address, so tx_context::sender(ctx) in Move
//   resolves to the operator. Gas station pays gas but never becomes
//   policy authority.
//
// This does NOT call authorize_extension, does NOT borrow OwnerCap<Gate>,
// and does NOT claim BINDING VERIFIED.

import { useCallback, useState } from 'react';
import { fetchGateBindingStatus } from '../lib/api';
import {
  buildBindOperatorGateTxKind,
  bindOperatorGateConfigReady,
  missingBindOperatorGateConfig,
} from '../lib/tx-bind-operator-gate';
import type { GateBindingStatusResponse } from '../types/api.types';
import { useSponsoredTransaction } from './useSponsoredTransaction';

type BindStep = 'idle' | 'submitted' | 'indexed' | 'timeout' | 'error';

interface BindState {
  step: BindStep;
  digest: string | null;
  message: string | null;
  error: string | null;
}

export interface BindOperatorWorldGateArgs {
  gatePolicyId: string;
  gateAdminCapId: string;
  worldGateId: string;
}

const IDLE: BindState = { step: 'idle', digest: null, message: null, error: null };
const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 15;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^Error:\s*/i, '').slice(0, 180);
}

async function waitForBinding(gatePolicyId: string): Promise<GateBindingStatusResponse | null> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);
    try {
      const binding = await fetchGateBindingStatus(gatePolicyId);
      if (binding.bindingStatus === 'bound' || binding.bindingStatus === 'verified') {
        return binding;
      }
    } catch {
      // Indexer may not have processed yet; retry.
    }
  }
  return null;
}

export function useBindOperatorWorldGate(
  onIndexed?: (binding: GateBindingStatusResponse) => void,
) {
  const sponsored = useSponsoredTransaction();
  const [bindState, setBindState] = useState<BindState>(IDLE);

  const reset = useCallback(() => {
    sponsored.reset();
    setBindState(IDLE);
  }, [sponsored]);

  const bindWorldGate = useCallback(async (args: BindOperatorWorldGateArgs) => {
    if (!sponsored.account) {
      setBindState({ step: 'error', digest: null, message: null, error: 'Wallet not connected.' });
      return null;
    }

    if (!bindOperatorGateConfigReady()) {
      const missing = missingBindOperatorGateConfig().join(', ');
      setBindState({ step: 'error', digest: null, message: null, error: `Missing config: ${missing}` });
      return null;
    }

    const result = await sponsored.execute({
      build: () => buildBindOperatorGateTxKind({
        sender: sponsored.account!.address,
        gatePolicyId: args.gatePolicyId,
        gateAdminCapId: args.gateAdminCapId,
        worldGateId: args.worldGateId,
      }),
      gasBudget: 100_000_000,
      flow: 'bind_operator_world_gate',
    });

    if (result.step !== 'done' || !result.digest) {
      setBindState({
        step: 'error',
        digest: null,
        message: null,
        error: result.error ?? 'Binding transaction failed.',
      });
      return null;
    }

    setBindState({
      step: 'submitted',
      digest: result.digest,
      message: 'Binding transaction submitted. Waiting for indexer confirmation.',
      error: null,
    });

    try {
      const binding = await waitForBinding(args.gatePolicyId);
      if (!binding) {
        setBindState({
          step: 'timeout',
          digest: result.digest,
          message: 'Binding transaction submitted. Indexer confirmation is still pending.',
          error: null,
        });
        return null;
      }
      onIndexed?.(binding);
      setBindState({
        step: 'indexed',
        digest: result.digest,
        message: 'Binding indexed. API now reports BOUND.',
        error: null,
      });
      return binding;
    } catch (err) {
      setBindState({
        step: 'error',
        digest: result.digest,
        message: null,
        error: shortError(err),
      });
      return null;
    }
  }, [onIndexed, sponsored]);

  return {
    account: sponsored.account,
    bindState,
    reset,
    sponsoredState: sponsored.state,
    bindWorldGate,
  };
}
