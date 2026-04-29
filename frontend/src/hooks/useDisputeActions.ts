import { useCallback, useState } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildCreateChallengeTx,
  buildResolveChallengeTx,
  buildVoteChallengeTx,
  disputeConfigReady,
  missingDisputeConfig,
  type CreateChallengeArgs,
  type ResolveChallengeArgs,
  type VoteChallengeArgs,
} from '../lib/tx-dispute';

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

export function useDisputeActions() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [state, setState] = useState<DisputeState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(async (build: () => ReturnType<typeof buildCreateChallengeTx>) => {
    if (!account) {
      const next = { step: 'error' as const, digest: null, error: 'Wallet not connected.' };
      setState(next);
      return next;
    }
    if (!disputeConfigReady()) {
      const next = {
        step: 'error' as const,
        digest: null,
        error: `Missing env vars: ${missingDisputeConfig().join(', ')}`,
      };
      setState(next);
      return next;
    }

    try {
      setState({ step: 'signing', digest: null, error: null });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: build() });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${result.FailedTransaction.digest}`);
      }
      const next = { step: 'done' as const, digest: result.Transaction.digest, error: null };
      setState(next);
      return next;
    } catch (err) {
      const next = { step: 'error' as const, digest: null, error: humanise(err) };
      setState(next);
      return next;
    }
  }, [account, dAppKit]);

  const createChallenge = useCallback(
    (args: CreateChallengeArgs) => execute(() => buildCreateChallengeTx(args)),
    [execute],
  );
  const voteChallenge = useCallback(
    (args: VoteChallengeArgs) => execute(() => buildVoteChallengeTx(args)),
    [execute],
  );
  const resolveChallenge = useCallback(
    (args: ResolveChallengeArgs) => execute(() => buildResolveChallengeTx(args)),
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
