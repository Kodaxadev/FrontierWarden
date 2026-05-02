import type { TrustEvaluateRequest, TrustEvaluateResponse } from '../types/api.types';

export interface TrustkitOptions {
  endpoint: string;
  apiKey?: string;
  fetcher?: typeof fetch;
}

export function createTrustkit(options: TrustkitOptions) {
  const endpoint = options.endpoint.replace(/\/$/, '');
  const fetcher = options.fetcher ?? fetch;
  const baseHeaders: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.apiKey) {
    baseHeaders['x-api-key'] = options.apiKey;
  }

  async function evaluate(
    input: TrustEvaluateRequest,
  ): Promise<TrustEvaluateResponse> {
    const res = await fetcher(`${endpoint}/v1/trust/evaluate`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Trust evaluation failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<TrustEvaluateResponse>;
  }

  async function evaluateGateAccess(
    input: { entity: string; gateId: string; schemaId?: string },
  ): Promise<TrustEvaluateResponse> {
    return evaluate({
      entity: input.entity,
      action: 'gate_access',
      context: {
        gateId: input.gateId,
        schemaId: input.schemaId,
      },
    });
  }

  async function evaluateCounterpartyRisk(
    input: { entity: string; schemaId?: string; minimumScore?: number },
  ): Promise<TrustEvaluateResponse> {
    return evaluate({
      entity: input.entity,
      action: 'counterparty_risk',
      context: {
        schemaId: input.schemaId,
        minimumScore: input.minimumScore,
      },
    });
  }

  return { evaluate, evaluateGateAccess, evaluateCounterpartyRisk };
}
