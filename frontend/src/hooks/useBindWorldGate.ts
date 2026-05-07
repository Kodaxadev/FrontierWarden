import { useCallback, useState } from 'react';
import { fetchGateBindingStatus } from '../lib/api';
import { buildBindWorldGateTxKind } from '../lib/tx-bind-world-gate';
import type { GateBindingStatusResponse } from '../types/api.types';
import { useSponsoredTransaction } from './useSponsoredTransaction';

type BindStep = 'idle' | 'submitted' | 'indexed' | 'timeout' | 'error';

interface BindState {
  step: BindStep;
  digest: string | null;
  message: string | null;
  error: string | null;
}

interface BindWorldGateArgs {
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
    const binding = await fetchGateBindingStatus(gatePolicyId);
    if (binding.bindingStatus === 'bound' || binding.bindingStatus === 'verified') {
      return binding;
    }
  }
  return null;
}

export function useBindWorldGate(
  gatePolicyId: string,
  onIndexed?: (binding: GateBindingStatusResponse) => void,
) {
  const sponsored = useSponsoredTransaction();
  const [bindState, setBindState] = useState<BindState>(IDLE);

  const reset = useCallback(() => {
    sponsored.reset();
    setBindState(IDLE);
  }, [sponsored]);

  const bindWorldGate = useCallback(async (args: BindWorldGateArgs) => {
    if (!sponsored.account) {
      setBindState({ step: 'error', digest: null, message: null, error: 'Wallet not connected.' });
      return null;
    }

    const result = await sponsored.execute({
      build: () => buildBindWorldGateTxKind({
        sender: sponsored.account?.address ?? '',
        gateAdminCapId: args.gateAdminCapId,
        worldGateId: args.worldGateId,
      }),
      gasBudget: 100_000_000,
      flow: 'bind_world_gate',
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
      const binding = await waitForBinding(gatePolicyId);
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
        message: binding.bindingStatus === 'verified'
          ? 'Binding indexed. API now reports BINDING VERIFIED.'
          : 'Binding indexed. API now reports BOUND.',
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
  }, [gatePolicyId, onIndexed, sponsored]);

  return {
    account: sponsored.account,
    bindState,
    reset,
    sponsoredState: sponsored.state,
    bindWorldGate,
  };
}
