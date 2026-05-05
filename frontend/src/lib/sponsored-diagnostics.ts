export type SponsoredErrorClass =
  | 'build_kind_failed'
  | 'missing_attestation'
  | 'payment_coin_missing'
  | 'sponsor_api_failed'
  | 'sponsor_response_invalid'
  | 'transaction_from_sponsored_bytes_failed'
  | 'wallet_sign_rejected'
  | 'wallet_zk_proof_fetch_failed'
  | 'wallet_feature_missing'
  | 'execute_transaction_failed'
  | 'move_abort'
  | 'indexer_lag'
  | 'unknown_wallet_failure';

export interface SignTransactionInputSummary {
  transactionType: string;
  hasSender: boolean;
  senderMatchesWallet: boolean | null;
}

export interface SponsoredTrace {
  flow: string;
  traceId: string;
  walletName: string | null;
  walletAddress: string | null;
  walletFeatures: string[];
  step: string;
  txKindBytesType: string | null;
  txKindBytesLength: number | null;
  sponsorResponseKeys: string[];
  txBytesType: string | null;
  txBytesLength: number | null;
  sponsorSignatureType: string | null;
  signTransactionInput: SignTransactionInputSummary | null;
  executeResultKind: string | null;
  errorClass: SponsoredErrorClass | null;
  errorMessage: string | null;
}

export interface TraceWalletInput {
  flow: string;
  walletName: string | null;
  walletAddress: string | null;
  walletFeatures: string[];
}

export function createTraceId(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  const random = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `fw-${Date.now().toString(36)}-${random || Math.random().toString(36).slice(2, 10)}`;
}

export function createSponsoredTrace(input: TraceWalletInput): SponsoredTrace {
  return {
    flow: input.flow,
    traceId: createTraceId(),
    walletName: input.walletName,
    walletAddress: input.walletAddress,
    walletFeatures: input.walletFeatures,
    step: 'idle',
    txKindBytesType: null,
    txKindBytesLength: null,
    sponsorResponseKeys: [],
    txBytesType: null,
    txBytesLength: null,
    sponsorSignatureType: null,
    signTransactionInput: null,
    executeResultKind: null,
    errorClass: null,
    errorMessage: null,
  };
}

export function classifyBytes(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (typeof value === 'string') {
    if (/^[0-9a-fA-F]+$/.test(value)) return `hex-string(${value.length})`;
    if (/^[A-Za-z0-9+/=]+$/.test(value)) return `base64-string(${value.length})`;
    return `string(${value.length})`;
  }
  if (typeof value === 'object') return `object(keys: ${Object.keys(value as object).join(',')})`;
  return typeof value;
}

export function byteLength(value: unknown): number | null {
  if (value instanceof Uint8Array) return value.length;
  if (typeof value === 'string') return value.length;
  return null;
}

export function classifySponsoredError(message: string): SponsoredErrorClass {
  const lower = message.toLowerCase();
  if (message.includes('Failed to fetch ZK proof')) return 'wallet_zk_proof_fetch_failed';
  if (lower.includes('user rejected') || lower.includes('rejected') || lower.includes('denied')) {
    return 'wallet_sign_rejected';
  }
  if (lower.includes('wallet') && (lower.includes('feature') || lower.includes('unsupported'))) {
    return 'wallet_feature_missing';
  }
  if (lower.includes('no signature returned')) return 'wallet_feature_missing';
  if (lower.includes('sponsor_response_invalid')) return 'sponsor_response_invalid';
  if (lower.includes('sponsor_api_failed')) return 'sponsor_api_failed';
  if (lower.includes('transaction_from_sponsored_bytes_failed')) {
    return 'transaction_from_sponsored_bytes_failed';
  }
  if (lower.includes('moveabort') || lower.includes('move abort')) return 'move_abort';
  if (lower.includes('execute_transaction_failed')) return 'execute_transaction_failed';
  if (lower.includes('no active tribe_standing') || lower.includes('no tribe_standing')) {
    return 'missing_attestation';
  }
  if (lower.includes('no traveler-owned sui coin')) return 'payment_coin_missing';
  if (lower.includes('building') || lower.includes('build')) return 'build_kind_failed';
  return 'unknown_wallet_failure';
}

export function validateSponsorResponse(value: unknown): value is {
  txBytes: string;
  sponsorSignature: string;
} {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.txBytes === 'string'
    && candidate.txBytes.length > 0
    && typeof candidate.sponsorSignature === 'string'
    && candidate.sponsorSignature.length > 0;
}

export function sanitizeTrace(trace: SponsoredTrace): SponsoredTrace {
  return {
    ...trace,
    sponsorSignatureType: trace.sponsorSignatureType,
    txKindBytesType: trace.txKindBytesType,
    txBytesType: trace.txBytesType,
  };
}
