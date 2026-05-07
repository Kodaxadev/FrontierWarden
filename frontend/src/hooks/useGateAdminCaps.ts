import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';

export interface GateAdminCapSummary {
  objectId: string;
  gateId: string | null;
  owner: string | null;
  type: string;
}

interface GateAdminCapState {
  allCaps: GateAdminCapSummary[];
  loading: boolean;
  error: string | null;
}

interface OwnedObjectPage {
  objects: unknown[];
  hasNextPage: boolean;
  cursor: string | null;
}

const EMPTY: GateAdminCapState = {
  allCaps: [],
  loading: false,
  error: null,
};

function envPkgId(): string {
  return (import.meta.env as Record<string, string | undefined>).VITE_PKG_ID ?? '';
}

function normalize(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

function addressOwner(owner: unknown): string | null {
  if (!owner || typeof owner !== 'object') return null;
  const value = (owner as { AddressOwner?: unknown }).AddressOwner;
  return typeof value === 'string' ? value : null;
}

function objectFields(object: unknown): Record<string, unknown> {
  const direct = (object as { json?: unknown })?.json;
  if (direct && typeof direct === 'object') {
    return direct as Record<string, unknown>;
  }

  const content = (object as { content?: { fields?: unknown } })?.content;
  return content?.fields && typeof content.fields === 'object'
    ? content.fields as Record<string, unknown>
    : {};
}

function capFromObject(object: unknown): GateAdminCapSummary | null {
  const data = object as {
    objectId?: unknown;
    type?: unknown;
    owner?: unknown;
  };
  if (typeof data.objectId !== 'string' || typeof data.type !== 'string') {
    return null;
  }

  const fields = objectFields(object);
  const gateId = typeof fields.gate_id === 'string' ? fields.gate_id : null;

  return {
    objectId: data.objectId,
    gateId,
    owner: addressOwner(data.owner),
    type: data.type,
  };
}

export function useGateAdminCaps(gatePolicyId: string) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [state, setState] = useState<GateAdminCapState>(EMPTY);

  useEffect(() => {
    const packageId = envPkgId();
    if (!account?.address || !packageId) {
      setState(EMPTY);
      return;
    }

    const owner = account.address;
    let cancelled = false;
    setState({ allCaps: [], loading: true, error: null });

    async function load() {
      const type = `${packageId}::reputation_gate::GateAdminCap`;
      const allCaps: GateAdminCapSummary[] = [];
      let cursor: string | null = null;

      do {
        const page = await client.core.listOwnedObjects({
          owner,
          type,
          cursor,
          limit: 50,
          include: { json: true },
        }) as OwnedObjectPage;
        allCaps.push(...page.objects.map(capFromObject).filter(cap => cap != null));
        cursor = page.hasNextPage ? page.cursor : null;
      } while (cursor);

      if (!cancelled) setState({ allCaps, loading: false, error: null });
    }

    load().catch(err => {
      if (cancelled) return;
      setState({
        allCaps: [],
        loading: false,
        error: err instanceof Error ? err.message : 'GateAdminCap query failed',
      });
    });

    return () => { cancelled = true; };
  }, [account?.address, client, gatePolicyId]);

  const matchingCap = useMemo(
    () => state.allCaps.find(cap => normalize(cap.gateId) === normalize(gatePolicyId)) ?? null,
    [gatePolicyId, state.allCaps],
  );

  return {
    allCaps: state.allCaps,
    matchingCap,
    loading: state.loading,
    error: state.error,
    hasMatchingCap: matchingCap != null,
    walletAddress: account?.address ?? null,
  };
}
