// useAuthorizeFWExtension -- Sponsored authorize_extension transaction hook.
//
// Executes the borrow_owner_cap -> authorize_extension<FrontierWardenAuth>
// -> return_owner_cap PTB for a tenant operator's owned world Gate.
//
// Authority boundary:
//   tx.setSender = operator address. Gas station pays gas but operator
//   signs and must be the Character's controlling wallet for borrow to succeed.
//
// After success, polls indexer for extension evidence. Only when the
// indexer confirms fw_extension_active does this report VERIFIED status.

import { useCallback, useState } from 'react';
import { fetchGateBindingStatus } from '../lib/api';
import {
  buildAuthorizeFWExtensionTxKind,
  authorizeFWExtensionConfigReady,
  missingAuthorizeFWExtensionConfig,
} from '../lib/tx-authorize-fw-extension';
import type { GateBindingStatusResponse } from '../types/api.types';
import { useSponsoredTransaction } from './useSponsoredTransaction';

type AuthorizeStep = 'idle' | 'submitted' | 'verified' | 'timeout' | 'error';

interface AuthorizeState {
  step: AuthorizeStep;
  digest: string | null;
  message: string | null;
  error: string | null;
}

export interface AuthorizeFWExtensionArgs {
  worldGateId: string;
  ownerCapId: string;
  characterId: string;
  gatePolicyId: string; // for polling binding status after authorization
}

const IDLE: AuthorizeState = { step: 'idle', digest: null, message: null, error: null };
const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 15;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function shortError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split('\n')[0].replace(/^Error:\s*/i, '').slice(0, 180);
}

async function waitForVerification(gatePolicyId: string): Promise<GateBindingStatusResponse | null> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);
    try {
      const binding = await fetchGateBindingStatus(gatePolicyId);
      if (binding.bindingStatus === 'verified' || binding.fwExtensionActive) {
        return binding;
      }
    } catch {
      // Indexer may not have processed yet; retry.
    }
  }
  return null;
}

export function useAuthorizeFWExtension(
  onVerified?: (binding: GateBindingStatusResponse) => void,
) {
  const sponsored = useSponsoredTransaction();
  const [authorizeState, setAuthorizeState] = useState<AuthorizeState>(IDLE);

  const reset = useCallback(() => {
    sponsored.reset();
    setAuthorizeState(IDLE);
  }, [sponsored]);

  const authorize = useCallback(async (args: AuthorizeFWExtensionArgs) => {
    if (!sponsored.account) {
      setAuthorizeState({ step: 'error', digest: null, message: null, error: 'Wallet not connected.' });
      return null;
    }

    if (!authorizeFWExtensionConfigReady()) {
      const missing = missingAuthorizeFWExtensionConfig().join(', ');
      setAuthorizeState({ step: 'error', digest: null, message: null, error: `Missing config: ${missing}` });
      return null;
    }

    const result = await sponsored.execute({
      build: () => buildAuthorizeFWExtensionTxKind({
        sender: sponsored.account!.address,
        worldGateId: args.worldGateId,
        ownerCapId: args.ownerCapId,
        characterId: args.characterId,
      }),
      gasBudget: 150_000_000,
      flow: 'authorize_fw_extension',
    });

    if (result.step !== 'done' || !result.digest) {
      setAuthorizeState({
        step: 'error',
        digest: null,
        message: null,
        error: result.error ?? 'Extension authorization failed.',
      });
      return null;
    }

    setAuthorizeState({
      step: 'submitted',
      digest: result.digest,
      message: 'Authorization transaction submitted. Waiting for indexer extension evidence.',
      error: null,
    });

    try {
      const binding = await waitForVerification(args.gatePolicyId);
      if (!binding) {
        setAuthorizeState({
          step: 'timeout',
          digest: result.digest,
          message: 'Authorization transaction submitted. Indexer extension evidence is still pending.',
          error: null,
        });
        return null;
      }
      onVerified?.(binding);
      setAuthorizeState({
        step: 'verified',
        digest: result.digest,
        message: 'BINDING VERIFIED. Extension authorization confirmed by indexer.',
        error: null,
      });
      return binding;
    } catch (err) {
      setAuthorizeState({
        step: 'error',
        digest: result.digest,
        message: null,
        error: shortError(err),
      });
      return null;
    }
  }, [onVerified, sponsored]);

  return {
    account: sponsored.account,
    authorizeState,
    reset,
    sponsoredState: sponsored.state,
    authorize,
  };
}
