import { useCallback, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildCreateChallengeTx,
  buildResolveChallengeTx,
  buildVoteChallengeTx,
  ChallengeNotFoundError,
  ChallengeNotSharedError,
  disputeConfigReady,
  missingDisputeConfig,
  type CreateChallengeArgs,
  type ResolveChallengeArgs,
  type VoteChallengeArgs,
} from '../lib/tx-dispute';
import { classifySponsoredError } from '../lib/sponsored-diagnostics';
import { makeActionRecorder, recordAction } from '../lib/fw-action-telemetry';

export type DisputeStep = 'idle' | 'signing' | 'done' | 'error';

export interface DisputeState {
  step: DisputeStep;
  digest: string | null;
  error: string | null;
}

const IDLE: DisputeState = { step: 'idle', digest: null, error: null };

function humanise(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const first = msg.split('\n')[0].replace(/^Error:\s*/i, '');
  return first.length > 180 ? `${first.slice(0, 180)}...` : first;
}

function walletName(wallet: unknown): string | null {
  const name = (wallet as { name?: unknown })?.name;
  return typeof name === 'string' ? name : null;
}

export function useDisputeActions() {
  const account = useCurrentAccount();
  const wallet  = useCurrentWallet();
  const dAppKit = useDAppKit();
  const [state, setState] = useState<DisputeState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async (label: string, build: () => Promise<ReturnType<typeof buildCreateChallengeTx>> | ReturnType<typeof buildCreateChallengeTx>) => {
    const wn = walletName(wallet);
    if (!account) {
      const ts = Date.now();
      recordAction({ ts, flow: 'direct', label, phase: 'started', walletName: wn });
      recordAction({ ts, flow: 'direct', label, phase: 'failed', errorClass: 'wallet_not_connected', walletName: wn });
      const next = { step: 'error' as const, digest: null, error: 'Wallet not connected.' };
      setState(next);
      return next;
    }
    if (!disputeConfigReady()) {
      const ts = Date.now();
      recordAction({ ts, flow: 'direct', label, phase: 'started', walletName: wn });
      recordAction({ ts, flow: 'direct', label, phase: 'failed', errorClass: 'config_missing', walletName: wn });
      const next = {
        step: 'error' as const,
        digest: null,
        error: `Missing env vars: ${missingDisputeConfig().join(', ')}`,
      };
      setState(next);
      return next;
    }
    const record = makeActionRecorder('direct', label, wn);
    record('started');
    try {
      setState({ step: 'signing', digest: null, error: null });
      const transaction = await build();
      record('build_ok');
      record('wallet_sign_requested');
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      record('wallet_sign_ok');
      if (result.$kind === 'FailedTransaction') {
        const msg = `Transaction failed: ${result.FailedTransaction.digest}`;
        record('execute_failed', classifySponsoredError(msg));
        record('failed', classifySponsoredError(msg));
        throw new Error(msg);
      }
      record('execute_ok');
      record('done');
      const next = { step: 'done' as const, digest: result.Transaction.digest, error: null };
      setState(next);
      return next;
    } catch (err) {
      const errorClass =
        err instanceof ChallengeNotSharedError ? 'challenge_not_shared' :
        err instanceof ChallengeNotFoundError ? 'challenge_not_found' :
        classifySponsoredError(humanise(err));
      const msg = err instanceof ChallengeNotSharedError || err instanceof ChallengeNotFoundError
        ? err.message
        : humanise(err);
      record('failed', errorClass);
      const next = { step: 'error' as const, digest: null, error: msg };
      setState(next);
      return next;
    }
  }, [account, dAppKit, wallet]);

  const createChallenge = useCallback(
    (args: CreateChallengeArgs) => execute('dispute-create', () => buildCreateChallengeTx(args)),
    [execute],
  );
  const voteChallenge = useCallback(
    (args: VoteChallengeArgs) => execute('dispute-vote', () => buildVoteChallengeTx(args)),
    [execute],
  );
  const resolveChallenge = useCallback(
    (args: ResolveChallengeArgs) => execute('dispute-resolve', () => buildResolveChallengeTx(args)),
    [execute],
  );

  return {
    account,
    createChallenge,
    reset,
    resolveChallenge,
    state,
    voteChallenge,
  };
}
