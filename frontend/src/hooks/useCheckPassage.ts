// useCheckPassage -- Sponsored check_passage transaction hook.
//
// Lifecycle:
//   1. When a wallet is connected, immediately fetches the traveler's
//      TRIBE_STANDING attestation from the indexer.
//   2. checkPassage() builds the PTB, sends to gas station, asks wallet to
//      co-sign, and submits to chain.
//   3. On success, PassageGranted event is emitted on-chain and the indexer
//      picks it up into gate_passages within one polling cycle (~10s).

import { useCallback, useEffect, useState } from 'react';
import { fetchAttestations } from '../lib/api';
import { buildCheckPassageTxKind, checkPassageConfigReady, missingCheckPassageConfig } from '../lib/tx-check-passage';
import { useSponsoredTransaction } from './useSponsoredTransaction';

export interface CheckPassageArgs {
  /** Optional payment override in MIST. Defaults to 1n (returned for ALLY). */
  paymentMist?: bigint;
}

export function useCheckPassage() {
  const { account, execute, reset, state } = useSponsoredTransaction();

  const [attestationId, setAttestationId] = useState<string | null>(null);
  const [attestationLoading, setAttestationLoading] = useState(false);
  const [attestationError, setAttestationError] = useState<string | null>(null);

  const configReady = checkPassageConfigReady();
  const missingConfig = missingCheckPassageConfig();

  // Fetch the traveler's active TRIBE_STANDING attestation whenever the
  // connected account changes.
  useEffect(() => {
    if (!account) {
      setAttestationId(null);
      setAttestationError(null);
      setAttestationLoading(false);
      return;
    }

    let cancelled = false;
    setAttestationLoading(true);
    setAttestationError(null);

    fetchAttestations(account.address, { schema_id: 'TRIBE_STANDING', limit: 5 })
      .then(rows => {
        if (cancelled) return;
        // Prefer non-revoked rows; take the first one.
        const active = rows.find(r => !r.revoked) ?? null;
        setAttestationId(active?.attestation_id ?? null);
        setAttestationError(
          active
            ? null
            : 'No active TRIBE_STANDING attestation for this wallet. Run seed-tribe-standing.',
        );
      })
      .catch(err => {
        if (cancelled) return;
        setAttestationId(null);
        setAttestationError(err instanceof Error ? err.message : 'attestation fetch failed');
      })
      .finally(() => {
        if (!cancelled) setAttestationLoading(false);
      });

    return () => { cancelled = true; };
  }, [account?.address]);

  const checkPassage = useCallback(async (args: CheckPassageArgs = {}) => {
    if (!account) {
      throw new Error('Wallet not connected.');
    }
    if (!configReady) {
      throw new Error(`Missing env vars: ${missingConfig.join(', ')}`);
    }
    if (!attestationId) {
      throw new Error(attestationError ?? 'No TRIBE_STANDING attestation found.');
    }

    return execute({
      build: () => buildCheckPassageTxKind({
        sender:              account.address,
        attestationObjectId: attestationId,
        paymentMist:         args.paymentMist,
      }),
      gasBudget: 100_000_000,
      flow: 'check_passage',
    });
  }, [
    account,
    attestationError,
    attestationId,
    configReady,
    execute,
    missingConfig,
  ]);

  return {
    account,
    state,
    attestationId,
    attestationLoading,
    attestationError,
    configReady,
    missingConfig,
    checkPassage,
    reset,
  };
}
