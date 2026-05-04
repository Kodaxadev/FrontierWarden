import { useCallback } from 'react';
import {
  buildWalletAttestationTxKind,
  type BuildWalletAttestationArgs,
} from '../lib/tx-wallet-attestation';
import { useSponsoredTransaction, type SponsoredState } from './useSponsoredTransaction';

export type WalletAttestationStep = 'idle' | 'signing' | 'done' | 'error';

export interface WalletAttestationState {
  step: WalletAttestationStep;
  digest: string | null;
  error: string | null;
}

function bridgeState(s: SponsoredState): WalletAttestationState {
  const step: WalletAttestationStep =
    s.step === 'idle'  ? 'idle'  :
    s.step === 'done'  ? 'done'  :
    s.step === 'error' ? 'error' :
    'signing';
  return { step, digest: s.digest, error: s.error };
}

export function useWalletAttestationIssue() {
  const { account, execute, reset, state: sponsoredState } = useSponsoredTransaction();
  const state = bridgeState(sponsoredState);

  const issueAttestation = useCallback(async (args: BuildWalletAttestationArgs) => {
    if (!account) return;
    return execute({
      build: () => buildWalletAttestationTxKind({ ...args, sender: account.address }),
      gasBudget: 50_000_000,
    });
  }, [account, execute]);

  return { account, state, reset, issueAttestation };
}
