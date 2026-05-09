import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  discoverOperatorGateAuthority,
  EMPTY_CONNECTED_AUTHORITY,
  WALLET_NOT_CONNECTED_AUTHORITY,
} from "../lib/operator-gate-authority";
import type {
  OperatorGateAuthorityState,
  OperatorGateAuthorityStatus,
  OperatorPlayerProfileCandidate,
  OperatorCharacterCandidate,
  OperatorGateOwnerCapCandidate,
  OperatorGateCandidate,
} from "../lib/operator-gate-authority";

export type {
  OperatorGateAuthorityStatus,
  OperatorPlayerProfileCandidate,
  OperatorCharacterCandidate,
  OperatorGateOwnerCapCandidate,
  OperatorGateCandidate,
};

export interface OperatorGateAuthorityHookState extends OperatorGateAuthorityState {
  playerProfileId: string | null;
  characterId: string | null;
  characterName: string | null;
  characterWallet: string | null;
  isLoading: boolean;
}

function withPrimaryFields(
  state: OperatorGateAuthorityState,
): OperatorGateAuthorityHookState {
  const primaryCharacter = state.characters[0] ?? null;
  const primaryProfile = state.playerProfiles[0] ?? null;

  return {
    ...state,
    playerProfileId: primaryProfile?.objectId ?? null,
    characterId:
      primaryCharacter?.objectId ?? primaryProfile?.characterId ?? null,
    characterName: primaryCharacter?.name ?? null,
    characterWallet: primaryCharacter?.characterWallet ?? null,
    isLoading:
      state.status === "checking_character" ||
      state.status === "checking_gate_caps",
  };
}

function queryFailedState(
  walletAddress: string,
  err: unknown,
): OperatorGateAuthorityState {
  return {
    ...EMPTY_CONNECTED_AUTHORITY,
    status: "query_failed",
    walletAddress,
    errors: [
      err instanceof Error
        ? err.message
        : "operator gate authority query failed",
    ],
  };
}

export function useOperatorGateAuthority(): OperatorGateAuthorityHookState {
  const account = useCurrentAccount();
  const [state, setState] = useState<OperatorGateAuthorityState>(
    WALLET_NOT_CONNECTED_AUTHORITY,
  );

  useEffect(() => {
    if (!account?.address) {
      setState(WALLET_NOT_CONNECTED_AUTHORITY);
      return;
    }

    let cancelled = false;
    const walletAddress = account.address;
    setState({
      ...EMPTY_CONNECTED_AUTHORITY,
      status: "checking_character",
      walletAddress,
    });

    discoverOperatorGateAuthority(walletAddress, (progressState) => {
      if (!cancelled) setState(progressState);
    })
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch((err) => {
        if (!cancelled) setState(queryFailedState(walletAddress, err));
      });

    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  return useMemo(() => withPrimaryFields(state), [state]);
}
