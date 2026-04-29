export type TrustDecision = 'ALLOW_FREE' | 'ALLOW_TAXED' | 'DENY' | 'INSUFFICIENT_DATA';

export type TrustReason =
  | 'ALLOW_FREE'
  | 'ALLOW_TAXED'
  | 'DENY_SCORE_BELOW_THRESHOLD'
  | 'DENY_NO_STANDING_ATTESTATION'
  | 'DENY_GATE_PAUSED'
  | 'DENY_GATE_HOSTILE'
  | 'DENY_ATTESTATION_REVOKED'
  | 'DENY_ATTESTATION_EXPIRED'
  | 'ERROR_GATE_NOT_FOUND'
  | 'ERROR_UNSUPPORTED_ACTION';

export interface TrustEvaluateRequest {
  entity: string;
  action: 'gate_access' | string;
  context: {
    gateId: string;
    schemaId?: string;
  };
}

export interface TrustEvaluateResponse {
  decision: TrustDecision;
  allow: boolean;
  tollMultiplier: number | null;
  tollMist: number | null;
  confidence: number;
  reason: TrustReason;
  explanation: string;
  subject: string;
  gateId: string;
  score: number | null;
  threshold: number | null;
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
    gateId: string;
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
  fetcher?: typeof fetch;
}

export interface CradleGateRequest {
  player: string;
  gate: string;
  tribe?: string;
  schemaId?: string;
}

export function createTrustkit(options: TrustkitOptions) {
  const endpoint = options.endpoint.replace(/\/$/, '');
  const fetcher = options.fetcher ?? fetch;

  async function evaluateTrust(
    input: TrustEvaluateRequest,
  ): Promise<TrustEvaluateResponse> {
    const res = await fetcher(`${endpoint}/v1/trust/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Trust evaluation failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<TrustEvaluateResponse>;
  }

  async function evaluateCradleGateAccess(
    input: CradleGateRequest,
  ): Promise<TrustEvaluateResponse> {
    return evaluateTrust({
      entity: input.player,
      action: 'gate_access',
      context: {
        gateId: input.gate,
        schemaId: input.schemaId,
      },
    });
  }

  return { evaluateTrust, evaluateCradleGateAccess };
}
