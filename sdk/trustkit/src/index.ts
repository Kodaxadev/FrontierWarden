export type TrustApiVersion = 'trust.v1';

export type TrustAction =
  | 'gate_access'
  | 'counterparty_risk';

export type TrustDecision =
  | 'ALLOW'
  | 'ALLOW_FREE'
  | 'ALLOW_TAXED'
  | 'DENY'
  | 'INSUFFICIENT_DATA'
  | 'REVIEW';

export type TrustReason =
  | 'ALLOW_FREE'
  | 'ALLOW_TAXED'
  | 'COUNTERPARTY_REQUIREMENTS_MET'
  | 'DENY_SCORE_BELOW_THRESHOLD'
  | 'DENY_NO_STANDING_ATTESTATION'
  | 'DENY_COUNTERPARTY_NO_SCORE'
  | 'DENY_COUNTERPARTY_SCORE_TOO_LOW'
  | 'ERROR_GATE_NOT_FOUND'
  | 'ERROR_UNSUPPORTED_ACTION';

export interface TrustEvaluateRequest {
  entity: string;
  action: TrustAction;
  context: {
    gateId?: string;
    schemaId?: string;
    minimumScore?: number;
  };
}

export interface TrustEvaluateResponse {
  apiVersion: TrustApiVersion;
  action: TrustAction;
  decision: TrustDecision;
  allow: boolean;
  confidence: number;
  reason: TrustReason;
  explanation: string;
  subject: string;
  score: number | null;
  threshold: number | null;
  gateId?: string;
  tollMultiplier?: number | null;
  tollMist?: number | null;
  requirements: {
    schema: string;
    threshold: number | null;
    minimumPassScore: number;
  };
  observed: {
    score: number | null;
    attestationId: string | null;
  };
  proof: {
    gateId?: string;
    subject: string;
    checkpoint: number | null;
    source: string;
    schemas: string[];
    attestationIds: string[];
    txDigests: string[];
    warnings: string[];
  };
}

export interface TrustkitOptions {
  endpoint: string;
  apiKey?: string;
  fetcher?: typeof fetch;
}

export interface GateAccessRequest {
  entity: string;
  gateId: string;
  schemaId?: string;
}

export interface CounterpartyRiskRequest {
  entity: string;
  schemaId?: string;
  minimumScore?: number;
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
    input: GateAccessRequest,
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
    input: CounterpartyRiskRequest,
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
