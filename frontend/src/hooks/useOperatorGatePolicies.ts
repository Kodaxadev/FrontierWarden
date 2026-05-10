// useOperatorGatePolicies -- Discover all GateAdminCap objects owned by
// the connected operator wallet for the FrontierWarden package.
//
// Unlike useGateAdminCaps(gatePolicyId) which checks a single known
// GatePolicy, this hook discovers ALL GateAdminCap objects regardless
// of which GatePolicy they point to.
//
// Package distinction:
//   - Function calls target latest published-at package:
//     0x31199a56010e6177482b97fa18ddb391f55ac7049275396e98e6a1337cc283c1
//   - GateAdminCap type/origin package remains:
//     0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa::reputation_gate::GateAdminCap

import { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';

export interface OperatorGatePolicyEntry {
  gateAdminCapId: string;
  gatePolicyId: string;  // extracted from cap.gate_id
}

interface UseOperatorGatePoliciesResult {
  policies: OperatorGatePolicyEntry[];
  loading: boolean;
  error: string | null;
  hasAny: boolean;
}

const ORIGIN_PKG = '0xb43fcd4e383efcb9af8c6d7b621958153dd92876da0e769b2167c2ccf409abfa';
const GATE_ADMIN_CAP_TYPE = `${ORIGIN_PKG}::reputation_gate::GateAdminCap`;

const EMPTY: UseOperatorGatePoliciesResult = {
  policies: [],
  loading: false,
  error: null,
  hasAny: false,
};

interface OwnedObjectPage {
  objects: unknown[];
  hasNextPage: boolean;
  cursor: string | null;
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

function capFromObject(object: unknown): OperatorGatePolicyEntry | null {
  const data = object as { objectId?: unknown };
  if (typeof data.objectId !== 'string') return null;
  const fields = objectFields(object);
  const gateId = typeof fields.gate_id === 'string' ? fields.gate_id : null;
  if (!gateId) return null;
  return {
    gateAdminCapId: data.objectId,
    gatePolicyId: gateId,
  };
}

export function useOperatorGatePolicies(): UseOperatorGatePoliciesResult {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const [state, setState] = useState<UseOperatorGatePoliciesResult>(EMPTY);

  useEffect(() => {
    if (!account?.address || !client) {
      setState(EMPTY);
      return;
    }

    const owner = account.address;
    let cancelled = false;
    setState({ policies: [], loading: true, error: null, hasAny: false });

    async function load() {
      const allEntries: OperatorGatePolicyEntry[] = [];
      let cursor: string | null = null;

      do {
        const page = await client.core.listOwnedObjects({
          owner,
          type: GATE_ADMIN_CAP_TYPE,
          cursor,
          limit: 50,
          include: { json: true },
        }) as OwnedObjectPage;

        for (const obj of page.objects) {
          const entry = capFromObject(obj);
          if (entry) allEntries.push(entry);
        }

        cursor = page.hasNextPage ? page.cursor : null;
      } while (cursor);

      if (!cancelled) {
        setState({
          policies: allEntries,
          loading: false,
          error: null,
          hasAny: allEntries.length > 0,
        });
      }
    }

    load().catch(err => {
      if (cancelled) return;
      setState({
        policies: [],
        loading: false,
        error: err instanceof Error ? err.message : 'GateAdminCap query failed',
        hasAny: false,
      });
    });

    return () => { cancelled = true; };
  }, [account?.address, client]);

  return useMemo(() => state, [state]);
}
